/**
 * Reel triage: turn saved short-form videos into a reviewable shortlist.
 *
 * For every Notion row with Status = "New":
 *   1. pull metadata + audio with yt-dlp
 *   2. transcribe locally with faster-whisper (transcribe.py)
 *   3. ask Claude for a summary, a 1-10 rating, a verdict and concrete uses
 *   4. write it all back to the row and flip Status to "Triaged"
 *
 * A row that fails is marked "Failed" with the reason, never dropped silently.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const Anthropic = require('@anthropic-ai/sdk');

const execFileAsync = promisify(execFile);

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_TRIAGE_DB_ID = process.env.NOTION_TRIAGE_DB_ID;
const MODEL = process.env.TRIAGE_MODEL || 'claude-opus-5';
const MAX_ITEMS = parseInt(process.env.TRIAGE_MAX_ITEMS || '10', 10);
// The fact sheet was renamed to _apg-facts.md when it became the blog engine's
// single source of truth; keep the old name as a fallback so this works on
// either revision rather than silently rating without business context.
const FACTS_PATHS = [
  path.join(__dirname, '..', '..', 'scripts', '_apg-facts.md'),
  path.join(__dirname, '..', '..', 'scripts', 'apg-facts.md')
];

// Notion caps a single rich_text object at 2000 characters.
const NOTION_TEXT_LIMIT = 1900;

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    one_liner: { type: 'string', description: 'One sentence: what this video actually says.' },
    summary: { type: 'string', description: '3-5 sentences covering the substance, not the hook.' },
    key_points: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' }, description: '2-5 short topic tags.' },
    rating: { type: 'integer', description: 'Usefulness to APG, 1 (ignore) to 10 (act on this week).' },
    rating_rationale: { type: 'string' },
    verdict: { type: 'string', enum: ['Pursue', 'Maybe', 'Skip'] },
    use_for: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete ways APG could use this, e.g. "Client onboarding email", "Reel hook formula".'
    },
    action_items: { type: 'array', items: { type: 'string' }, description: 'Next steps if pursued.' },
    risks: { type: 'array', items: { type: 'string' }, description: 'Reasons this might not work for APG. Empty if none.' }
  },
  required: [
    'one_liner', 'summary', 'key_points', 'topics', 'rating',
    'rating_rationale', 'verdict', 'use_for', 'action_items', 'risks'
  ],
  additionalProperties: false
};

// ---------------------------------------------------------------- Notion

async function notionFetch(url, options) {
  const res = await fetch(url, Object.assign({}, options, {
    headers: Object.assign({
      Authorization: 'Bearer ' + NOTION_API_KEY,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    }, (options || {}).headers)
  }));
  const body = await res.json();
  if (!res.ok) {
    throw new Error('Notion ' + res.status + ': ' + (body.message || JSON.stringify(body)));
  }
  return body;
}

async function fetchQueue() {
  const data = await notionFetch('https://api.notion.com/v1/databases/' + NOTION_TRIAGE_DB_ID + '/query', {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Status', select: { equals: 'New' } },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      page_size: MAX_ITEMS
    })
  });
  return data.results.map(function (page) {
    const props = page.properties || {};
    return {
      pageId: page.id,
      url: findUrl(props),
      note: plainText(props['My Note'])
    };
  });
}

/**
 * Prefer the "URL" property, but fall back to any url-typed property. Notion
 * namespaces a user property that collides with a built-in field name, so the
 * key is not guaranteed to be exactly "URL".
 */
function findUrl(props) {
  if (props.URL && props.URL.url) return props.URL.url;
  const key = Object.keys(props).find(function (k) {
    return props[k] && props[k].type === 'url' && props[k].url;
  });
  return key ? props[key].url : null;
}

function plainText(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return prop.rich_text.map(function (t) { return t.plain_text; }).join('');
}

function textProp(value) {
  // An empty rich_text array is how Notion represents "clear this property";
  // a block with an empty content string is rejected.
  const content = truncate(value || '', NOTION_TEXT_LIMIT);
  return { rich_text: content ? [{ text: { content: content } }] : [] };
}

function multiSelect(values) {
  // Notion rejects commas inside multi-select option names.
  const seen = new Set();
  const options = [];
  (values || []).forEach(function (v) {
    const name = String(v).replace(/,/g, ' ').trim().slice(0, 100);
    if (name && !seen.has(name)) { seen.add(name); options.push({ name: name }); }
  });
  return { multi_select: options.slice(0, 10) };
}

