# Blog V2 Build Plan

## Goal
Bring APG blog posts up to competitor standard (Lower Street, Quill, Sweet Fish, Content Allies) so they look like professional B2B content marketing rather than AI-generated text walls. Preserve the automation pipeline that already works.

## What Changes for the Reader

**Before:** All-text post, single H1, paragraphs and lists, basic CTA at bottom. No imagery, no visual hierarchy, no table of contents.

**After:**
1. **Hero image** at top of every post (full-width, branded, matches post topic)
2. **Table of contents** auto-generated from H2 headings with anchor links
3. **Branded "APG Insight" callout boxes** within content (blue accent, distinct from paragraphs)
4. **Pull quote styling** for key quotes
5. **Key stat callouts** (e.g. "10%" displayed prominently)
6. **Mid-post CTA** (strategy call) injected between sections, not only at bottom
7. **Social sharing buttons** (LinkedIn, Twitter/X, Email, Copy Link) at top and bottom
8. **Author card** (APodcastGeek logo + award credentials instead of plain text)
9. **Reading time estimate** in meta
10. **Improved typography** and spacing for readability

## What Does NOT Change (by design)

- Notion remains the source of truth for content
- GitHub Actions publish-posts.yml remains the publishing mechanism
- n8n draft generation (Weekly Draft Generation v2) remains unchanged structurally
- Existing published posts get upgraded automatically on next publish (same pipeline, better output)
- No new dependencies (no Unsplash API keys, no external services)

---

## Technical Approach

### 1. Curated Image Library (16 images)
Stored in `/deploy/blog/images/hero/` organised by tag:
- `b2b-strategy/` — 4 images (boardroom, charts, laptop+coffee, handshake)
- `podcast-production/` — 4 images (studio mic, mixer, podcast setup, recording)
- `guest-recruitment/` — 3 images (interview, video call, conversation)
- `industry-insights/` — 3 images (Dublin skyline, map, EU context)
- `monetisation/` — 2 images (chart going up, calculator)

**Source:** Unsplash (free, commercial use allowed, no attribution required though we'll credit anyway). I'll hand-pick these to match APG's dark, professional aesthetic.

**Image specs:** 1200x630 (OG-image ratio), <200KB WebP + JPG fallback.

**Selection logic in `build-blog.js`:** Hash the post slug to pick one image from the tag's folder. Deterministic (same post always gets same image), rotates across posts so you don't see the same image twice in the card grid.

### 2. Enhanced Blog Post Template
File: `deploy/scripts/build-blog.js` → `getPostTemplate()` function

Adds:
- `<meta property="og:image">` using the hero image (not the generic og-image.png)
- Hero section with image, tag badge, title, author card, reading time
- Table of contents generator (parses H2s from content, builds anchor links)
- New CSS classes: `.callout`, `.pullquote`, `.stat-highlight`, `.toc`, `.share-buttons`, `.mid-cta`
- Social share buttons with pre-filled URLs
- Mid-post CTA inserted after 50% of H2 count
- Enhanced author card footer
- Improved mobile responsiveness

### 3. Content Rendering Enhancements
File: `deploy/scripts/build-blog.js` → `blocksToHtml()` function

Adds:
- Auto-add `id` attributes to H2/H3 headings (for TOC anchor links, slugified from heading text)
- Detect and render `[CALLOUT]...[/CALLOUT]` blocks as `<div class="callout">` if Claude uses them
- Detect and render `[STAT:10%]Label text[/STAT]` as `<div class="stat-highlight">`
- Calculate reading time (200 words/minute) and inject into template
- Parse content for H2 count, inject mid-CTA after the middle H2

### 4. Updated Claude Prompt
File: n8n "Build Claude Prompt" node + `deploy/scripts/generate-draft.js` (backup)

Claude now instructed to:
- Include 1-2 `[CALLOUT]APG Insight: ...[/CALLOUT]` boxes with key takeaways
- Include 1 `[STAT:NUMBER]Short description[/STAT]` for the most important data point
- Include 1 `<blockquote>` pull quote
- Write 2500-3500 words (up from 1800-2500 to match competitors)

### 5. Blog Index (blog.html) Card Upgrade
Each card now shows the hero image (via CSS background-image), not just a blank placeholder.

### 6. Navigation & Global Consistency
No changes to site nav. Keep everything else intact.

---

## Files Modified

| File | Change |
|------|--------|
| `deploy/scripts/build-blog.js` | Template rewrite, TOC generator, callout parser, reading time, hero image selection |
| `deploy/blog.html` | Card grid updated by build script to include hero images |
| `deploy/blog/images/hero/**` | NEW — 16 curated images across 5 categories |
| n8n "Build Claude Prompt" node | Add CALLOUT/STAT/blockquote instructions + word count bump |
| `deploy/scripts/generate-draft.js` | Same prompt change (keep local script in sync) |

---

## Build Sequence (What I'll Do Autonomously)

1. Source + download 16 Unsplash images, optimise to <200KB WebP+JPG, commit to repo
2. Update `build-blog.js`:
   - New `getPostTemplate()` with all enhancements
   - New `blocksToHtml()` with TOC + callout + stat parsing
   - Hero image selector function
   - Reading time calculator
   - Mid-CTA injector
3. Update the Claude prompt in both `generate-draft.js` and prepare a snippet for n8n
4. Commit in logical pieces with clear messages
5. Push to main → GitHub Pages rebuilds → site updates
6. Trigger `publish-posts.yml` manually to regenerate all existing posts with new template
7. Verify: visit apodcastgeek.com/blog.html + 2-3 individual posts + mobile view
8. Report back with screenshots / URLs for you to review v1

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing posts break when regenerated | Template is additive - existing H2/p/ul content still renders correctly |
| TOC breaks on posts with weird headings | Only generate TOC if 3+ H2s present; fall back gracefully |
| Claude doesn't use CALLOUT/STAT markers | Parser is defensive; plain posts still render fine |
| Images bloat the repo | Keep to 16 optimised images (<200KB each) = 3.2MB total, fine for repo |
| Mobile layout breaks | Build with mobile-first CSS, test responsive |
| Hero image doesn't match post topic | Tag-based selection + deterministic slug hash keeps it roughly relevant |

---

## What I Need From You Before Starting

1. **Approve the plan above** (or tell me what to change)
2. **Confirm one design choice:** Do you want the hero image to be the OG image too (used when links are shared on social), or keep a generic APG OG image? Recommendation: use the post hero, more clicks from social.

After approval, I execute end-to-end and show you v1 live on the site. No interruptions expected — if I hit a blocker, I'll figure it out or come back with a clear question, not half-finished work.

## What I'm NOT Doing in V1 (Deliberate)

- No AI-generated images (quality isn't reliable enough yet)
- No inline body images (hero only for v1, simpler, less can go wrong)
- No interactive elements (quizzes, calculators) — phase 2
- No comment system — phase 2
- No newsletter signup inline — phase 2
- No migration of content to WordPress or other CMS — Notion + GitHub stays

---

## Estimated Completion Time

~2-3 hours from approval to live v1. I'll update you at key checkpoints (images committed, template deployed, site verified).
