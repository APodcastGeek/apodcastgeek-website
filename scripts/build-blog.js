const fs = require('fs');
const path = require('path');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

async function notionFetch(url, body = null) {
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function getBlocks(blockId) {
  const data = await notionFetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`);
  return data.results || [];
}

function blocksToHtml(blocks) {
  let html = '';
  let inList = false;

  for (const block of blocks) {
    const richTextToStr = (rt) => (rt || []).map(t => {
      let text = t.plain_text || '';
      if (t.annotations?.bold) text = `<strong>${text}</strong>`;
      if (t.annotations?.italic) text = `<em>${text}</em>`;
      if (t.href) text = `<a href="${t.href}">${text}</a>`;
      return text;
    }).join('');

    if (block.type !== 'bulleted_list_item' && block.type !== 'numbered_list_item' && inList) {
      html += '</ul>\n';
      inList = false;
    }

    switch (block.type) {
      case 'paragraph':
        const pText = richTextToStr(block.paragraph.rich_text);
        if (pText) html += `<p>${pText}</p>\n`;
        break;
      case 'heading_2':
        html += `<h2>${richTextToStr(block.heading_2.rich_text)}</h2>\n`;
        break;
      case 'heading_3':
        html += `<h3>${richTextToStr(block.heading_3.rich_text)}</h3>\n`;
        break;
      case 'bulleted_list_item':
        if (!inList) { html += '<ul>\n'; inList = true; }
        html += `<li>${richTextToStr(block.bulleted_list_item.rich_text)}</li>\n`;
        break;
      case 'numbered_list_item':
        if (!inList) { html += '<ul>\n'; inList = true; }
        html += `<li>${richTextToStr(block.numbered_list_item.rich_text)}</li>\n`;
        break;
      case 'quote':
        html += `<blockquote>${richTextToStr(block.quote.rich_text)}</blockquote>\n`;
        break;
      case 'divider':
        html += '<hr>\n';
        break;
    }
  }
  if (inList) html += '</ul>\n';
  return html;
}

function getPostTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} | APodcastGeek Blog</title>
<meta name="description" content="{{DESCRIPTION}}">
<link rel="canonical" href="https://apodcastgeek.com/blog/{{SLUG}}.html">
<meta property="og:title" content="{{TITLE}} | APodcastGeek Blog">
<meta property="og:description" content="{{DESCRIPTION}}">
<meta property="og:url" content="https://apodcastgeek.com/blog/{{SLUG}}.html">
<meta property="og:type" content="article">
<meta property="og:image" content="https://apodcastgeek.com/logo.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{TITLE}} | APodcastGeek Blog">
<meta name="twitter:description" content="{{DESCRIPTION}}">
<meta name="twitter:image" content="https://apodcastgeek.com/logo.png">
<link rel="icon" type="image/png" href="../favicon.png">
<link rel="apple-touch-icon" href="../favicon.png">
<script src="https://fast.wistia.com/assets/external/E-v1.js" async></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"{{TITLE}}","description":"{{DESCRIPTION}}","author":{"@type":"Organization","name":"APodcastGeek"},"publisher":{"@type":"Organization","name":"APodcastGeek","url":"https://apodcastgeek.com"},"datePublished":"{{DATE}}","mainEntityOfPage":"https://apodcastgeek.com/blog/{{SLUG}}.html"}</script>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#060810;color:#c8d4e0;line-height:1.8}
.nav{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 5rem;background:#0a0e1a;border-bottom:0.5px solid rgba(55,138,221,0.2);position:sticky;top:0;z-index:100}
.nav-logo{height:48px;width:auto;filter:drop-shadow(0 0 1px rgba(255,255,255,0.8)) drop-shadow(0 0 1px rgba(255,255,255,0.8))}.nav-links{display:flex;gap:2rem}.nav-links a{color:#8899aa;text-decoration:none;font-size:14px}.nav-links a:hover{color:#fff}
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:.5rem;order:3;margin-left:auto}.hamburger svg{display:block}
.nav-links.open{display:flex;flex-direction:column;position:absolute;top:100%;left:0;right:0;background:#0a0e1a;padding:1.5rem 2rem;border-bottom:0.5px solid rgba(55,138,221,0.2);gap:1.25rem}
.nav-cta{background:#378ADD;color:#fff;border:none;padding:.65rem 1.6rem;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;display:inline-block}.nav-cta:hover{background:#185FA5}
.post{max-width:780px;margin:0 auto;padding:4rem 2rem 5rem}
.post-back{display:inline-block;color:#378ADD;text-decoration:none;font-size:14px;margin-bottom:2rem}.post-back:hover{color:#85B7EB}
.post-tag{display:inline-block;background:rgba(55,138,221,0.12);color:#85B7EB;border-radius:4px;padding:.2rem .6rem;font-size:11px;letter-spacing:.5px;margin-bottom:1rem}
.post-meta{font-size:13px;color:#556677;margin-bottom:2.5rem}
.post h1{font-size:clamp(1.8rem,4vw,2.5rem);font-weight:700;color:#fff;line-height:1.25;margin-bottom:1rem}
.post h2{font-size:1.4rem;font-weight:600;color:#fff;margin-top:2.5rem;margin-bottom:.75rem}
.post h3{font-size:1.1rem;font-weight:600;color:#fff;margin-top:2rem;margin-bottom:.5rem}
.post p{font-size:1rem;color:#8899aa;line-height:1.9;margin-bottom:1.25rem}
.post ul,.post ol{padding-left:1.5rem;margin-bottom:1.25rem}
.post li{font-size:1rem;color:#8899aa;line-height:1.9;margin-bottom:.5rem}
.post blockquote{border-left:3px solid #378ADD;padding-left:1.25rem;margin:1.5rem 0;font-style:italic;color:#aabbcc}
.post a{color:#378ADD;text-decoration:none}.post a:hover{text-decoration:underline}
.post img{max-width:100%;border-radius:8px;margin:1.5rem 0}
.post-cta{background:#111827;border:0.5px solid rgba(55,138,221,0.2);border-radius:12px;padding:2.5rem;text-align:center;margin-top:3rem}
.post-cta h3{font-size:1.2rem;font-weight:600;color:#fff;margin-bottom:.5rem}
.post-cta p{font-size:.9rem;color:#8899aa;margin-bottom:1.5rem}
.post-cta a{background:#378ADD;color:#fff;padding:.75rem 2rem;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;display:inline-block}.post-cta a:hover{background:#185FA5}
.footer-simple{background:#040608;border-top:0.5px solid rgba(55,138,221,0.1);padding:2rem 5rem;text-align:center}
.footer-simple p{font-size:13px;color:#334455}
.footer-simple a{color:#445566;text-decoration:none}.footer-simple a:hover{color:#85B7EB}
@media(max-width:1024px){.nav{padding:1rem 2rem;position:relative}.nav-links{display:none}.hamburger{display:block}.nav-logo{height:34px}.nav-cta{display:none}.footer-simple{padding:2rem}}
</style>
</head>
<body>
<nav class="nav" role="navigation" aria-label="Main navigation">
  <a href="/"><img src="../logo.png" class="nav-logo" alt="APodcastGeek" width="160" height="48"></a>
  <button class="hamburger" aria-label="Open menu" onclick="document.querySelector('.nav-links').classList.toggle('open')"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8899aa" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>
  <div class="nav-links">
    <a href="/#process-heading">How It Works</a>
    <a href="/#testimonials-heading">Results</a>
    <a href="/#faq-heading">FAQ</a>
    <a href="../blog.html">Blog</a>
    <a href="https://clients.apodcastgeek.com/">Client Login</a>
  </div>
  <a href="https://calendly.com/apodcastgeek_dave/apg-brand-builder-podcast-design-call" class="nav-cta">Book a Strategy Call</a>
</nav>
<article class="post">
  <a href="../blog.html" class="post-back">&larr; Back to Blog</a>
  <span class="post-tag">{{TAG}}</span>
  <h1>{{TITLE}}</h1>
  <p class="post-meta">{{DATE}} &middot; APodcastGeek</p>
  {{CONTENT}}
  <div class="post-cta">
    <h3>Ready to turn your podcast into a revenue engine?</h3>
    <p>Book a strategy call and we will show you how the APG Brand Builder works for your business.</p>
    <a href="https://calendly.com/apodcastgeek_dave/apg-brand-builder-podcast-design-call">Book a Strategy Call</a>
  </div>
</article>
<footer class="footer-simple">
  <p>&copy; 2026 APodcastGeek Limited. <a href="../privacy.html">Privacy Policy</a> &middot; <a href="../terms.html">Terms of Service</a> &middot; <a href="/">Home</a></p>
</footer>
</body>
</html>`;
}

async function main() {
  // Query published posts
  const data = await notionFetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
    filter: { property: 'Status', select: { equals: 'Published' } }
  });

  const results = data.results || [];
  if (results.length === 0) {
    console.log('No published posts to build');
    return;
  }

  const blogDir = path.join(__dirname, '..', 'blog');
  fs.mkdirSync(blogDir, { recursive: true });

  const template = getPostTemplate();
  const cards = [];

  for (const page of results) {
    const props = page.properties;
    const title = props.Name?.title?.[0]?.plain_text || '';
    const slug = props.Slug?.rich_text?.[0]?.plain_text || '';
    const description = props.Description?.rich_text?.[0]?.plain_text || '';
    const tag = props.Tag?.rich_text?.[0]?.plain_text || 'B2B Strategy';
    const publishDate = props['Publish Date']?.rich_text?.[0]?.plain_text || new Date().toISOString().split('T')[0];

    if (!title || !slug) continue;

    // Get page content blocks
    const blocks = await getBlocks(page.id);
    const content = blocksToHtml(blocks);

    // Build HTML
    const html = template
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{SLUG\}\}/g, slug)
      .replace(/\{\{DESCRIPTION\}\}/g, description)
      .replace(/\{\{TAG\}\}/g, tag)
      .replace(/\{\{DATE\}\}/g, publishDate)
      .replace(/\{\{CONTENT\}\}/g, content);

    fs.writeFileSync(path.join(blogDir, `${slug}.html`), html);
    console.log(`Built: ${slug}.html`);

    cards.push({ title, slug, description, tag, publishDate });
  }

  // Sort by date descending
  cards.sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  // Update blog.html
  const blogHtmlPath = path.join(__dirname, '..', 'blog.html');
  let blogHtml = fs.readFileSync(blogHtmlPath, 'utf-8');

  const cardsHtml = cards.map(p =>
    `<a href="blog/${p.slug}.html" class="blog-card">` +
    `<div class="blog-card-body">` +
    `<span class="blog-card-tag">${p.tag}</span>` +
    `<h2>${p.title}</h2>` +
    `<p>${p.description}</p>` +
    `<span class="blog-card-meta">${p.publishDate}</span>` +
    `</div></a>`
  ).join('\n  ');

  blogHtml = blogHtml.replace(
    /(<div class="blog-grid" id="blog-posts">)[\s\S]*?(<\/div>)/,
    `$1\n  ${cardsHtml}\n$2`
  );

  if (cards.length > 0) {
    blogHtml = blogHtml.replace(
      /<div class="blog-empty" id="blog-empty"[^>]*>/,
      '<div class="blog-empty" id="blog-empty" style="display:none">'
    );
  }

  fs.writeFileSync(blogHtmlPath, blogHtml);
  console.log(`Updated blog.html with ${cards.length} posts`);

  // Signal to workflow that we have posts
  const { appendFileSync } = require('fs');
  appendFileSync(process.env.GITHUB_ENV || '/dev/null', 'HAS_POSTS=true\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
