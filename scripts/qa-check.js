#!/usr/bin/env node
/**
 * APG site QA gate.
 *
 * Runs before deploy and on every push. Catches the classes of defect that have
 * actually cost us: client pages leaking into Google, duplicate/thin posts,
 * broken links, and AI-generated copy that breaks house style.
 *
 * Usage:
 *   node scripts/qa-check.js            # full run, exits 1 on any error
 *   node scripts/qa-check.js --warn-only
 *   node scripts/qa-check.js --only=indexing,brand
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://apodcastgeek.com";

// Directories whose contents are client-confidential or single-prospect pages.
// Anything here MUST be noindex and MUST NOT appear in the sitemap.
const PRIVATE_PREFIXES = [
  "reports/",
  "decks/",
  "deck-template/",
  "clients/",
  "vsl/",
  "podcast-design/",
];

// Individually private pages that do not sit under a private prefix.
// Client and internal use only: these must stay noindex and out of the sitemap.
const PRIVATE_FILES = [
  "statutes-and-stethoscopes.html",
];

// Files that are fragments or error pages, not real pages.
const NOT_A_PAGE = ["_nav-snippet.html", "404.html"];

const SKIP_DIRS = new Set(["node_modules", ".git", ".firebase", "functions"]);

const IMG_WARN_KB = 400;
const IMG_ERROR_KB = 1024;
// Client decks and design reviews trade weight for fidelity on purpose.
const PRIVATE_IMG_WARN_KB = 2048;
const PRIVATE_IMG_ERROR_KB = 5120;
const DESC_MIN = 110;
const DESC_MAX = 165;
const TITLE_MAX = 70;

// ---------------------------------------------------------------- utilities

const findings = [];
function report(severity, rule, file, message) {
  findings.push({ severity, rule, file, message });
}
const error = (rule, file, msg) => report("error", rule, file, msg);
const warn = (rule, file, msg) => report("warn", rule, file, msg);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(path.relative(ROOT, full));
  }
  return acc;
}

/** Visible copy only: strips scripts, styles, comments and tags. */
function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(html, re) {
  const m = html.match(re);
  return m ? m[m.length - 1].trim() : null;
}

/**
 * Attribute values are delimited by whichever quote opened them, so the closing
 * quote has to be a backreference. Matching /["']/ instead truncates any value
 * containing an apostrophe, which silently turned "Ireland's award-winning..."
 * into "Ireland" and made this gate report a 7-character meta description.
 */
function tagAttr(html, tagRe, attrName) {
  const re = new RegExp(`<${tagRe}[^>]*\\b${attrName}=(["'])([\\s\\S]*?)\\1`, "i");
  const m = html.match(re);
  return m ? m[2].trim() : null;
}

function metaBy(html, keyAttr, keyValue) {
  const re = new RegExp(
    `<meta[^>]*\\b${keyAttr}=(["'])${keyValue}\\1[^>]*>|<meta[^>]*>`,
    "gi"
  );
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = tagAttr(tag, "meta", keyAttr);
    if (key && key.toLowerCase() === keyValue.toLowerCase()) {
      return tagAttr(tag, "meta", "content");
    }
  }
  return null;
}

const meta = (html, name) => metaBy(html, "name", name);
const prop = (html, property) => metaBy(html, "property", property);

const titleOf = (html) => attr(html, /<title>([\s\S]*?)<\/title>/i);

const canonicalOf = (html) => {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tagAttr(m[0], "link", "rel");
    if (rel && rel.toLowerCase() === "canonical") return tagAttr(m[0], "link", "href");
  }
  return null;
};

/** Retired posts are kept as redirect stubs. They are plumbing, not content. */
const isRedirectStub = (html) =>
  /<meta[^>]+http-equiv=(["'])refresh\1/i.test(html) ||
  /window\.location\.replace/i.test(html);

const isPrivate = (file) =>
  PRIVATE_PREFIXES.some((p) => file.startsWith(p)) || PRIVATE_FILES.includes(file);
const isNoindex = (html) => /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html);

/** Canonical public URL for a file path, matching Firebase Hosting's behaviour. */
function canonicalUrlFor(file) {
  if (file === "index.html") return `${SITE}/`;
  if (file.endsWith("/index.html")) return `${SITE}/${file.slice(0, -"index.html".length)}`;
  return `${SITE}/${file}`;
}

// ---------------------------------------------------------------- load site

const allFiles = walk(ROOT);
const fileSet = new Set(allFiles);

const pages = allFiles
  .filter((f) => f.endsWith(".html"))
  .filter((f) => !NOT_A_PAGE.includes(path.basename(f)) && !NOT_A_PAGE.includes(f))
  .map((f) => {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    return { file: f, html, private: isPrivate(f), noindex: isNoindex(html) };
  });

const indexable = pages.filter(
  (p) => !p.noindex && !p.private && !isRedirectStub(p.html)
);

// ---------------------------------------------------------------- waivers

/**
 * A gate nobody can waive is a gate people learn to ignore. A gate anyone can
 * waive forever is not a gate. So: waivers are explicit, owned, and expire.
 */
function loadWaivers() {
  const file = path.join(__dirname, "qa-waivers.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).waivers || [];
  } catch (err) {
    console.error(`Could not parse qa-waivers.json: ${err.message}`);
    process.exit(2);
  }
}

const waivers = loadWaivers();
const today = new Date().toISOString().slice(0, 10);

function waiverFor(finding) {
  return waivers.find(
    (w) =>
      w.rule === finding.rule &&
      w.file === finding.file &&
      (!w.match || finding.message.includes(w.match))
  );
}

// ---------------------------------------------------------------- the rules

const rules = {};

/** Every internal link and asset reference resolves to a real file. */
rules.links = () => {
  const resolves = (target) => {
    const clean = target.replace(/^\//, "").split("#")[0].split("?")[0];
    if (!clean) return true;
    return (
      fileSet.has(clean) ||
      fileSet.has(clean.replace(/\/$/, "") + "/index.html") ||
      fileSet.has(clean + ".html")
    );
  };

  for (const { file, html } of pages) {
    const refs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const ref of new Set(refs)) {
      if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(ref)) continue;
      const resolved = ref.startsWith("/")
        ? ref
        : path.posix.join(path.posix.dirname(file), ref);
      if (!resolves(resolved)) error("links", file, `dead reference: ${ref}`);
    }
  }
};

