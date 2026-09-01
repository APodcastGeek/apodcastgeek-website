#!/usr/bin/env python3
"""
Push the master APG blog fact sheet (scripts/_apg-facts.md) into the live n8n
workflow "APG - Weekly Blog Generation" (CMDZT5muFWO5Y614), and harden the
guard rails around it.

Written 2026-08-31 after a blog post went live claiming APG Brand Builder
"runs $2,000 to $7,000+ monthly" with invented tier prices in the wrong
currency. The figures came from a topic brief; the fact checker had no
pricing to check them against.

What this changes in the live workflow:
  1. "Build Claude Prompt"  -> approvedFacts becomes the exact contents of
                               scripts/_apg-facts.md (byte for byte, so
                               check-blog-facts-sync.py can prove no drift)
  2. "Parse Validation"     -> adds hard local checks for monetary figures,
                               wrong service structure, and guest recruitment
                               described as included
  3. Both Slack alert nodes -> re-enabled and pointed at the webhook that is
                               proven to work, so failures stop being silent
  4. New node               -> alerts when the brief queue runs dry, instead
                               of the workflow silently doing nothing

Run with --dry-run to see the diff without writing.
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FACTS_PATH = os.path.join(HERE, '_apg-facts.md')
WF_ID = 'CMDZT5muFWO5Y614'
BASE = 'https://apodcastgeek.app.n8n.cloud/api/v1'
# The Slack webhook is NEVER stored in this repo. It is read at runtime from the
# node that is already proven to work ("Notify Slack - Draft Created" returned
# "ok" on the 2026-08-31 run), so the alert nodes reuse a known-good destination.
DRAFT_ALERT_NODE = 'Notify Slack - Draft Created'

DRY = '--dry-run' in sys.argv


def api(path, method='GET', body=None):
    key = os.environ['N8N_CLOUD_API_KEY']
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, method=method, data=data,
        headers={'X-N8N-API-KEY': key, 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())


def node(wf, name):
    for n in wf['nodes']:
        if n['name'] == name:
            return n
    raise SystemExit('node not found in live workflow: ' + name)


# ---------------------------------------------------------------- new checks
# RULE ZERO plus the structure claims Dave corrected on 2026-08-31.
NEW_LOCAL_CHECKS = r"""const localChecks = [
  { re: /[€$£]\s?\d|\b\d[\d,.]*\s*(?:euro|euros|eur|dollars?|usd|pounds?|gbp)\b/i, issue: 'RULE ZERO VIOLATION: contains a monetary figure. Blog posts must never state any price, cost, range or budget in any currency.' },
  { re: /\btwo fixed tiers?\b/i, issue: 'Wrong service structure: APG sells Production-Only plus Brand Builder at Monthly, Bi-Weekly and Weekly cadences' },
  { re: /\benterprise (tier|package|plan|option)\b|\bcustom (tier|package)\b/i, issue: 'Invented tier: there is no enterprise or custom tier' },
  { re: /guest (recruitment|outreach|booking)[^.]{0,80}\b(is included|included in|standard|part of (the |our )?(package|service|brand builder))/i, issue: 'Guest recruitment described as included. It is an ADD-ON, never standard.' },
  { re: /\b(we|apg) handles? all guest outreach\b|\bhandles all guest outreach, follow-ups\b/i, issue: 'Guest recruitment described as included. It is an ADD-ON, never standard.' },
  { re: /\b6 short[- ]form clips?\b|\bsix clips\b|\b6 clips\b|\bfour clips\b|\b4 clips\b|\bthree clips\b/i, issue: 'Wrong clip count (spec is 5)' },
  { re: /\b(2|5|two|five) (on-brand )?thumbnails\b/i, issue: 'Wrong thumbnail count (spec is 3)' },
  { re: /\b20[- ]minute (strategy |discovery |)(call|chat)|\b15[- ]minute (strategy |discovery |)(call|chat)|\b45[- ]minute (strategy |discovery |)(call|chat)/i, issue: 'Wrong call duration (spec is 30 min)' },
  { re: /\baudiogram(s| clips?)?\b/i, issue: 'Forbidden: Audiograms not in Brand Builder' },
  { re: /\bquote (graphics|cards)\b/i, issue: 'Forbidden: Quote graphics not in Brand Builder' },
  { re: /\btranscripts? for (seo|accessibility)\b|\b(?:asset pack|deliverables?|every episode includes|you (?:also )?(?:get|receive))[^.]{0,80}\btranscripts?\b/i, issue: 'Forbidden: Transcripts are not a Brand Builder deliverable' },
  { re: /\b14 business day|\btwo[- ]week turnaround|\b2[- ]week turnaround\b/i, issue: 'Wrong turnaround (spec is 10 business days)' },
  { re: /\b3[- ]month minimum|\b12[- ]month minimum\b/i, issue: 'Wrong minimum commitment (spec is 6 months)' },
  { re: /\bwebby|ambie|signal award/i, issue: 'Invented award (only Irish Podcast Awards are approved)' },
  { re: /\bapg-brand-builder-podcast-design-call\b/i, issue: 'Stale Calendly URL' },
  { re: /\bas of 202[0-4]\b|\b(?:this year|currently|right now)[^.]{0,25}\b202[0-4]\b|\b202[0-4] (?:is|marks) the current year\b/i, issue: 'Stale year used as the present (referring to a past year as history is fine)' }
];"""

QUEUE_EMPTY_NODE = {
    'parameters': {
        'method': 'POST',
        'url': None,  # filled at runtime from the live workflow, never stored here
        'sendBody': True,
        'specifyBody': 'json',
        'jsonBody': '={{ JSON.stringify({ "text": ":rotating_light: *APG blog engine has run out of topic briefs*\\nThe weekly run found no unused brief in the Blog Content Calendar, so NO blog draft was generated today.\\n\\nThis will repeat every Monday until new briefs are added and approved. Nothing is broken, but nothing is being produced either." }) }}',
        'options': {},
    },
    'id': 'e1b7c9a4-3d55-4f21-9c88-0a7f2b6d41ee',
    'name': 'Slack - Brief Queue Empty',
    'type': 'n8n-nodes-base.httpRequest',
    'typeVersion': 4.4,
    'position': [1024, 464],
}


def main():
    facts = open(FACTS_PATH, encoding='utf-8').read()
    wf = api('/workflows/' + WF_ID)
    changes = []

    working_slack = node(wf, DRAFT_ALERT_NODE)['parameters'].get('url')
    if not working_slack or 'hooks.slack.com' not in working_slack:
        raise SystemExit('could not read a Slack webhook from "%s" in the live workflow' % DRAFT_ALERT_NODE)
    QUEUE_EMPTY_NODE['parameters']['url'] = working_slack

    # 1. fact sheet, embedded as a single-line JSON string literal so that
    #    check-blog-facts-sync.py can extract and compare it byte for byte.
    bp = node(wf, 'Build Claude Prompt')
    code = bp['parameters']['jsCode']
    new_line = 'const approvedFacts = ' + json.dumps(facts) + ';'
    code2, n = re.subn(r'const approvedFacts = `.*?`;', lambda m: new_line, code, count=1, flags=re.S)
    if n != 1:
        code2, n = re.subn(r'^const approvedFacts = ".*";$', lambda m: new_line, code, count=1, flags=re.M)
    if n != 1:
        raise SystemExit('could not locate the approvedFacts assignment in Build Claude Prompt')
    if code2 != code:
        bp['parameters']['jsCode'] = code2
        changes.append('Build Claude Prompt: approvedFacts replaced with scripts/_apg-facts.md (%d chars)' % len(facts))

    # 2. hardened local checks
    pv = node(wf, 'Parse Validation')
    pcode = pv['parameters']['jsCode']
    pcode2, n = re.subn(r'const localChecks = \[.*?\];', lambda m: NEW_LOCAL_CHECKS, pcode, count=1, flags=re.S)
    if n != 1:
        raise SystemExit('could not locate localChecks in Parse Validation')
    if pcode2 != pcode:
        pv['parameters']['jsCode'] = pcode2
        changes.append('Parse Validation: localChecks hardened (money ban, tier structure, guest recruitment)')

    # 3. re-enable the two alert nodes and point them at the working webhook
    for name in ('Notify Slack - Validation Failed', 'Slack - Skipped Duplicate'):
        nd = node(wf, name)
        if nd.get('disabled'):
            nd.pop('disabled', None)
            changes.append(name + ': re-enabled (was silently switched off)')
        if nd['parameters'].get('url') != working_slack:
            nd['parameters']['url'] = working_slack
            changes.append(name + ': repointed to the Slack webhook that is proven to work')

    # 4. alert when the brief queue runs dry
    if not any(x['name'] == QUEUE_EMPTY_NODE['name'] for x in wf['nodes']):
        wf['nodes'].append(QUEUE_EMPTY_NODE)
        wf['connections']['Brief Found?']['main'][1] = [
            {'node': 'Slack - Brief Queue Empty', 'type': 'main', 'index': 0}]
        wf['connections']['Slack - Brief Queue Empty'] = {
            'main': [[{'node': 'No Briefs Left - End', 'type': 'main', 'index': 0}]]}
        changes.append('Added "Slack - Brief Queue Empty": the empty-queue path now alerts instead of silently doing nothing')

    if not changes:
        print('No changes needed, live workflow already matches.')
        return

    print('CHANGES TO APPLY:')
    for c in changes:
        print('  -', c)

    if DRY:
        print('\n--dry-run: nothing written.')
        return

    api('/workflows/' + WF_ID, method='PUT', body={
        'name': wf['name'], 'nodes': wf['nodes'],
        'connections': wf['connections'], 'settings': {'executionOrder': 'v1'}})
    print('\nWritten to live workflow', WF_ID)


if __name__ == '__main__':
    main()
