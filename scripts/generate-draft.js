const fs = require('fs');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID || '33388a120cc88069aba2fff072cc8b3d';

async function generateNewBrief(existingTitles, previousBriefs) {
  var existingKeywords = previousBriefs.map(function(b) { return b.keyword; });
  var existingTopics = existingTitles.concat(previousBriefs.map(function(b) { return b.title_suggestion; }));

  var briefPrompt = 'You are an SEO strategist for APodcastGeek, a B2B podcast production agency in Dublin, Ireland. They offer done-for-you podcast production under "The APG Brand Builder".\n\n' +
    'Generate ONE new blog post brief that has NOT been covered yet.\n\n' +
    'ALREADY COVERED (do NOT repeat these topics or keywords):\n' +
    existingTopics.map(function(t) { return '- ' + t; }).join('\n') + '\n\n' +
    'ALREADY USED KEYWORDS:\n' +
    existingKeywords.map(function(k) { return '- ' + k; }).join('\n') + '\n\n' +
    'THE BRIEF MUST:\n' +
    '- Target a specific long-tail SEO keyword relevant to B2B podcast production\n' +
    '- Be a topic that B2B founders would search for\n' +
    '- Include APG\'s original data points where relevant (10% guest-to-client conversion rate, Irish Podcast Award winners, done-for-you production including video, audio, 6 clips, 3 thumbnails, trailer, show notes, SEO article per episode)\n' +
    '- Specify a tag from: B2B Strategy, Podcast Production, Guest Recruitment, Monetisation, Industry Insights\n' +
    '- Be 1800-2500 words when written\n\n' +
    'RESPOND IN EXACTLY THIS JSON FORMAT (no markdown, no code blocks, just raw JSON):\n' +
    '{"keyword":"target keyword","title_suggestion":"suggested title","tag":"tag name","brief":"detailed writing brief including what to cover, data points to include, and internal links to use","data_points":["point 1","point 2"],"internal_links":["/#section-id"],"embed_videos":[]}';

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: briefPrompt }]
    })
  });

  var data = await res.json();
  if (!data.content || !data.content[0]) {
    console.error('Failed to generate new brief:', JSON.stringify(data));
    return null;
  }

  var responseText = data.content[0].text.trim();
  // Strip markdown code blocks if present
  responseText = responseText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');

  try {
    var newBrief = JSON.parse(responseText);
    newBrief.week = previousBriefs.length + 1;
    if (!newBrief.embed_videos) newBrief.embed_videos = [];
    if (!newBrief.internal_links) newBrief.internal_links = ['/#process-heading'];
    if (!newBrief.data_points) newBrief.data_points = [];
    console.log('Auto-generated new brief: ' + newBrief.keyword);
    return newBrief;
  } catch (e) {
    console.error('Failed to parse new brief JSON:', responseText);
    return null;
  }
}

