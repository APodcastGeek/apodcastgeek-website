const fs = require('fs');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID || '33388a120cc88069aba2fff072cc8b3d';

async function main() {
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

  // Find next unwritten brief
  var brief = null;
  for (var i = 0; i < calendar.length; i++) {
    var item = calendar[i];
    var titleLower = item.title_suggestion.toLowerCase();
    var alreadyExists = existingTitles.some(function(t) {
      return t.indexOf(item.keyword) !== -1 || t === titleLower || titleLower.indexOf(t) !== -1;
    });
    if (!alreadyExists) {
      brief = item;
      break;
    }
  }

  if (!brief) {
    console.log('All calendar briefs have been written. Add more to content-calendar.json.');
    return;
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

  var prompt = 'You are writing a blog post for APodcastGeek (apodcastgeek.com), Ireland\'s award-winning B2B podcast production agency based in Dublin. The agency offers done-for-you podcast production under "The APG Brand Builder" service.\n\n' +
    'BRIEF:\n' + brief.brief + '\n\n' +
    'ORIGINAL DATA POINTS TO INCLUDE:\n' + dataPoints + '\n\n' +
    'INTERNAL PAGES TO LINK TO:\n' + internalLinks + '\n\n' +
    videoEmbeds + '\n\n' +
    'WRITING RULES:\n' +
    '- No em dashes ever\n' +
    '- No exclamation marks\n' +
    '- No filler words or fluff\n' +
    '- Direct, authoritative, professional tone\n' +
    '- Write from "we" perspective as APodcastGeek\n' +
    '- Use data and specifics, not vague claims\n' +
    '- Every section should be actionable\n' +
    '- Include external links to authoritative sources (HBR, Forbes, industry reports) where relevant\n' +
    '- End with a CTA to book a strategy call at https://calendly.com/apodcastgeek_dave/apg-podcast-accelerator-discovery-call\n\n' +
    'FORMAT YOUR RESPONSE EXACTLY AS:\n' +
    'TITLE: [title]\n' +
    'SLUG: [slug]\n' +
    'DESCRIPTION: [meta description, 150-160 characters]\n' +
    'TAG: [' + brief.tag + ']\n' +
    '---\n' +
    '[full article content in HTML using h2, h3, p, ul, li, blockquote, a tags. Do NOT include h1. Include the Wistia embed HTML where contextually relevant. Include internal links as <a href="url">anchor text</a>.]';

  // Generate with Claude
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
  var claudeData = await claudeRes.json();

  if (!claudeData.content || !claudeData.content[0]) {
    console.error('Claude API error:', JSON.stringify(claudeData));
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

  // Create Notion page
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
      },
      children: children
    })
  });

  if (createRes.ok) {
    console.log('Draft created: ' + title + ' (Week ' + brief.week + ', keyword: ' + brief.keyword + ')');
  } else {
    var err = await createRes.json();
    console.error('Notion error:', JSON.stringify(err));
    process.exit(1);
  }
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
