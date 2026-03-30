const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { Client: NotionClient } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk").default;
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

admin.initializeApp();

const NOTION_API_KEY = defineSecret("NOTION_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const NOTION_DB_ID = "33388a120cc88069aba2fff072cc8b3d";

const BLOG_PROMPT = `You are a B2B podcast production expert writing for APodcastGeek, Ireland's award-winning B2B podcast production agency. Write a blog post optimised for SEO.

Requirements:
- Pick ONE topic relevant to B2B founders who use podcasts for lead generation, authority building, and revenue. Vary topics each week.
- Length: 800-1200 words
- Tone: Professional, direct, authoritative. No fluff. No em dashes. No exclamation marks.
- Structure: H1 title, 3-5 H2 sections, actionable takeaways
- Include a meta description (150-160 characters)
- Include a suggested slug (url-friendly, lowercase, hyphens)
- Include a tag from: B2B Strategy, Podcast Production, Guest Recruitment, Monetisation, Industry Insights
- End with a CTA mentioning APodcastGeek's done-for-you Brand Builder service
- Write from "we" perspective as APodcastGeek
- Reference that APG is based in Dublin, Ireland and serves B2B founders worldwide
- Reference the Irish Podcast Awards where relevant

Format your response EXACTLY as:
TITLE: [title]
SLUG: [slug]
DESCRIPTION: [meta description]
TAG: [tag]
---
[full article content in HTML using h2, h3, p, ul, li, blockquote tags. Do NOT include h1 - that is added by the template]`;

// ============================================
// FUNCTION 1: Generate weekly blog draft
// Runs every Monday at 9am Dublin time
// ============================================
exports.generateBlogDraft = onSchedule(
  {
    schedule: "0 9 * * 1",
    timeZone: "Europe/Dublin",
    secrets: [NOTION_API_KEY, ANTHROPIC_API_KEY],
    region: "europe-west1",
  },
  async () => {
    const notion = new NotionClient({ auth: NOTION_API_KEY.value() });
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    // Get existing titles to avoid duplicates
    const existing = await notion.databases.query({
      database_id: NOTION_DB_ID,
      page_size: 50,
    });
    const existingTitles = existing.results
      .map((p) => p.properties.Title?.title?.[0]?.plain_text || "")
      .filter(Boolean);

    const avoidList =
      existingTitles.length > 0
        ? `\n\nDo NOT write about these topics as they already exist:\n${existingTitles.map((t) => `- ${t}`).join("\n")}`
        : "";

    // Generate article with Claude
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: BLOG_PROMPT + avoidList }],
    });

    const response = message.content[0].text;

    // Parse response
    const titleMatch = response.match(/TITLE:\s*(.+)/);
    const slugMatch = response.match(/SLUG:\s*(.+)/);
    const descMatch = response.match(/DESCRIPTION:\s*(.+)/);
    const tagMatch = response.match(/TAG:\s*(.+)/);
    const contentMatch = response.split("---\n");
    const content = contentMatch.length > 1 ? contentMatch.slice(1).join("---\n").trim() : "";

    if (!titleMatch || !slugMatch || !content) {
      console.error("Failed to parse AI response");
      return;
    }

    const title = titleMatch[1].trim();
    const slug = slugMatch[1].trim();
    const description = descMatch ? descMatch[1].trim() : "";
    const tag = tagMatch ? tagMatch[1].trim() : "B2B Strategy";

    // Create Notion page
    await notion.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        Title: { title: [{ text: { content: title } }] },
        Slug: { rich_text: [{ text: { content: slug } }] },
        Description: { rich_text: [{ text: { content: description } }] },
        Tag: { select: { name: tag } },
        Status: { select: { name: "Draft" } },
        Author: { rich_text: [{ text: { content: "APodcastGeek" } }] },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: content } }],
          },
        },
      ],
    });

    console.log(`Draft created: ${title}`);
  }
);