async function main() {
  var DRAFTS_PER_BATCH = 5;

  // Load content calendar
  const calendar = JSON.parse(fs.readFileSync('scripts/content-calendar.json', 'utf-8'));

  // Get existing posts from Notion
  const notionRes = await fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID + '/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + NOTION_API_KEY,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ page_size: 100 })
  });
  const notionData = await notionRes.json();
  const existingTitles = (notionData.results || [])
    .map(function(p) { return (p.properties && p.properties.Name && p.properties.Name.title && p.properties.Name.title[0] && p.properties.Name.title[0].plain_text) || ''; })
    .filter(Boolean)
    .map(function(t) { return t.toLowerCase(); });

  var draftsCreated = 0;
  var usedWeeks = [];

  for (var batchNum = 0; batchNum < DRAFTS_PER_BATCH; batchNum++) {

  // Rate limit: wait 65 seconds between drafts to stay under 4000 tokens/minute
  if (batchNum > 0) {
    console.log('Waiting 65 seconds for rate limit...');
    await new Promise(function(r) { setTimeout(r, 65000); });
  }

  // Find next unwritten brief
  var brief = null;
  for (var i = 0; i < calendar.length; i++) {
    var item = calendar[i];
    var titleLower = item.title_suggestion.toLowerCase();
    // Extract core words from keyword (drop short modifiers like B2B, UK, US, EU)
    var keywordWords = item.keyword.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; });
    var alreadyExists = existingTitles.some(function(t) {
      // Check if most core keyword words appear in an existing title
      var matchCount = keywordWords.filter(function(w) { return t.indexOf(w) !== -1; }).length;
      return matchCount >= Math.max(2, Math.ceil(keywordWords.length * 0.6)) || t === titleLower || titleLower.indexOf(t) !== -1;
    });
    // Also check if this calendar week was already used in this batch
    if (!alreadyExists && usedWeeks.indexOf(item.week) !== -1) {
      alreadyExists = true;
    }
    if (!alreadyExists) {
      brief = item;
      usedWeeks.push(item.week);
      break;
    }
  }

  if (!brief) {
    console.log('All calendar briefs used. Auto-generating new briefs...');
    brief = await generateNewBrief(existingTitles, calendar);
    if (!brief) {
      console.log('Failed to generate new brief.');
      return;
    }
  }

  console.log('Generating draft for week ' + brief.week + ': ' + brief.keyword);

  // Build prompt
  var videoEmbeds = '';
  if (brief.embed_videos && brief.embed_videos.length > 0) {
    videoEmbeds = 'EMBED THESE WISTIA VIDEOS (use this exact HTML):\n' +
      brief.embed_videos.map(function(id) {
        return '<div style="margin:2rem 0"><div class="wistia_embed wistia_async_' + id + ' videoFoam=true" style="width:100%;max-width:640px;aspect-ratio:16/9;margin:0 auto"></div></div>';
      }).join('\n');
  }

  var internalLinks = brief.internal_links.map(function(l) { return '- https://apodcastgeek.com' + l; }).join('\n');
  var dataPoints = brief.data_points.map(function(d) { return '- ' + d; }).join('\n');

  var todayDate = new Date().toISOString().split('T')[0];
  var currentYear = String(new Date().getFullYear());

  var prompt = 'CURRENT DATE CONTEXT: Today is ' + todayDate + '. The current year is ' + currentYear + '. Write the article as if it is being published this week. When you need to reference "this year" or use a year in the title or any forward-looking statement, use ' + currentYear + '. Do NOT use 2024, 2023, or any earlier year as "current" or "this year" - those are in the past.\n\n' +
    'You are writing a blog post for APodcastGeek (apodcastgeek.com), Ireland\'s award-winning B2B podcast production agency based in Dublin. The agency offers done-for-you podcast production under "The APG Brand Builder" service.\n\n' +
    'BRIEF:\n' + brief.brief + '\n\n' +
    'ORIGINAL DATA POINTS TO INCLUDE:\n' + dataPoints + '\n\n' +
    'INTERNAL PAGES TO LINK TO:\n' + internalLinks + '\n\n' +
    videoEmbeds + '\n\n' +
    'WRITING RULES:\n' +
    '- Word count: 2500-3500 words (longer, more substantive than before)\n' +
    '- No em dashes ever\n' +
    '- No exclamation marks\n' +
    '- No filler words or fluff\n' +
    '- Direct, authoritative, professional tone\n' +
    '- Write from "we" perspective as APodcastGeek\n' +
    '- Use data and specifics, not vague claims\n' +
    '- Every section should be actionable\n' +
    '- Minimum 6 H2 sections for structure and a scannable table of contents\n' +
    '- Include external links to authoritative sources (HBR, Forbes, industry reports) where relevant\n' +
    '- End with a CTA to book a strategy call at https://calendly.com/apodcastgeek_dave/apg-brand-builder-discovery-call\n\n' +
    'CONTENT ENHANCEMENT MARKERS (use these exactly, they render as branded visual elements):\n' +
    '- Include 1-2 branded insight callouts using this format: [CALLOUT]APG Insight: <one or two sentences with a key takeaway or contrarian point>[/CALLOUT]\n' +
    '- Include exactly 1 stat highlight for your most important data point using this format: [STAT:10%]What one in ten guests becoming customers looks like in pipeline[/STAT] (replace 10% with any number and customise the label)\n' +
    '- Include exactly 1 pull quote for your strongest line using this format: [PULLQUOTE]Your most quotable sentence from the article.[/PULLQUOTE]\n' +
    '- Place these strategically within the article, not all at the top. The STAT and PULLQUOTE should appear in the middle third. CALLOUTS can appear between sections.\n\n' +
    'FORMAT YOUR RESPONSE EXACTLY AS:\n' +
    'TITLE: [title]\n' +
    'SLUG: [slug]\n' +
    'DESCRIPTION: [meta description, 150-160 characters]\n' +
    'TAG: [' + brief.tag + ']\n' +
    '---\n' +
    '[full article content in HTML using h2, h3, p, ul, li, blockquote, a tags. Do NOT include h1. Include the Wistia embed HTML where contextually relevant. Include internal links as <a href="url">anchor text</a>. Use the CALLOUT, STAT, and PULLQUOTE markers described above.]';

  // Generate with Claude (with retry on rate limit)
  var claudeData = null;
  for (var attempt = 0; attempt < 3; attempt++) {
    var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    claudeData = await claudeRes.json();

    if (claudeData.content && claudeData.content[0]) break;

    if (claudeData.error && claudeData.error.type === 'rate_limit_error') {
      console.log('Rate limited, waiting 90 seconds before retry ' + (attempt + 2) + '/3...');
      await new Promise(function(r) { setTimeout(r, 90000); });
    } else {
      console.error('Claude API error:', JSON.stringify(claudeData));
      process.exit(1);
    }
  }

  if (!claudeData.content || !claudeData.content[0]) {
    console.error('Claude API failed after 3 retries:', JSON.stringify(claudeData));
    process.exit(1);
  }

  var response = claudeData.content[0].text;

  // Parse response
  var titleMatch = response.match(/TITLE:\s*(.+)/);
  var slugMatch = response.match(/SLUG:\s*(.+)/);
  var descMatch = response.match(/DESCRIPTION:\s*(.+)/);
  var tagMatch = response.match(/TAG:\s*(.+)/);
  var contentParts = response.split('---\n');
  var content = contentParts.length > 1 ? contentParts.slice(1).join('---\n').trim() : '';

  if (!titleMatch || !slugMatch || !content) {
    console.error('Failed to parse AI response');
    console.error('Response:', response.substring(0, 500));
    process.exit(1);
  }

  var title = titleMatch[1].trim();
  var slug = slugMatch[1].trim();
  var description = descMatch ? descMatch[1].trim() : '';
  var tag = tagMatch ? tagMatch[1].trim() : brief.tag;
  var today = new Date().toISOString().split('T')[0];

  // Split content into chunks for Notion's 2000 char block limit
  var chunks = [];
  var remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= 1900) {
      chunks.push(remaining);
      break;
    }
    var cutPoint = remaining.lastIndexOf(' ', 1900);
    if (cutPoint === -1) cutPoint = 1900;
    chunks.push(remaining.substring(0, cutPoint));
    remaining = remaining.substring(cutPoint + 1);
  }

  var children = chunks.map(function(chunk) {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
    };
  });

  // Create Notion page (without content first)
  var createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + NOTION_API_KEY,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        Slug: { rich_text: [{ text: { content: slug } }] },
        Description: { rich_text: [{ text: { content: description } }] },
        Tag: { rich_text: [{ text: { content: tag } }] },
        Status: { select: { name: 'Draft' } },
        Author: { select: { name: 'APodcastGeek' } },
        'Publish Date': { rich_text: [{ text: { content: today } }] }
      }
    })
  });

  if (!createRes.ok) {
    var err = await createRes.json();
    console.error('Notion page creation error:', JSON.stringify(err));
    process.exit(1);
  }

  var pageData = await createRes.json();
  var pageId = pageData.id;

  // Append content blocks in batches (Notion allows max 100 blocks per append)
  for (var i = 0; i < children.length; i += 50) {
    var batch = children.slice(i, i + 50);
    var appendRes = await fetch('https://api.notion.com/v1/blocks/' + pageId + '/children', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + NOTION_API_KEY,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ children: batch })
    });
    if (!appendRes.ok) {
      var appendErr = await appendRes.json();
      console.error('Notion append error (batch ' + i + '):', JSON.stringify(appendErr));
    }
  }

  var notionUrl = 'https://www.notion.so/' + pageId.replace(/-/g, '');
  console.log('Draft ' + (batchNum + 1) + '/' + DRAFTS_PER_BATCH + ' created: ' + title);
  console.log('Content: ' + children.length + ' blocks, ' + content.length + ' chars total');

  // Add to existing titles so next iteration doesn't pick same topic
  existingTitles.push(title.toLowerCase());
  draftsCreated++;

  // Notify via Slack
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: '*New Blog Draft ' + draftsCreated + '/' + DRAFTS_PER_BATCH + ' Ready for Review*\n\n*Title:* ' + title + '\n*Keyword:* ' + brief.keyword + '\n*Tag:* ' + tag + '\n\n<' + notionUrl + '|Open in Notion>\n\nReview it, edit if needed, set Status to Published and add a Publish Date. It will go live automatically at 6am on that date.'
    })
  });

  } // end batch loop

  console.log('Batch complete: ' + draftsCreated + ' drafts created');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
