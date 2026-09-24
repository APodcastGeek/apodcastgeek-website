#!/usr/bin/env node
/**
 * Pre-deploy guard: fail if an HTML file under the site root is publicly
 * indexable by accident.
 *
 * A file passes when either:
 *   - it is on the public allowlist, or
 *   - it contains <meta name="robots" content="...noindex...">
 *     (noindex, nofollow — the same pattern as demopod.html — or noindex, follow).
 *
 * Soft redirect stubs already include noindex and pass without being allowlisted.
 * Do not add those stubs, private kits, decks, reports, demos, or ungated
 * downloads to the allowlist.
 *
 * How to add a new public page to the allowlist:
 *   1. Add its URL to STATIC_PAGES in scripts/build-blog.js (this is what the
 *      sitemap build publishes). Marketing pages such as contact.html live there.
 *   2. Add the same URL to sitemap.xml if this change does not regenerate the
 *      sitemap. Real blog posts are allowlisted from sitemap.xml <loc> entries
 *      once scripts/build-blog.js writes them there.
 *   3. Run: node scripts/check-noindex.js
 *
 * Anything else that ships as HTML must carry a noindex robots meta. The check
 * skips node_modules, functions/node_modules, and .git. _nav-snippet.html is an
 * authoring fragment (robots.txt already Disallows it), not a page.
 *
 * Local failure check (do not commit the probe):
 *   printf '%s\n' '<!DOCTYPE html><title>probe</title>' > noindex-probe.html
 *   node scripts/check-noindex.js ; echo exit:$?
 *   rm -f noindex-probe.html
 */

const fs = require('fs');
const path = require('path');
const { STATIC_PAGES } = require('./build-blog');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git']);
const IGNORED_FILES = new Set([
  '_nav-snippet.html'
]);

function locToRepoPath(loc) {
  let p = String(loc || '').trim();
  p = p.replace(/^https?:\/\/[^/]+/i, '');
  p = p.split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = '/' + p;
  if (p === '/') return 'index.html';
  if (p.endsWith('/')) return p.slice(1) + 'index.html';
  return p.slice(1);
}

function publicAllowlist() {
  const allow = new Set();
  for (const page of STATIC_PAGES) {
    if (page && page.loc) allow.add(locToRepoPath(page.loc));
  }
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    allow.add(locToRepoPath(match[1]));
  }
  return allow;
}

function hasNoindex(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\bname\s*=\s*["']robots["']/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (content && /\bnoindex\b/i.test(content[1])) return true;
  }
  return false;
}

function walkHtml(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walkHtml(path.join(dir, ent.name), out);
      continue;
    }
    if (ent.isFile() && ent.name.toLowerCase().endsWith('.html')) {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

function findViolations() {
  const allow = publicAllowlist();
  const violations = [];
  for (const abs of walkHtml(ROOT, [])) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (IGNORED_FILES.has(rel)) continue;
    if (allow.has(rel)) continue;
    const html = fs.readFileSync(abs, 'utf8');
    if (!hasNoindex(html)) violations.push(rel);
  }
  violations.sort();
  return violations;
}

function main() {
  const violations = findViolations();
  if (violations.length === 0) {
    console.log('noindex guard: ok (every non-public HTML file has noindex)');
    return;
  }
  console.error('noindex guard: these HTML files are publicly indexable and are not on the allowlist:');
  for (const rel of violations) console.error('  ' + rel);
  console.error('');
  console.error('Add <meta name="robots" content="noindex, nofollow"> (see demopod.html),');
  console.error('or add an intentional public page to STATIC_PAGES in scripts/build-blog.js');
  console.error('and sitemap.xml. See the comment at the top of scripts/check-noindex.js.');
  process.exit(1);
}

main();
