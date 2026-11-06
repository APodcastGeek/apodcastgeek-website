const localChecks = [
  { re: /[$£€]\s?\d|\b\d[\d,.]*\s*(?:dollars?|usd|pounds?|gbp|euros?|eur)\b/i, issue: 'RULE ZERO VIOLATION: monetary amounts are excluded from blog copy.' },
  { re: /\btwo fixed tiers?\b|\b(?:enterprise|custom) (?:tier|package|plan)\b/i, issue: 'Unsupported service tier.' },
  { re: /guest (?:acquisition|recruitment|outreach)|guest[- ]to[- ](?:client|customer)/i, issue: 'Guest acquisition and conversion offers are retired.' },
  { re: /\b(?:6|six|4|four|3|three) (?:short[- ]form |captioned )?clips\b/i, issue: 'Wrong clip count (spec is five).' },
  { re: /\b(?:2|5|two|five) (?:on-brand )?thumbnails\b/i, issue: 'Wrong thumbnail count (spec is three).' },
  { re: /\b(?:15|20|45)[- ]minute (?:strategy |discovery )?(?:call|chat)\b/i, issue: 'Wrong call duration (spec is 30 minutes).' },
  { re: /\baudiograms?\b|\bquote (?:graphics|cards)\b/i, issue: 'Unsupported deliverable.' },
  { re: /\btranscripts? for (?:seo|accessibility)\b/i, issue: 'Transcripts are not a promised Brand Builder deliverable.' },
  { re: /\b(?:\d+|five|ten|fourteen|two)[- ](?:business[- ]?)?(?:days?|weeks?)[^.]{0,30}(?:turnaround|delivery)|\b(?:deliver|turnaround)[^.]{0,40}\b(?:\d+|five|ten|fourteen|two) (?:business )?(?:days?|weeks?)/i, issue: 'Numbered delivery promises are excluded from marketing copy.' },
  { re: /\b(?:6|six|12|twelve)[- ]month (?:minimum|commitment)/i, issue: 'Outdated minimum commitment.' },
  { re: /\bwebby|ambie|signal award/i, issue: 'Unsupported award.' },
  { re: /apg-brand-builder-podcast-design-call|roi-calculator|b2b-podcast-launch-checklist/i, issue: 'Retired destination.' },
  { re: /\b(?:hosting|hosting subscription) (?:is )?(?:included|free)|\bwe pay (?:for )?(?:your )?hosting/i, issue: 'Clients pay their hosting subscription separately.' }
];
