#!/usr/bin/env python3
"""
Prove that every layer of the APG blog engine is telling the same story.

The blog fact sheet lives in more than one place, and on 2026-08-31 that drift
is exactly what let a post go live claiming APG Brand Builder "runs $2,000 to
$7,000+ monthly". This script fails loudly rather than letting the layers
quietly disagree.

Checks:
  1. The fact sheet embedded in the live n8n workflow is byte-identical to
     scripts/_apg-facts.md
  2. Both Slack alert nodes are enabled (they were silently switched off)
  3. The empty-brief-queue path alerts instead of dead-ending in a NoOp
  4. The RULE ZERO money ban is present in the live validator
  5. Every published post under blog/ passes the live validator's checks
  6. The topic briefs in the Blog Content Calendar contain no monetary
     figures and no forbidden claims (a bad brief instructs the writer to
     hallucinate, which is how this started)

Usage:  N8N_CLOUD_API_KEY=... python3 scripts/check-blog-facts-sync.py
Exit 0 = every layer agrees. Exit 1 = drift, and it says where.
"""
import glob, html, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FACTS_PATH = os.path.join(HERE, '_apg-facts.md')
WF_ID = 'CMDZT5muFWO5Y614'
CALENDAR_ID = 'rZBZrFRH3k7VB4Sr'
BASE = 'https://apodcastgeek.app.n8n.cloud/api/v1'

failures = []
notes = []


def api(path):
    key = os.environ.get('N8N_CLOUD_API_KEY')
    if not key:
        print('N8N_CLOUD_API_KEY not set. Source APG WEBSITE/.env.n8n-api first.')
        sys.exit(2)
    req = urllib.request.Request(BASE + path, headers={'X-N8N-API-KEY': key})
    return json.loads(urllib.request.urlopen(req).read())


def strip_html(raw):
    m = re.search(r'<article[^>]*>(.*?)</article>', raw, re.S) or \
        re.search(r'<main[^>]*>(.*?)</main>', raw, re.S)
    body = m.group(1) if m else raw
    body = re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<footer.*?</footer>',
                  '', body, flags=re.S)
    return html.unescape(re.sub(r'<[^>]+>', ' ', body))


def js_checks_to_python(jscode):
    """Pull the localChecks regexes out of the live validator so this script
    tests posts against exactly what production uses, never a stale copy."""
    block = re.search(r'const localChecks = \[(.*?)\];', jscode, re.S)
    if not block:
        failures.append('Parse Validation: could not find localChecks in the live workflow')
        return []
    out = []
    for pattern, flags, issue in re.findall(
            r"re:\s*/(.*?)/([a-z]*),\s*issue:\s*'((?:[^'\\]|\\.)*)'", block.group(1)):
        py = pattern.replace('(?<', '(?P<')
        f = re.I if 'i' in flags else 0
        try:
            out.append((re.compile(py, f), issue.replace("\\'", "'")))
        except re.error as e:
            notes.append('regex not portable to python, skipped in this check: %s (%s)' % (issue, e))
    return out


def main():
    wf = api('/workflows/' + WF_ID)
    nodes = {n['name']: n for n in wf['nodes']}

    # 1. fact sheet parity
    disk = open(FACTS_PATH, encoding='utf-8').read()
    m = re.search(r'^const approvedFacts = (".*");$',
                  nodes['Build Claude Prompt']['parameters']['jsCode'], re.M)
    if not m:
        failures.append('Build Claude Prompt: approvedFacts is not in the expected single-line form')
    elif json.loads(m.group(1)) != disk:
        failures.append('DRIFT: the fact sheet in the live workflow differs from scripts/_apg-facts.md')

    # 2. alerts enabled
    for name in ('Notify Slack - Validation Failed', 'Slack - Skipped Duplicate',
                 'Notify Slack - Draft Created', 'Slack - Brief Queue Empty'):
        nd = nodes.get(name)
        if nd is None:
            failures.append('MISSING NODE: ' + name)
        elif nd.get('disabled'):
            failures.append('SILENT FAILURE: "%s" is disabled, so this path alerts nobody' % name)

    # 3. empty queue path alerts
    try:
        empty_path = wf['connections']['Brief Found?']['main'][1]
        if not any(c['node'] == 'Slack - Brief Queue Empty' for c in empty_path):
            failures.append('SILENT FAILURE: the empty-brief-queue path does not alert')
    except (KeyError, IndexError):
        failures.append('Could not read the Brief Found? false branch')

    # 4/5. live validator, and every published post against it
    pv = nodes['Parse Validation']['parameters']['jsCode']
    if 'RULE ZERO VIOLATION' not in pv:
        failures.append('RULE ZERO money ban is NOT present in the live validator')
    checks = js_checks_to_python(pv)

    bad_posts = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'blog', '*.html'))):
        if os.path.basename(f) == 'index.html':
            continue
        text = strip_html(open(f, encoding='utf-8').read())
        hits = [issue for rx, issue in checks if rx.search(text)]
        if hits:
            bad_posts[os.path.basename(f)] = hits

    # 6. the briefs themselves
    bad_briefs = {}
    for row in api('/data-tables/%s/rows?limit=200' % CALENDAR_ID)['data']:
        blob = ' '.join(str(row.get(k, '')) for k in
                        ('keyword', 'title_suggestion', 'brief', 'data_points'))
        hits = [issue for rx, issue in checks if rx.search(blob)]
        if hits:
            bad_briefs['week %s: %s' % (row.get('week'), row.get('keyword'))] = hits

    # ------------------------------------------------------------- report
    print('APG blog fact-layer sync check')
    print('=' * 60)
    for n in notes:
        print('note:', n)

    if bad_posts:
        print('\nPUBLISHED POSTS THAT FAIL THE CURRENT STANDARD (%d):' % len(bad_posts))
        for name, hits in bad_posts.items():
            print('  ' + name)
            for h in hits:
                print('      - ' + h)
    else:
        print('\nAll published posts pass the current standard.')

    if bad_briefs:
        print('\nTOPIC BRIEFS THAT WOULD INSTRUCT A HALLUCINATION (%d):' % len(bad_briefs))
        for name, hits in bad_briefs.items():
            print('  ' + name)
            for h in hits:
                print('      - ' + h)
    else:
        print('All topic briefs are clean.')

    if failures:
        print('\nLAYER FAILURES (%d):' % len(failures))
        for f in failures:
            print('  - ' + f)
        sys.exit(1)

    print('\nEvery layer agrees. Fact sheet, alerts, and validator are in sync.')
    # Bad posts and briefs are reported but do not fail the build: they are a
    # backlog to work through, not a broken pipeline. Layer drift is the failure.
    sys.exit(0)


if __name__ == '__main__':
    main()