/**
 * Confidentiality and indexing. This is the expensive one: a client report or
 * a prospect deck reaching Google is a trust problem, not an SEO problem.
 */
rules.indexing = () => {
  for (const page of pages) {
    if (page.private && !page.noindex) {
      error("indexing", page.file, "private page is missing <meta name=\"robots\" content=\"noindex\"> and can be indexed");
    }
  }

  const sitemapPath = path.join(ROOT, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) {
    error("indexing", "sitemap.xml", "sitemap is missing");
    return;
  }
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

  const byUrl = new Map(pages.map((p) => [canonicalUrlFor(p.file), p]));

  for (const loc of locs) {
    const page = byUrl.get(loc);
    if (!page) {
      error("indexing", "sitemap.xml", `lists a URL with no matching page: ${loc}`);
      continue;
    }
    if (page.noindex) {
      error("indexing", "sitemap.xml", `lists a noindex page, which tells Google two different things: ${loc}`);
    }
    if (page.private) {
      error("indexing", "sitemap.xml", `lists a private/client page: ${loc}`);
    }
  }

  const listed = new Set(locs);
  for (const page of indexable) {
    if (!listed.has(canonicalUrlFor(page.file))) {
      warn("indexing", page.file, "indexable page is not in sitemap.xml");
    }
  }

  if (new Set(locs).size !== locs.length) {
    error("indexing", "sitemap.xml", "contains duplicate <loc> entries");
  }
};

/** Search essentials on pages we actually want ranking. */
rules.seo = () => {
  for (const { file, html } of indexable) {
    const title = titleOf(html);
    if (!title) error("seo", file, "missing <title>");
    else if (title.length > TITLE_MAX) warn("seo", file, `title is ${title.length} chars, will truncate in results (max ${TITLE_MAX})`);

    const description = meta(html, "description");
    if (!description) error("seo", file, "missing meta description");
    else if (description.length < DESC_MIN || description.length > DESC_MAX) {
      warn("seo", file, `meta description is ${description.length} chars (target ${DESC_MIN}-${DESC_MAX})`);
    }

    const canonical = canonicalOf(html);
    const expected = canonicalUrlFor(file);
    if (!canonical) error("seo", file, "missing canonical link");
    else if (canonical !== expected) {
      error("seo", file, `canonical points at ${canonical} but this file serves ${expected}`);
    }

    if (!prop(html, "og:image")) warn("seo", file, "missing og:image, shares will render bare");
    if (!/googletagmanager\.com\/gtag|gtag\(/i.test(html)) {
      warn("seo", file, "no analytics tag, traffic to this page is invisible");
    }
  }
};

/** Duplicate titles and descriptions cannibalise rankings. */
rules.duplicates = () => {
  const seenTitle = new Map();
  const seenDesc = new Map();
  for (const { file, html } of indexable) {
    const title = titleOf(html);
    const description = meta(html, "description");
    if (title) {
      if (seenTitle.has(title)) error("duplicates", file, `shares its <title> with ${seenTitle.get(title)}`);
      else seenTitle.set(title, file);
    }
    if (description) {
      if (seenDesc.has(description)) error("duplicates", file, `shares its meta description with ${seenDesc.get(description)}`);
      else seenDesc.set(description, file);
    }
  }
};

/**
 * House style, enforced on published copy. The blog is generated by an LLM and
 * committed without a human read, so the style rules in the prompt need a gate
 * behind them: a prompt is a request, a check is a guarantee.
 */
rules.brand = () => {
  const posts = pages.filter(
    (p) =>
      p.file.startsWith("blog/") &&
      path.basename(p.file) !== "index.html" &&
      !isRedirectStub(p.html)
  );
  for (const { file, html } of posts) {
    const text = visibleText(html);
    if (!text) continue;

    const emDashes = (text.match(/—/g) || []).length;
    if (emDashes) error("brand", file, `${emDashes} em dash(es) in body copy, house style forbids them`);

    const bangs = (text.match(/!/g) || []).length;
    if (bangs) error("brand", file, `${bangs} exclamation mark(s) in body copy, house style forbids them`);

    const words = text.split(/\s+/).length;
    if (words < 600) warn("brand", file, `only ~${words} words, thin against the 800-1200 target`);
  }
};

/** Anything that reads as unfinished must never reach production. */
rules.placeholders = () => {
  const tells = [
    /\blorem ipsum\b/i,
    /\bTODO\b/,
    /\bTKTK\b/i,
    /\[insert[^\]]*\]/i,
    /\bXXX\b/,
    /\bundefined\b/,
    /\bNaN\b/,
    /\bnull\b/,
    /\{\{[^}]+\}\}/,
  ];
  for (const { file, html } of pages) {
    const text = visibleText(html);
    for (const tell of tells) {
      const m = text.match(tell);
      if (m) error("placeholders", file, `unfinished content marker in visible copy: "${m[0]}"`);
    }
  }
};

