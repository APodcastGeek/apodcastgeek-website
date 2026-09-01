#!/usr/bin/env python3
"""
Clean the topic briefs in the n8n "Blog Content Calendar" data table.

A brief is an instruction to the writer. On 2026-08-31 brief week 20 told the
writer that APG charges 2000 euro for production-only and 4000 euro for the
Brand Builder, both invented, and the writer obeyed. Six briefs carry claims
that contradict scripts/_apg-facts.md: invented pricing, "6 clips" where the
spec is 5, and a service structure APG does not sell.

This rewrites those six so they can never instruct a hallucination again.

Run with --dry-run first. Verify with check-blog-facts-sync.py afterwards.
"""
import json, os, sys, urllib.request

BASE = 'https://apodcastgeek.app.n8n.cloud/api/v1'
TABLE = 'rZBZrFRH3k7VB4Sr'
DRY = '--dry-run' in sys.argv

STANDARD_POINTS = [
    "APG sells Production-Only, plus the APG Brand Builder at Monthly (1 ep/mo), Bi-Weekly (2 ep/mo) and Weekly (4 ep/mo) cadences",
    "6-month minimum commitment",
    "10 business day turnaround from recording to full delivery",
    "Every episode includes video, audio, guest intro trailer, 5 short-form clips, 3 thumbnails, show notes and an SEO article",
]

NO_MONEY = ("Do NOT state any price, cost, range, budget or currency figure for APG or for anyone else, "
            "in any currency. Discuss what is included and what the work involves, then send the reader "
            "to a 30 minute strategy call for numbers.")

# row id -> (expected keyword, fields to overwrite). Keyed on id because three
# separate briefs share week 0, so week is not a unique key. The expected keyword
# is asserted before any write so a renumbered table can never hit the wrong row.
FIXES = {
    3: ("how much does B2B podcast production cost", {
        'brief': (
            "Answer the cost question honestly without ever stating a figure. Explain what actually drives "
            "the cost of a B2B podcast: editing hours, video as well as audio, clip production, thumbnail "
            "design, show notes and article writing, publishing and distribution, and the strategy layer. "
            "Compare doing it yourself, hiring a freelancer, and using an agency in terms of what each one "
            "asks of the founder's own time and what quality risk each carries. Explain why APG bundles "
            "every episode into a fixed deliverable set rather than selling items a la carte. "
            + NO_MONEY +
            " Target keyword: how much does podcast production cost. Word count: 2000-2500."),
        'data_points': json.dumps(STANDARD_POINTS),
    }),
    1: ("what does a podcast production agency do", {
        'brief': (
            "Explain exactly what APG delivers per episode: video podcast, audio podcast, guest intro "
            "trailer, 5 short-form clips, 3 thumbnails, show notes, and an SEO article for the client's "
            "website. Cover the pre-production brief that goes to both host and guest before recording, "
            "and the 10 business day turnaround from recording to full delivery. Contrast this with what a "
            "freelance editor does and does not cover. " + NO_MONEY +
            " Target keyword: what does a podcast production agency do. Word count: 1800-2200."),
        'data_points': json.dumps(STANDARD_POINTS),
    }),
    8: ("video podcast vs audio podcast B2B", {
        'data_points': json.dumps([
            "Every episode produces both a full video episode and a full audio episode",
            "5 short-form vertical clips per episode for LinkedIn, Reels, TikTok and Shorts",
            "3 on-brand thumbnails per episode",
            "10 business day turnaround from recording to full delivery",
        ]),
    }),
    11: ("podcast content repurposing LinkedIn", {
        'data_points': json.dumps([
            "5 short-form vertical clips per episode, captioned, built for LinkedIn, Instagram Reels, TikTok and YouTube Shorts",
            "An SEO-optimised article version of every episode for the client's own website",
            "Show notes with summary, guest bio, chapter timestamps and links",
        ]),
    }),
    14: ("get CFO approval podcast budget B2B", {
        'brief': (
            "ROI-first framing for finance stakeholders. Cover how to frame a podcast as a pipeline "
            "generator rather than a marketing cost, the 10% guest-to-client conversion figure translated "
            "into pipeline terms, how to build the business case, and the metrics finance actually cares "
            "about (pipeline influenced, deal acceleration, payback). Include a one-page business case "
            "outline a CFO would read. Address the common objections. End on how the 6-month minimum "
            "commitment reflects when compounding results begin. " + NO_MONEY +
            " Target keyword: podcast budget approval. Word count: 2000-2500."),
        'data_points': json.dumps([
            "On average, 10% of podcast guests convert to customers or long-term partnerships",
            "6-month minimum commitment",
            "APG sells Production-Only, plus the APG Brand Builder at Monthly, Bi-Weekly and Weekly cadences",
        ]),
    }),
    20: ("podcast production cost Ireland 2000 euro", {
        'keyword': 'podcast production Ireland what you get',
        'title_suggestion': 'What Professional B2B Podcast Production Actually Includes in Ireland',
        'brief': (
            "An Ireland-specific, figure-free breakdown of what serious B2B podcast production includes and "
            "what it does not. Walk through each deliverable and why it exists: the video episode, the "
            "audio episode, the guest intro trailer, the 5 clips, the 3 thumbnails, the show notes, and the "
            "SEO article. Explain what a founder ends up doing themselves when a provider leaves any of "
            "these out. Cover the 10 business day turnaround and why speed protects momentum. Build trust "
            "through transparency about scope, not through price comparison. " + NO_MONEY +
            " Target keyword: podcast production Ireland. Word count: 2000-2500."),
        'data_points': json.dumps(STANDARD_POINTS),
    }),
}


def api(path, method='GET', body=None):
    key = os.environ['N8N_CLOUD_API_KEY']
    req = urllib.request.Request(
        BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'X-N8N-API-KEY': key, 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())


def main():
    rows = {r['id']: r for r in api('/data-tables/%s/rows?limit=200' % TABLE)['data']}
    for row_id, (expected_keyword, fields) in sorted(FIXES.items()):
        row = rows.get(row_id)
        if row is None:
            print('row id %s not found, skipping' % row_id)
            continue
        if row.get('keyword') != expected_keyword:
            print('ABORT: row id %s is "%s", expected "%s". Table has been renumbered.'
                  % (row_id, row.get('keyword'), expected_keyword))
            sys.exit(1)
        changed = {k: v for k, v in fields.items() if row.get(k) != v}
        if not changed:
            print('id %-3s already clean (%s)' % (row_id, expected_keyword))
            continue
        print('id %-3s %-45s updating: %s' % (row_id, expected_keyword[:45], ', '.join(sorted(changed))))
        res = api('/data-tables/%s/rows/update' % TABLE, method='PATCH', body={
            'filter': {'type': 'and', 'filters': [
                {'columnName': 'id', 'condition': 'eq', 'value': row_id}]},
            'data': changed, 'returnData': True, 'dryRun': DRY})
        # With returnData the API returns the row twice, before and after, so
        # judge on the set of distinct ids rather than the list length.
        touched = sorted({r.get('id') for r in res}) if isinstance(res, list) else res
        if isinstance(touched, list) and touched != [row_id]:
            print('ABORT: filter matched rows %s, expected only [%s]' % (touched, row_id))
            sys.exit(1)
        print('        -> row %s %s' % (row_id, 'would be updated (dry run)' if DRY else 'updated'))


if __name__ == '__main__':
    main()