function truncate(str, limit) {
  return str.length > limit ? str.slice(0, limit - 1) + '…' : str;
}

function chunk(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

function heading(text) {
  return {
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: [{ text: { content: text } }] }
  };
}

function paragraph(text) {
  return {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: text } }] }
  };
}

function bullets(items) {
  return (items || []).map(function (item) {
    return {
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ text: { content: truncate(String(item), NOTION_TEXT_LIMIT) } }] }
    };
  });
}

async function appendBlocks(pageId, blocks) {
  // Notion accepts at most 100 children per request.
  for (let i = 0; i < blocks.length; i += 100) {
    await notionFetch('https://api.notion.com/v1/blocks/' + pageId + '/children', {
      method: 'PATCH',
      body: JSON.stringify({ children: blocks.slice(i, i + 100) })
    });
  }
}

async function updatePage(pageId, properties) {
  await notionFetch('https://api.notion.com/v1/pages/' + pageId, {
    method: 'PATCH',
    body: JSON.stringify({ properties: properties })
  });
}

// ---------------------------------------------------------------- yt-dlp

/**
 * Instagram serves very little to logged-out clients, and blocks datacenter IPs
 * harder still. Exporting browser cookies to a Netscape cookies.txt and pointing
 * YTDLP_COOKIES_FILE at it is what makes this work off a CI runner.
 */
function ytdlpArgs(extra) {
  const base = ['--no-warnings'];
  const cookies = process.env.YTDLP_COOKIES_FILE;
  if (cookies && fs.existsSync(cookies)) base.push('--cookies', cookies);
  return base.concat(extra);
}

async function videoMetadata(url) {
  const { stdout } = await execFileAsync('yt-dlp', ytdlpArgs(['--dump-single-json', url]), {
    maxBuffer: 32 * 1024 * 1024
  });
  const info = JSON.parse(stdout);
  return {
    title: info.title || info.description || 'Untitled',
    creator: info.uploader || info.channel || info.uploader_id || '',
    duration: typeof info.duration === 'number' ? Math.round(info.duration) : null,
    description: info.description || ''
  };
}

async function downloadAudio(url, workDir) {
  const template = path.join(workDir, 'audio.%(ext)s');
  await execFileAsync('yt-dlp', ytdlpArgs([
    '-x', '--audio-format', 'mp3', '--audio-quality', '5',
    '-o', template, url
  ]), { maxBuffer: 32 * 1024 * 1024 });

  const found = fs.readdirSync(workDir).find(function (f) { return f.startsWith('audio.'); });
  if (!found) throw new Error('yt-dlp produced no audio file');
  return path.join(workDir, found);
}

async function transcribe(audioPath) {
  const { stdout } = await execFileAsync('python3', [path.join(__dirname, 'transcribe.py'), audioPath], {
    maxBuffer: 32 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout);
  if (!parsed.text) throw new Error('Transcription returned no text (silent or music-only video?)');
  return parsed.text;
}

// ---------------------------------------------------------------- Claude

function loadFacts(paths) {
  for (const candidate of (paths || FACTS_PATHS)) {
    try {
      return fs.readFileSync(candidate, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  // Loud, because ratings grounded in APG's real offer are the point of this.
  console.warn('APG facts not found at ' + (paths || FACTS_PATHS).join(' or ') +
    '; rating without business context.');
  return '(No business context file available.)';
}

async function analyze(client, facts, meta, transcript, note) {
  const system = [
    'You triage short-form video that Dave O\'Gara saved while researching. He runs APodcastGeek (APG), ' +
    'a done-for-you B2B podcast production agency.',
    '',
    'Judge every video by one question: is this useful to APG? A polished video with nothing actionable ' +
    'rates low. A rough video with one tactic Dave could apply this month rates high. Rate honestly - ' +
    'most saved content is a 4-6, and telling him something is a Skip is more valuable than inflating it.',
    '',
    'Rating scale: 1-3 Skip (no applicable value), 4-6 Maybe (interesting, no clear next step), ' +
    '7-8 Pursue (a concrete tactic worth testing), 9-10 Pursue now (directly applicable to a live APG offer).',
    '',
    'Ground "use_for" in what APG actually sells - never invent services APG does not offer.',
    '',
    '=== APG BUSINESS CONTEXT ===',
    facts
  ].join('\n');

  const parts = [
    'VIDEO: ' + meta.title,
    meta.creator ? 'CREATOR: ' + meta.creator : '',
    meta.duration ? 'DURATION: ' + meta.duration + 's' : '',
    note ? 'DAVE\'S NOTE WHEN HE SAVED IT: ' + note : '',
    '',
    '=== TRANSCRIPT ===',
    transcript,
    meta.description ? '\n=== CAPTION ===\n' + meta.description.slice(0, 2000) : ''
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: parts }],
    output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } }
  });

  const block = response.content.find(function (b) { return b.type === 'text'; });
  if (!block) throw new Error('Claude returned no text block (stop_reason: ' + response.stop_reason + ')');
  return JSON.parse(block.text);
}

