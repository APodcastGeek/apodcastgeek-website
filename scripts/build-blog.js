const fs = require('fs');
const path = require('path');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

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

// ========= Helpers =========

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 60);
}

function readingTimeMinutes(htmlContent) {
  const text = String(htmlContent || '').replace(/<[^>]*>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Extract keywords from post title for Unsplash search
function searchKeywordFromTitle(title, tag) {
  const cleaned = String(title || '')
    .toLowerCase()
    .replace(/[:\-\(\)\"\']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'this', 'that',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'should', 'could', 'may', 'might', 'your', 'you', 'our', 'my',
    'its', 'it', 'they', 'them', 'their', 'into', 'not', 'no', 'yes', 'actually', 'really',
    'very', 'so', 'too', 'just', 'only', 'even', 'also', 'here', 'there', 'now', 'then',
    'still', 'ever', 'more', 'less', 'most', 'least', 'some', 'any', 'each', 'every',
    'all', 'both', 'either', 'neither', 'other', 'another', 'such', 'own', 'same', 'as',
    'than', 'like', 'about', 'actually', 'include', 'includes', 'produce', 'production'
  ]);
  const words = cleaned.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
  const primary = words.slice(0, 3).join(' ');
  const tagHint = (tag || '').toLowerCase().includes('ireland') || cleaned.includes('ireland')
    ? ' dublin' : ' business';
  return primary || (tag || 'podcast business');
}

async function fetchUnsplashImage(query, outfilePath) {
  if (!UNSPLASH_ACCESS_KEY) {
    console.warn(`  Unsplash fetch skipped (no UNSPLASH_ACCESS_KEY). Missing: ${outfilePath}`);
    return false;
  }
  try {
    const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await fetch(searchUrl, {
      headers: {
        'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1'
      }
    });
    const data = await res.json();
    const imageUrl = data?.results?.[0]?.urls?.regular;
    if (!imageUrl) {
      console.warn(`  Unsplash returned no results for query: "${query}"`);
      return false;
    }
    const optimisedUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}w=1200&h=630&fit=crop&q=80&fm=jpg`;
    const imgRes = await fetch(optimisedUrl);
    if (!imgRes.ok) {
      console.warn(`  Unsplash image download failed: ${imgRes.status}`);
      return false;
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    fs.mkdirSync(path.dirname(outfilePath), { recursive: true });
    fs.writeFileSync(outfilePath, buffer);
    console.log(`  Fetched Unsplash image for "${query}" (${buffer.length} bytes) → ${path.basename(outfilePath)}`);
    return true;
  } catch (e) {
    console.warn(`  Unsplash fetch error: ${e.message}`);
    return false;
  }
}

async function ensurePostImage(slug, title, tag) {
  const imageDir = path.join(__dirname, '..', 'blog', 'images', 'posts');
  const imagePath = path.join(imageDir, `${slug}.jpg`);
  if (fs.existsSync(imagePath)) return `posts/${slug}.jpg`;
  const query = searchKeywordFromTitle(title, tag);
  const ok = await fetchUnsplashImage(query, imagePath);
  if (ok) return `posts/${slug}.jpg`;
  return 'default.jpg';
}

// Add id attributes to h2/h3 and extract h2s for TOC
function injectHeadingIdsAndExtractToc(html) {
  const tocItems = [];
  const withIds = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (match, level, text) => {
    const id = slugify(text);
    if (level === '2') tocItems.push({ id, text: text.replace(/<[^>]*>/g, '').trim() });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  return { html: withIds, tocItems };
}

function buildTocHtml(tocItems) {
  if (!tocItems || tocItems.length < 3) return '';
  const lis = tocItems.map(t => `<li><a href="#${t.id}">${t.text}</a></li>`).join('\n    ');
  return `<nav class="toc" aria-label="Table of contents">
  <div class="toc-label">In this article</div>
  <ol>
    ${lis}
  </ol>
</nav>`;
}

// Insert a mid-post CTA after the middle H2
function injectMidCta(html, tocItems) {
  if (!tocItems || tocItems.length < 4) return html;
  const middleIndex = Math.floor(tocItems.length / 2);
  const targetId = tocItems[middleIndex].id;
  const midCta = `
<div class="mid-cta">
  <div class="mid-cta-inner">
    <div class="mid-cta-text">
      <strong>Want this done for you?</strong>
      <p>Book a 30-minute strategy call with APG. No pitch, just a clear plan for your podcast.</p>
    </div>
    <a class="mid-cta-btn" href="https://calendly.com/apodcastgeek_dave/apg-brand-builder-discovery-call" target="_blank" rel="noopener">Book a Call</a>
  </div>
</div>
`;
  const pattern = new RegExp(`(<h2 id="${targetId}">)`);
  if (pattern.test(html)) {
    return html.replace(pattern, midCta + '$1');
  }
  return html;
}

// Process [CALLOUT]...[/CALLOUT], [STAT:XX]...[/STAT], [PULLQUOTE]...[/PULLQUOTE] markers
function processContentMarkers(html) {
  let out = html;
  out = out.replace(/\[CALLOUT\]([\s\S]*?)\[\/CALLOUT\]/g, (m, inner) => {
    return `<div class="callout"><div class="callout-label">APG Insight</div><div class="callout-body">${inner.trim()}</div></div>`;
  });
  out = out.replace(/\[STAT:([^\]]+)\]([\s\S]*?)\[\/STAT\]/g, (m, stat, label) => {
    return `<div class="stat-highlight"><div class="stat-number">${stat.trim()}</div><div class="stat-label">${label.trim()}</div></div>`;
  });
  out = out.replace(/\[PULLQUOTE\]([\s\S]*?)\[\/PULLQUOTE\]/g, (m, inner) => {
    return `<blockquote class="pullquote">${inner.trim()}</blockquote>`;
  });
  return out;
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
        if (pText) {
          if (pText.includes('<h2>') || pText.includes('<p>') || pText.includes('<ul>') || pText.includes('[CALLOUT]') || pText.includes('[STAT:')) {
            html += pText + '\n';
          } else {
            html += `<p>${pText}</p>\n`;
          }
        }
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

  // Defensive: replace legacy Calendly URL with current one
  html = html.split('apg-brand-builder-podcast-design-call').join('apg-brand-builder-discovery-call');

  // Process content markers
  html = processContentMarkers(html);

  return html;
}

// ========= Template =========

function getPostTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-FMQX2BE32H"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-FMQX2BE32H');</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} | APodcastGeek Blog</title>
<meta name="description" content="{{DESCRIPTION}}">
<link rel="canonical" href="https://apodcastgeek.com/blog/{{SLUG}}.html">
<meta property="og:title" content="{{TITLE}} | APodcastGeek Blog">
<meta property="og:description" content="{{DESCRIPTION}}">
<meta property="og:url" content="https://apodcastgeek.com/blog/{{SLUG}}.html">
<meta property="og:type" content="article">
<meta property="og:image" content="https://apodcastgeek.com/blog/images/{{POST_IMAGE}}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{TITLE}} | APodcastGeek Blog">
<meta name="twitter:description" content="{{DESCRIPTION}}">
<meta name="twitter:image" content="https://apodcastgeek.com/blog/images/{{POST_IMAGE}}">
<link rel="icon" type="image/png" href="../favicon.png">
<link rel="apple-touch-icon" href="../favicon.png">
<script src="https://fast.wistia.com/assets/external/E-v1.js" async></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"{{TITLE}}","description":"{{DESCRIPTION}}","image":"https://apodcastgeek.com/blog/images/{{POST_IMAGE}}","author":{"@type":"Organization","name":"APodcastGeek","url":"https://apodcastgeek.com"},"publisher":{"@type":"Organization","name":"APodcastGeek","url":"https://apodcastgeek.com","logo":{"@type":"ImageObject","url":"https://apodcastgeek.com/logo.png"}},"datePublished":"{{DATE}}","dateModified":"{{DATE}}","mainEntityOfPage":"https://apodcastgeek.com/blog/{{SLUG}}.html"}</script>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#060810;color:#c8d4e0;line-height:1.75}

.nav{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 5rem;background:#0a0e1a;border-bottom:0.5px solid rgba(55,138,221,0.2);position:sticky;top:0;z-index:100}
.nav-logo{height:48px;width:auto;filter:drop-shadow(0 0 1px rgba(255,255,255,0.8)) drop-shadow(0 0 1px rgba(255,255,255,0.8))}
.nav-links{display:flex;gap:2rem}
.nav-links a{color:#8899aa;text-decoration:none;font-size:14px}
.nav-links a:hover{color:#fff}
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:.5rem;order:3;margin-left:auto}
.hamburger svg{display:block}
.nav-links.open{display:flex;flex-direction:column;position:absolute;top:100%;left:0;right:0;background:#0a0e1a;padding:1.5rem 2rem;border-bottom:0.5px solid rgba(55,138,221,0.2);gap:1.25rem}
.nav-cta{background:#378ADD;color:#fff;border:none;padding:.65rem 1.6rem;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;display:inline-block}
.nav-cta:hover{background:#185FA5}

.post-header{max-width:780px;margin:0 auto;padding:3rem 2rem 1rem}
.post-back{display:inline-block;color:#378ADD;text-decoration:none;font-size:14px;margin-bottom:1.5rem}
.post-back:hover{color:#85B7EB}
.post-tag{display:inline-block;background:rgba(55,138,221,0.12);color:#85B7EB;border:0.5px solid rgba(55,138,221,0.25);border-radius:999px;padding:.3rem .85rem;font-size:11px;letter-spacing:.5px;text-transform:uppercase;font-weight:600;margin-bottom:1rem}
.post-header h1{font-size:clamp(2rem,4.5vw,3rem);font-weight:800;color:#fff;line-height:1.2;letter-spacing:-.02em;margin-bottom:1rem}
.post-header .lede{font-size:1.1rem;color:#8899aa;line-height:1.6;margin-bottom:1.5rem}
.post-meta{display:flex;gap:.75rem;align-items:center;color:#667788;font-size:13px;flex-wrap:wrap}
.post-meta .dot{opacity:.5}

.post-featured-image{max-width:1040px;margin:1.5rem auto 2.5rem;padding:0 2rem}
.post-featured-image img{width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover;border-radius:14px;display:block;border:0.5px solid rgba(55,138,221,0.15)}

.post{max-width:780px;margin:0 auto;padding:0 2rem 4rem}

.toc{background:#0d1322;border:0.5px solid rgba(55,138,221,0.18);border-radius:10px;padding:1.5rem 1.75rem;margin:0 0 2.5rem 0}
.toc-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#85B7EB;font-weight:600;margin-bottom:.85rem}
.toc ol{list-style:decimal;padding-left:1.25rem;margin:0;color:#8899aa;font-size:.9rem}
.toc li{margin:.35rem 0;line-height:1.5}
.toc a{color:#c8d4e0;text-decoration:none;transition:color .15s}
.toc a:hover{color:#85B7EB}

.share-row{display:flex;align-items:center;gap:.65rem;margin:1.5rem 0 2.5rem 0;padding:1rem 0;border-top:0.5px solid rgba(55,138,221,0.1);border-bottom:0.5px solid rgba(55,138,221,0.1)}
.share-label{font-size:12px;color:#667788;text-transform:uppercase;letter-spacing:.7px;margin-right:.35rem}
.share-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;background:#0d1322;border:0.5px solid rgba(55,138,221,0.25);color:#8899aa;text-decoration:none;transition:all .15s}
.share-btn:hover{background:#378ADD;color:#fff;border-color:#378ADD}
.share-btn svg{width:16px;height:16px;display:block}
.share-btn.copy{cursor:pointer;font-size:12px;font-weight:600;width:auto;padding:0 .9rem}

.post-body h2{font-size:clamp(1.3rem,2.2vw,1.65rem);font-weight:700;color:#fff;margin-top:2.75rem;margin-bottom:.85rem;letter-spacing:-.01em;line-height:1.3;scroll-margin-top:6rem}
.post-body h3{font-size:1.15rem;font-weight:600;color:#fff;margin-top:2rem;margin-bottom:.5rem;scroll-margin-top:6rem}
.post-body p{font-size:1.02rem;color:#a8b4c4;line-height:1.85;margin-bottom:1.25rem}
.post-body ul,.post-body ol{padding-left:1.5rem;margin-bottom:1.4rem}
.post-body li{font-size:1.02rem;color:#a8b4c4;line-height:1.85;margin-bottom:.5rem}
.post-body blockquote{border-left:3px solid #378ADD;padding:.5rem 0 .5rem 1.5rem;margin:2rem 0;font-style:italic;color:#c8d4e0;font-size:1.05rem}
.post-body a{color:#378ADD;text-decoration:underline;text-decoration-color:rgba(55,138,221,0.35);text-underline-offset:3px}
.post-body a:hover{text-decoration-color:#378ADD}
.post-body img{max-width:100%;border-radius:10px;margin:1.5rem 0}
.post-body strong{color:#fff;font-weight:600}

.callout{background:linear-gradient(135deg,rgba(55,138,221,0.08) 0%,rgba(55,138,221,0.02) 100%);border:0.5px solid rgba(55,138,221,0.3);border-left:3px solid #378ADD;border-radius:10px;padding:1.4rem 1.6rem;margin:2rem 0}
.callout-label{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#85B7EB;font-weight:700;margin-bottom:.5rem}
.callout-body{color:#d0dce8;font-size:1rem;line-height:1.7}
.callout-body p{color:#d0dce8;margin-bottom:.6rem;font-size:1rem}
.callout-body p:last-child{margin-bottom:0}

.post-body blockquote.pullquote{border:none;border-top:0.5px solid rgba(55,138,221,0.25);border-bottom:0.5px solid rgba(55,138,221,0.25);padding:1.5rem 0;margin:2.5rem 0;font-size:clamp(1.2rem,2.2vw,1.5rem);font-weight:600;line-height:1.4;color:#fff;text-align:center;font-style:italic}

.stat-highlight{text-align:center;padding:2rem 1rem;margin:2.5rem 0;background:#0d1322;border-radius:12px;border:0.5px solid rgba(55,138,221,0.2)}
.stat-number{font-size:clamp(2.8rem,6vw,4rem);font-weight:800;color:#378ADD;line-height:1;letter-spacing:-.02em}
.stat-label{font-size:.95rem;color:#8899aa;margin-top:.75rem;line-height:1.5}

.mid-cta{margin:3rem 0}
.mid-cta-inner{background:linear-gradient(135deg,#111827 0%,#0a0f1c 100%);border:0.5px solid rgba(55,138,221,0.3);border-radius:12px;padding:1.5rem 1.75rem;display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap}
.mid-cta-text{flex:1;min-width:220px}
.mid-cta-text strong{display:block;font-size:1.05rem;color:#fff;margin-bottom:.25rem}
.mid-cta-text p{font-size:.9rem;color:#8899aa;margin:0;line-height:1.5}
.mid-cta-btn{background:#378ADD;color:#fff;padding:.7rem 1.35rem;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap;transition:background .15s}
.mid-cta-btn:hover{background:#185FA5}

.post-cta{background:linear-gradient(135deg,#111827 0%,#0a0f1c 100%);border:0.5px solid rgba(55,138,221,0.2);border-radius:14px;padding:2.5rem 2rem;text-align:center;margin-top:3rem}
.post-cta h3{font-size:1.3rem;font-weight:700;color:#fff;margin-bottom:.6rem}
.post-cta p{font-size:.95rem;color:#8899aa;margin-bottom:1.5rem}
.post-cta a{background:#378ADD;color:#fff;padding:.85rem 2rem;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;transition:background .15s}
.post-cta a:hover{background:#185FA5}

.author-card{margin-top:3rem;padding:1.5rem;background:#0d1322;border:0.5px solid rgba(55,138,221,0.15);border-radius:10px;display:flex;gap:1rem;align-items:center}
.author-card-logo{flex-shrink:0;width:56px;height:56px;border-radius:12px;background:#060810;display:flex;align-items:center;justify-content:center;padding:8px}
.author-card-logo img{width:100%;height:100%;object-fit:contain}
.author-card-info{flex:1}
.author-card-name{font-size:1rem;font-weight:600;color:#fff;margin-bottom:.1rem}
.author-card-bio{font-size:.85rem;color:#8899aa;line-height:1.5}
.author-card-badge{display:inline-block;background:rgba(55,138,221,0.12);color:#85B7EB;border-radius:4px;padding:.15rem .55rem;font-size:10px;letter-spacing:.5px;text-transform:uppercase;font-weight:600;margin-top:.35rem}

.related{margin-top:3rem;padding-top:2rem;border-top:0.5px solid rgba(55,138,221,0.12)}
.related h3{font-size:.8rem;text-transform:uppercase;letter-spacing:1px;font-weight:600;color:#85B7EB;margin-bottom:1.25rem}
.related a{display:block;text-decoration:none;padding:.75rem 0;border-bottom:0.5px solid rgba(55,138,221,0.08)}
.related-title{font-size:.95rem;color:#c8d4e0;font-weight:500}
.related a:hover .related-title{color:#85B7EB}
.related-meta{display:block;font-size:.72rem;color:#556677;margin-top:.25rem;text-transform:uppercase;letter-spacing:.5px}

.footer-simple{background:#040608;border-top:0.5px solid rgba(55,138,221,0.1);padding:2rem 5rem;text-align:center}
.footer-simple p{font-size:13px;color:#334455}
.footer-simple a{color:#445566;text-decoration:none}
.footer-simple a:hover{color:#85B7EB}

@media(max-width:1024px){
  .nav{padding:1rem 2rem;position:relative}
  .nav-links{display:none}
  .hamburger{display:block}
  .nav-logo{height:34px}
  .nav-cta{display:none}
  .footer-simple{padding:2rem}
  .post-header{padding:2rem 1.25rem 1rem}
  .post-featured-image{padding:0 1.25rem;margin:1rem auto 2rem}
  .post{padding:0 1.25rem 3rem}
}
@media(max-width:560px){
  .share-row{flex-wrap:wrap}
  .mid-cta-inner{flex-direction:column;align-items:flex-start}
  .mid-cta-btn{width:100%;text-align:center}
  .post-featured-image img{border-radius:8px}
}
</style>
</head>
<body>
<nav class="nav" role="navigation" aria-label="Main navigation">
  <a href="/"><img src="../logo.png" class="nav-logo" alt="APodcastGeek" width="160" height="48"></a>
  <button class="hamburger" aria-label="Open menu" onclick="document.querySelector('.nav-links').classList.toggle('open')"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8899aa" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="../services.html">Services</a>
    <a href="/#process-heading">How It Works</a>
    <a href="/#testimonials-heading">Results</a>
    <a href="/#faq-heading">FAQ</a>
    <a href="../blog.html">Blog</a>
    <a href="https://clients.apodcastgeek.com/">Client Login</a>
  </div>
  <a href="https://calendly.com/apodcastgeek_dave/apg-brand-builder-discovery-call" class="nav-cta">Book a Strategy Call</a>
</nav>

<header class="post-header">
  <a href="../blog.html" class="post-back">&larr; Back to Blog</a>
  <span class="post-tag">{{TAG}}</span>
  <h1>{{TITLE}}</h1>
  <div class="post-meta"><span>{{DATE}}</span><span class="dot">&bull;</span><span>{{READING_TIME}} min read</span><span class="dot">&bull;</span><span>APodcastGeek</span></div>
</header>

<figure class="post-featured-image">
  <img src="../blog/images/{{POST_IMAGE}}" alt="{{TITLE}}" loading="eager" fetchpriority="high">
</figure>

<article class="post">
  {{TOC}}

  <div class="share-row">
    <span class="share-label">Share</span>
    <a class="share-btn" href="https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fapodcastgeek.com%2Fblog%2F{{SLUG}}.html&title={{TITLE_URLENCODED}}" target="_blank" rel="noopener" aria-label="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.67H5.67v8.67h2.67zM7 8.5a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.84V13.5c0-2.54-1.37-3.73-3.2-3.73-1.48 0-2.14.82-2.51 1.39v-1.19H10v8.67h2.63v-4.84c0-1.3.25-2.55 1.86-2.55 1.6 0 1.62 1.5 1.62 2.63v4.76h2.23z"/></svg></a>
    <a class="share-btn" href="https://twitter.com/intent/tweet?text={{TITLE_URLENCODED}}&url=https%3A%2F%2Fapodcastgeek.com%2Fblog%2F{{SLUG}}.html" target="_blank" rel="noopener" aria-label="Share on X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
    <a class="share-btn" href="mailto:?subject={{TITLE_URLENCODED}}&body=Thought%20you%20might%20like%20this%3A%20https%3A%2F%2Fapodcastgeek.com%2Fblog%2F{{SLUG}}.html" aria-label="Share by Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></a>
    <button class="share-btn copy" onclick="(function(b){var u=location.href;navigator.clipboard.writeText(u).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy Link'},1500)});})(this)" type="button">Copy Link</button>
  </div>

  <div class="post-body">
    {{CONTENT}}
  </div>

  <div class="post-cta">
    <h3>Ready to turn your podcast into a revenue engine?</h3>
    <p>Book a 30-minute strategy call and we will show you how the APG Brand Builder works for your business.</p>
    <a href="https://calendly.com/apodcastgeek_dave/apg-brand-builder-discovery-call">Book a Strategy Call</a>
  </div>

  <div class="author-card">
    <div class="author-card-logo"><img src="../logo.png" alt="APodcastGeek"></div>
    <div class="author-card-info">
      <div class="author-card-name">APodcastGeek</div>
      <div class="author-card-bio">Ireland's award-winning B2B podcast production agency. We turn podcasts into pipeline for founders worldwide.</div>
      <span class="author-card-badge">Irish Podcast Award Winners</span>
    </div>
  </div>

  {{RELATED_POSTS}}
</article>

<footer class="footer-simple">
  <p>&copy; 2026 APodcastGeek Limited. <a href="../privacy.html">Privacy Policy</a> &middot; <a href="../terms.html">Terms of Service</a> &middot; <a href="/">Home</a></p>
</footer>

<div id="cookie-banner" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#0a0e1a;border-top:0.5px solid rgba(55,138,221,0.2);padding:1rem 2rem;z-index:200">
  <div style="max-width:1140px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap">
    <p style="font-size:.85rem;color:#8899aa;margin:0;line-height:1.6;flex:1;min-width:280px">We use cookies to analyse site traffic and improve your experience. By continuing to use this site, you consent to our use of cookies. <a href="/privacy.html" style="color:#378ADD;text-decoration:none">Privacy Policy</a></p>
    <div style="display:flex;gap:.75rem;flex-shrink:0">
      <button onclick="acceptCookies()" style="background:#378ADD;color:#fff;border:none;padding:.5rem 1.25rem;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer">Accept</button>
      <button onclick="declineCookies()" style="background:transparent;color:#8899aa;border:0.5px solid rgba(55,138,221,0.3);padding:.5rem 1.25rem;border-radius:6px;font-size:13px;cursor:pointer">Decline</button>
    </div>
  </div>
</div>
<script>
(function(){var c=localStorage.getItem('cookie_consent');if(c===null){document.getElementById('cookie-banner').style.display='block';window['ga-disable-G-FMQX2BE32H']=true;}else if(c==='declined'){window['ga-disable-G-FMQX2BE32H']=true;}})();
function acceptCookies(){localStorage.setItem('cookie_consent','accepted');document.getElementById('cookie-banner').style.display='none';window['ga-disable-G-FMQX2BE32H']=false;gtag('config','G-FMQX2BE32H');}
function declineCookies(){localStorage.setItem('cookie_consent','declined');document.getElementById('cookie-banner').style.display='none';window['ga-disable-G-FMQX2BE32H']=true;}
</script>
</body>
</html>`;
}

async function main() {
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

    const today = new Date().toISOString().split('T')[0];
    if (publishDate > today) {
      console.log('Skipping (future date): ' + title + ' (scheduled for ' + publishDate + ')');
      continue;
    }

    const blocks = await getBlocks(page.id);
    let rawContent = blocksToHtml(blocks);

    const { html: contentWithIds, tocItems } = injectHeadingIdsAndExtractToc(rawContent);
    const contentWithMidCta = injectMidCta(contentWithIds, tocItems);
    const tocHtml = buildTocHtml(tocItems);

    const postImage = await ensurePostImage(slug, title, tag);
    const reading = readingTimeMinutes(contentWithMidCta);

    cards.push({
      title,
      slug,
      description,
      tag,
      publishDate,
      content: contentWithMidCta,
      tocHtml,
      postImage,
      reading
    });
  }

  cards.sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  for (const post of cards) {
    const related = cards.filter(p => p.slug !== post.slug).slice(0, 3);
    let relatedHtml = '';
    if (related.length > 0) {
      relatedHtml = '<div class="related"><h3>Related Articles</h3>';
      for (const r of related) {
        relatedHtml += '<a href="' + r.slug + '.html">' +
          '<span class="related-title">' + r.title + '</span>' +
          '<span class="related-meta">' + r.tag + ' &middot; ' + r.publishDate + '</span></a>';
      }
      relatedHtml += '</div>';
    }

    const titleUrlEncoded = encodeURIComponent(post.title);

    const html = template
      .replace(/\{\{TITLE_URLENCODED\}\}/g, titleUrlEncoded)
      .replace(/\{\{TITLE\}\}/g, post.title)
      .replace(/\{\{SLUG\}\}/g, post.slug)
      .replace(/\{\{DESCRIPTION\}\}/g, post.description.replace(/"/g, '&quot;'))
      .replace(/\{\{TAG\}\}/g, post.tag)
      .replace(/\{\{DATE\}\}/g, post.publishDate)
      .replace(/\{\{POST_IMAGE\}\}/g, post.postImage)
      .replace(/\{\{READING_TIME\}\}/g, String(post.reading))
      .replace(/\{\{TOC\}\}/g, post.tocHtml)
      .replace(/\{\{CONTENT\}\}/g, post.content)
      .replace(/\{\{RELATED_POSTS\}\}/g, relatedHtml);

    fs.writeFileSync(path.join(blogDir, `${post.slug}.html`), html);
    console.log(`Built: ${post.slug}.html (image: ${post.postImage}, ${post.reading} min)`);
  }

  // Update blog.html
  const blogHtmlPath = path.join(__dirname, '..', 'blog.html');
  let blogHtml = fs.readFileSync(blogHtmlPath, 'utf-8');

  const cardsHtml = cards.map(p =>
    `<a href="blog/${p.slug}.html" class="blog-card">` +
    `<div class="blog-card-img" style="background-image:url('blog/images/${p.postImage}');background-size:cover;background-position:center"></div>` +
    `<div class="blog-card-body">` +
    `<span class="blog-card-tag">${p.tag}</span>` +
    `<h2>${p.title}</h2>` +
    `<p>${p.description}</p>` +
    `<span class="blog-card-meta">${p.publishDate} &middot; ${p.reading} min read</span>` +
    `</div></a>`
  ).join('\n  ');

  blogHtml = blogHtml.replace(
    /(<div class="blog-grid" id="blog-posts">)[\s\S]*?(<\/div>\s*<div class="blog-empty")/,
    `$1\n  ${cardsHtml}\n</div>\n\n<div class="blog-empty"`
  );

  if (cards.length > 0) {
    blogHtml = blogHtml.replace(
      /<div class="blog-empty" id="blog-empty"[^>]*>/,
      '<div class="blog-empty" id="blog-empty" style="display:none">'
    );
  }

  fs.writeFileSync(blogHtmlPath, blogHtml);
  console.log(`Updated blog.html with ${cards.length} posts`);

  // Update sitemap.xml
  const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
  const today = new Date().toISOString().split('T')[0];
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://apodcastgeek.com/</loc>
    <lastmod>${today}</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://apodcastgeek.com/services.html</loc>
    <lastmod>${today}</lastmod>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://apodcastgeek.com/blog.html</loc>
    <lastmod>${today}</lastmod>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://apodcastgeek.com/checklist.html</loc>
    <lastmod>2026-03-30</lastmod>
    <priority>0.7</priority>
  </url>
`;
  for (const post of cards) {
    sitemap += `  <url>
    <loc>https://apodcastgeek.com/blog/${post.slug}.html</loc>
    <lastmod>${post.publishDate}</lastmod>
    <priority>0.7</priority>
  </url>
`;
  }
  sitemap += `  <url>
    <loc>https://apodcastgeek.com/privacy.html</loc>
    <lastmod>2026-03-30</lastmod>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://apodcastgeek.com/terms.html</loc>
    <lastmod>2026-03-30</lastmod>
    <priority>0.3</priority>
  </url>
</urlset>`;
  fs.writeFileSync(sitemapPath, sitemap);
  console.log(`Updated sitemap.xml with ${cards.length} blog posts`);

  const { appendFileSync } = require('fs');
  appendFileSync(process.env.GITHUB_ENV || '/dev/null', 'HAS_POSTS=true\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