/**
 * Page weight is a conversion problem on mobile, not a nicety. It is only a
 * conversion problem on pages prospects actually land on, though. Client design
 * reviews and decks are shown on a call and fidelity is the deliverable there,
 * so they get a much looser ceiling that still catches an absurd upload.
 */
rules.assets = () => {
  // Images reachable from a page we want ranking are held to the tight budget.
  const publicAssets = new Set();
  for (const { file, html } of indexable) {
    for (const m of html.matchAll(/(?:href|src|content)=(["'])([^"']+)\1/gi)) {
      const ref = m[2];
      if (!/\.(png|jpe?g|gif|webp)$/i.test(ref)) continue;
      const local = ref.startsWith(SITE)
        ? ref.slice(SITE.length).replace(/^\//, "")
        : ref.startsWith("/")
          ? ref.replace(/^\//, "")
          : path.posix.join(path.posix.dirname(file), ref);
      publicAssets.add(local.split("?")[0].split("#")[0]);
    }
  }

  for (const img of allFiles.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))) {
    const kb = Math.round(fs.statSync(path.join(ROOT, img)).size / 1024);
    const onPublicPage = publicAssets.has(img);
    const warnAt = onPublicPage ? IMG_WARN_KB : PRIVATE_IMG_WARN_KB;
    const errorAt = onPublicPage ? IMG_ERROR_KB : PRIVATE_IMG_ERROR_KB;
    const surface = onPublicPage ? "public page" : "private page";

    if (kb >= errorAt) error("assets", img, `${kb}KB image on a ${surface}, over the ${errorAt}KB limit`);
    else if (kb >= warnAt) warn("assets", img, `${kb}KB image on a ${surface}, over the ${warnAt}KB budget`);
  }
};

// ---------------------------------------------------------------- run

const args = process.argv.slice(2);
const warnOnly = args.includes("--warn-only");
const onlyArg = args.find((a) => a.startsWith("--only="));
const selected = onlyArg ? onlyArg.slice("--only=".length).split(",") : Object.keys(rules);

for (const name of selected) {
  if (!rules[name]) {
    console.error(`Unknown rule: ${name}. Available: ${Object.keys(rules).join(", ")}`);
    process.exit(2);
  }
  rules[name]();
}

// An expired waiver is itself a failure: it means an accepted exception went
// unreviewed past its own deadline.
for (const w of waivers) {
  if (w.expires && w.expires < today) {
    error("waivers", w.file, `waiver for rule "${w.rule}" expired on ${w.expires}, owned by ${w.owner || "nobody"}. Fix the issue or renew the waiver.`);
  }
}

const waived = [];
const active = [];
for (const f of findings) {
  const w = f.rule === "waivers" ? null : waiverFor(f);
  if (w && (!w.expires || w.expires >= today)) waived.push({ ...f, waiver: w });
  else active.push(f);
}

const errors = active.filter((f) => f.severity === "error");
const warnings = active.filter((f) => f.severity === "warn");

const byRule = {};
for (const f of active) (byRule[f.rule] ||= []).push(f);

console.log(`\nAPG QA gate — ${pages.length} pages (${indexable.length} indexable), ${allFiles.length} files\n`);

for (const rule of Object.keys(byRule).sort()) {
  console.log(`  ${rule}`);
  for (const f of byRule[rule]) {
    console.log(`    ${f.severity === "error" ? "FAIL" : "warn"}  ${f.file}: ${f.message}`);
  }
  console.log("");
}

if (!active.length) console.log("  All checks passed.\n");

if (waived.length) {
  console.log("  waived (accepted exceptions)");
  for (const f of waived) {
    console.log(`    skip  ${f.file}: ${f.message} [expires ${f.waiver.expires || "never"}]`);
  }
  console.log("");
}

console.log(
  `${errors.length} error(s), ${warnings.length} warning(s), ${waived.length} waived\n`
);

process.exit(errors.length && !warnOnly ? 1 : 0);