// ---------------------------------------------------------------- pipeline

function clampRating(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, n));
}

async function processOne(client, facts, item) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  try {
    console.log('  fetching metadata...');
    const meta = await videoMetadata(item.url);

    console.log('  downloading audio: ' + meta.title);
    const audioPath = await downloadAudio(item.url, workDir);

    console.log('  transcribing...');
    const transcript = await transcribe(audioPath);

    console.log('  analysing (' + transcript.length + ' chars)...');
    const analysis = await analyze(client, facts, meta, transcript, item.note);
    const rating = clampRating(analysis.rating);

    await updatePage(item.pageId, {
      Name: { title: [{ text: { content: truncate(meta.title, NOTION_TEXT_LIMIT) } }] },
      Status: { select: { name: 'Triaged' } },
      Rating: { number: rating },
      Verdict: { select: { name: analysis.verdict } },
      Creator: textProp(meta.creator),
      Summary: textProp(analysis.summary),
      Topics: multiSelect(analysis.topics),
      'Use For': multiSelect(analysis.use_for),
      Duration: { number: meta.duration },
      Error: textProp('')
    });

    const blocks = [
      paragraph(analysis.one_liner),
      heading('Why ' + rating + '/10 - ' + analysis.verdict),
      paragraph(analysis.rating_rationale),
      heading('Key points')
    ]
      .concat(bullets(analysis.key_points))
      .concat([heading('What APG could use it for')])
      .concat(bullets(analysis.use_for))
      .concat([heading('Next steps')])
      .concat(bullets(analysis.action_items));

    if (analysis.risks && analysis.risks.length) {
      blocks.push(heading('Watch out for'));
      blocks.push.apply(blocks, bullets(analysis.risks));
    }

    blocks.push(heading('Transcript'));
    chunk(transcript, NOTION_TEXT_LIMIT).forEach(function (part) { blocks.push(paragraph(part)); });

    await appendBlocks(item.pageId, blocks);
    console.log('  done: ' + rating + '/10 ' + analysis.verdict);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function markFailed(pageId, err) {
  try {
    await updatePage(pageId, {
      Status: { select: { name: 'Failed' } },
      Error: textProp(err.message || String(err))
    });
  } catch (e) {
    console.error('  could not record failure in Notion:', e.message);
  }
}

async function main() {
  if (!NOTION_API_KEY) throw new Error('NOTION_API_KEY is not set');
  if (!NOTION_TRIAGE_DB_ID) throw new Error('NOTION_TRIAGE_DB_ID is not set');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic();
  const facts = loadFacts();

  const queue = await fetchQueue();
  if (!queue.length) {
    console.log('Nothing new to triage.');
    return;
  }
  console.log('Triaging ' + queue.length + ' video(s) with ' + MODEL + '.');

  let ok = 0;
  let failed = 0;
  for (const item of queue) {
    console.log('\n' + item.url);
    if (!item.url) {
      await markFailed(item.pageId, new Error('Row has no URL'));
      failed++;
      continue;
    }
    try {
      await processOne(client, facts, item);
      ok++;
    } catch (err) {
      console.error('  failed: ' + err.message);
      await markFailed(item.pageId, err);
      failed++;
    }
  }

  console.log('\nTriaged ' + ok + ', failed ' + failed + '.');
  if (ok === 0 && failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { truncate, chunk, multiSelect, clampRating, textProp, findUrl, loadFacts, FACTS_PATHS, ANALYSIS_SCHEMA };