// ============================================
// FUNCTION 2: Publish blog posts
// Runs daily at 6am Dublin time
// Checks for "Published" posts, builds HTML, deploys
// ============================================
exports.publishBlogPosts = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "Europe/Dublin",
    secrets: [NOTION_API_KEY],
    region: "europe-west1",
  },
  async () => {
    const notion = new NotionClient({ auth: NOTION_API_KEY.value() });

    // Get all published posts
    const published = await notion.databases.query({
      database_id: NOTION_DB_ID,
      filter: {
        property: "Status",
        select: { equals: "Published" },
      },
    });

    if (published.results.length === 0) {
      console.log("No published posts to build");
      return;
    }

    const posts = [];

    for (const page of published.results) {
      const props = page.properties;
      const title = props.Title?.title?.[0]?.plain_text || "";
      const slug = props.Slug?.rich_text?.[0]?.plain_text || "";
      const description = props.Description?.rich_text?.[0]?.plain_text || "";
      const tag = props.Tag?.select?.name || "B2B Strategy";
      const publishDate = props["Publish Date"]?.date?.start || new Date().toISOString().split("T")[0];

      if (!title || !slug) continue;

      // Get page content
      const blocks = await notion.blocks.children.list({ block_id: page.id });
      let content = "";
      for (const block of blocks.results) {
        if (block.type === "paragraph") {
          const text = block.paragraph.rich_text.map((t) => t.plain_text).join("");
          if (text) content += text;
        } else if (block.type === "heading_2") {
          const text = block.heading_2.rich_text.map((t) => t.plain_text).join("");
          content += `<h2>${text}</h2>`;
        } else if (block.type === "heading_3") {
          const text = block.heading_3.rich_text.map((t) => t.plain_text).join("");
          content += `<h3>${text}</h3>`;
        } else if (block.type === "bulleted_list_item") {
          const text = block.bulleted_list_item.rich_text.map((t) => t.plain_text).join("");
          content += `<li>${text}</li>`;
        }
      }

      posts.push({ title, slug, description, tag, publishDate, content });
    }

    // Build post HTML files
    const tmpDir = path.join(os.tmpdir(), "blog-build");
    const blogDir = path.join(tmpDir, "blog");
    fs.mkdirSync(blogDir, { recursive: true });

    const postTemplate = getPostTemplate();
    const blogCards = [];

    for (const post of posts) {
      const html = postTemplate
        .replace(/\{\{TITLE\}\}/g, post.title)
        .replace(/\{\{SLUG\}\}/g, post.slug)
        .replace(/\{\{DESCRIPTION\}\}/g, post.description)
        .replace(/\{\{TAG\}\}/g, post.tag)
        .replace(/\{\{DATE\}\}/g, post.publishDate)
        .replace(/\{\{CONTENT\}\}/g, post.content);

      fs.writeFileSync(path.join(blogDir, `${post.slug}.html`), html);

      blogCards.push(
        `<a href="blog/${post.slug}.html" class="blog-card">` +
        `<div class="blog-card-body">` +
        `<span class="blog-card-tag">${post.tag}</span>` +
        `<h2>${post.title}</h2>` +
        `<p>${post.description}</p>` +
        `<span class="blog-card-meta">${post.publishDate}</span>` +
        `</div></a>`
      );
    }

    // Update blog.html listing
    const bucket = admin.storage().bucket();
    const blogListingFile = await bucket.file("blog.html").download();
    let blogListing = blogListingFile[0].toString("utf-8");

    const cardsHtml = blogCards.join("\n  ");
    blogListing = blogListing.replace(
      /(<div class="blog-grid" id="blog-posts">)[\s\S]*?(<\/div>)/,
      `$1\n  ${cardsHtml}\n$2`
    );

    // Hide empty message if we have posts
    if (posts.length > 0) {
      blogListing = blogListing.replace(
        /<div class="blog-empty" id="blog-empty">/,
        '<div class="blog-empty" id="blog-empty" style="display:none">'
      );
    }

    // Write updated files to tmp
    fs.writeFileSync(path.join(tmpDir, "blog.html"), blogListing);

    // Upload to Firebase Hosting via Admin SDK
    for (const post of posts) {
      const filePath = path.join(blogDir, `${post.slug}.html`);
      await bucket.upload(filePath, { destination: `blog/${post.slug}.html` });
    }
    await bucket.upload(path.join(tmpDir, "blog.html"), { destination: "blog.html" });

    console.log(`Published ${posts.length} blog posts`);
  }
);

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
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"{{TITLE}}","description":"{{DESCRIPTION}}","author":{"@type":"Organization","name":"APodcastGeek"},"publisher":{"@type":"Organization","name":"APodcastGeek","url":"https://apodcastgeek.com"},"datePublished":"{{DATE}}","mainEntityOfPage":"https://apodcastgeek.com/blog/{{SLUG}}.html"}</script>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#060810;color:#c8d4e0;line-height:1.8}
.nav{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 5rem;background:#0a0e1a;border-bottom:0.5px solid rgba(55,138,221,0.2);position:sticky;top:0;z-index:100}
.nav-logo{height:38px;width:auto;filter:drop-shadow(0 0 1px rgba(255,255,255,0.8)) drop-shadow(0 0 1px rgba(255,255,255,0.8))}.nav-links{display:flex;gap:2rem}.nav-links a{color:#8899aa;text-decoration:none;font-size:14px}.nav-links a:hover{color:#fff}
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
@media(max-width:1024px){.nav{padding:1rem 2rem}.nav-links{display:none}.footer-simple{padding:2rem}}
</style>
</head>
<body>
<nav class="nav" role="navigation" aria-label="Main navigation">
  <a href="/"><img src="../logo.png" class="nav-logo" alt="APodcastGeek" width="160" height="38"></a>
  <div class="nav-links">
    <a href="/#process-heading">How It Works</a>
    <a href="/#testimonials-heading">Results</a>
    <a href="/#faq-heading">FAQ</a>
    <a href="../blog.html">Blog</a>
    <a href="https://clients.apodcastgeek.com/">Client Login</a>
  </div>
  <a href="https://calendly.com/apodcastgeek_dave/apg-podcast-accelerator-discovery-call" class="nav-cta">Book a Strategy Call</a>
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
    <a href="https://calendly.com/apodcastgeek_dave/apg-podcast-accelerator-discovery-call">Book a Strategy Call</a>
  </div>
</article>
<footer class="footer-simple">
  <p>&copy; 2026 APodcastGeek Limited. <a href="../privacy.html">Privacy Policy</a> &middot; <a href="../terms.html">Terms of Service</a> &middot; <a href="/">Home</a></p>
</footer>
</body>
</html>`;
}
