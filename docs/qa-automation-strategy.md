# Automating QA at APodcastGeek

Written for Dave, August 2026. Grounded in a read of the live codebase, not in general advice.

## 1. The reframe

"Fully automate QA" is the wrong target, and chasing it is how agencies end up with a
dashboard nobody trusts. The right target is this:

> A human should never be the thing that *finds* a defect. A human should only be the
> thing that *decides* what to do about one.

Those are different jobs. Detection is mechanical, tireless, and scales to a hundred
clients. Judgment does not scale and should not be automated. Today at APG both jobs are
done by the same overloaded person, usually you, usually at the point where it is most
expensive to catch anything.

The measurable goal: move QA effort from O(number of clients) to O(number of defects).
At 12 clients you feel this. At 30 it breaks you.

## 2. Where defects actually cost you

Three surfaces, and they are not equally dangerous.

| Surface | Volume | Cost of one escaped defect | Current automated coverage |
|---|---|---|---|
| Client deliverables (episodes, notes, artwork, distribution) | ~50/month across 12 clients | Trust, then churn. Compounds. | None |
| Client-facing automation (monthly reports, QR analytics) | 12 reports/month | A wrong number in a client's hands. Worst possible discovery channel: they tell you. | None |
| Marketing and web (site, blog, funnels) | Continuous, LLM-generated | Lost leads, SEO damage | None until now |

Rank them by *cost*, not volume. The reports surface is small in volume and enormous in
cost, because a report is a document with your name on it asserting facts about someone's
business. That is where I would start, and it is not where most agencies start.

## 3. The architecture

Four layers. Skip any one of them and the system quietly stops working.

**Specification.** You cannot automate a check that has not been written down. Right now
the definition of "done" for an episode lives in your head and in a Notion checklist. That
is the actual bottleneck, and no tool fixes it. Every deliverable needs a machine-readable
spec: loudness target, artwork dimensions, required show-note fields, chapter rules,
platform list, turnaround SLA. You already have the right home for this in
`functions/client-config.json`, which today holds only IDs. Extend it into a per-client
contract.

**Instrumentation.** The pipeline has to emit structured events. Today you poll Buzzsprout,
YouTube and Hovercode once a month for a report. That means a defect introduced on the 2nd
is discovered on the 1st of the following month, if at all. Emit a record per episode at
publish time and you shrink that window from 30 days to minutes.

**Gates.** Automated checks placed exactly where defects escape:

- *Pre-publish*: before an episode goes live.
- *Post-publish*: verify it actually landed on every platform, because "we pressed publish"
  and "it is live on Spotify" are different claims.
- *Pre-send*: before any report, invoice or deliverable reaches a client.
- *Pre-deploy*: before the site changes. This one is built and running as of this commit.

**Escalation.** Every gate failure reaches a named human in a channel they actually read,
with the specific fix attached. This is the layer people skip, and skipping it is fatal:
**a check that fails silently is worse than no check at all, because it manufactures
confidence.** Your report pipeline currently does exactly this, and section 5 covers it.

## 4. What to automate, and what never to

Sort every check into one of three tiers. The tier determines what the machine is allowed
to do about it.

**Tier 1: deterministic. Machine decides. Blocks release.**
Binary, no interpretation required. This is 70 to 80 percent of what you check by hand today.

- Did the episode publish to every platform in the client's spec, and is each URL live?
- Audio loudness inside spec (-16 LUFS stereo, -19 mono, true peak under -1 dBTP).
- Artwork present, correct dimensions, correct aspect ratio.
- Show notes present, over minimum length, containing the required CTA and links.
- Chapters and transcript present where the client's tier includes them.
- Every link and QR destination returns 200.
- Episode numbering sequential, no gaps or repeats.
- RSS feed validates.
- Report internals consistent: no nulls, no NaN, cumulative totals never decrease month over month.

**Tier 2: statistical. Machine flags. Human decides.**
Anomalies, not errors. Blocking on these trains people to override the gate, which destroys it.

- Downloads down more than 40 percent month over month.
- Episode duration outside this show's normal range.
- Dead air over 3 seconds, or clipping.
- Any report metric moving more than three standard deviations from its own trend.

**Tier 3: judgment. Human decides. Machine may only pre-screen.**

- Is the interview any good.
- Is this guest a fit for the client's ICP.
- Does the optimisation advice actually make sense for this business.
- Brand voice and nuance.

An LLM is genuinely useful here as a first-pass reviewer, and you already use one to write
the optimisation notes. Hold it to one rule:

> AI can rank and flag. AI cannot approve and cannot reject. Anything AI-graded that reaches
> a client carries a named human sign-off.

The moment AI silently approves client-facing work, you have automated away the only step
that was catching its mistakes. Your report pipeline is one small change away from that
mistake today.

## 5. What I found in your current systems

I read the live code. These are specific, and ordered by what I would fix first.

**1. Both HTTP endpoints are unauthenticated.** `uploadReportCsv` and `triggerClientReports`
in `functions/index.js` have no auth check, and the Firebase CLI publishes v2 HTTPS functions
to `allUsers` by default. Anyone who learns the URL can write arbitrary CSV into any client's
report data path, or trigger report generation against your Anthropic billing. `clientSlug`
is also written straight into a storage path without validation against the client list.
Fix: require a shared secret header at minimum, validate `clientSlug` against
`client-config.json`, and treat this as the integrity control it is. Wrong data in the
pipeline is a QA problem before it is a security problem.

**2. Report failures are silent.** `functions/index.js` catches per-client errors inside the
report loop and calls `console.error`. If Buzzsprout returns a 500 for one client, that client
silently gets no report, the job reports success, and nobody knows until the client asks.
Fix: collect failures, post a red Slack alert naming the client, and never let a run report
success while any client failed.

**3. Partial data produces a confident wrong report.** `readCsvFromStorage` returns `null` on
any failure. A missing YouTube CSV silently yields a report with no YouTube section, and the
AI still writes assured optimisation notes on the remaining data. This is the most dangerous
defect in the codebase, because it does not fail. It produces a plausible wrong answer with
your name on it. Fix: distinguish "expected absent" from "failed to read", and refuse to
generate optimisation notes on incomplete inputs.

**4. The CSV parser corrupts data silently.** `parseCsv` splits on commas with no quote
handling. YouTube exports routinely contain commas in episode titles. One such title shifts
every subsequent column, and those numbers go into a client report and into the AI's analysis.
Fix: use a real CSV parser.

**5. QR analytics match on a naming convention, not on the IDs you already store.**
`matchHovercodesToClient` filters on `display_name.startsWith(clientName)`. Rename a code in
Hovercode and that client's scans silently become zero. You already store `hovercodeQrIds`
per client in `client-config.json`. Match on those, and assert the expected count.

**6. No tests anywhere, and `functions` has `"test": "exit 1"`.** The pure functions in the
report pipeline (`processBuzzsproutData`, `parseCsv`, `getReportMonthRange`,
`matchHovercodesToClient`) are trivially unit-testable and are precisely the code computing
client-facing numbers. This is the cheapest coverage available to you.

**7. Date maths is fragile.** `getReportMonth`, `getReportMonthName` and `getReportMonthRange`
each independently do `setMonth(getMonth() - 1)`, which rolls incorrectly when run on the 31st
of a month. Safe on the scheduled run on the 1st, unsafe on the manual trigger, and the three
can disagree with each other. Compute the reporting period once and pass it down.

**8. AI-written blog posts commit straight to `main` unread.** `publish-posts.yml` builds and
pushes generated HTML with no gate. Your own prompt forbids em dashes and exclamation marks.
A prompt is a request. A check is a guarantee.

## 6. Build sequence

Ordered by payoff per unit of effort, not by tidiness.

**Phase 0, done in this commit.** Pre-deploy gate for the web surface. `scripts/qa-check.js`
validates link integrity, indexing and client confidentiality, SEO essentials, house style on
generated copy, unfinished-content markers, page weight and duplicate metadata. It runs on every
push including the automation bot's, and it fails the build. It found 7 errors and 37 warnings
on its first run, including a client design page that was publicly indexable.

**Phase 1, about a day. Stop the silent failures.** Fixes 1 through 4 above, plus unit tests
on the pure report functions. This removes the possibility of a wrong number reaching a client
without anyone knowing. Highest value work available to you right now.

**Phase 2, about three days. Write the specs down.** Extend `client-config.json` into a real
per-client contract: platforms, loudness target, artwork spec, required show-note fields,
turnaround SLA, deliverable tier. Nothing downstream can be automated until this exists, and
writing it will surface disagreements about what you actually promise.

**Phase 3, about a week. Post-publish verification.** A scheduled job that takes each published
episode and asserts the Tier 1 list against the client's spec: live on every platform, artwork
correct, notes and links present, QR codes resolving, numbering sequential. Failures go to Slack
naming the client and the specific check. This is the one that replaces most of your manual
checking.

**Phase 4, about a week. Pre-publish audio and content gate.** Loudness, true peak, dead air and
clipping via ffmpeg's `ebur128` filter, which is free and deterministic. Show notes checked
against the client spec. Runs before anything reaches a platform.

**Phase 5, ongoing. Anomaly detection.** Tier 2 statistical flags on the data you are already
collecting monthly, moved to weekly.

## 7. What stays human, permanently

Be honest about this or the system will overreach and lose credibility.

- Whether the episode is actually good.
- Whether a guest is right for the client.
- The relationship judgment about when to tell a client something is wrong.
- Final sign-off on anything client-facing that an AI touched.

The aim is that these are the *only* things you look at. That is what "fully automated QA"
should mean in practice: not zero humans, but zero humans doing detection.

## 8. Knowing whether it worked

Four numbers. Review monthly.

- **Escaped defect rate.** Defects found by a client rather than by a gate. Target zero. This is
  the only number that really matters.
- **Detection latency.** Time between a defect being introduced and being flagged. Today for
  reports it is up to 30 days. Target under an hour.
- **Manual QA minutes per deliverable.** Should fall every month. If it does not, the gates are
  not covering what you actually check by hand.
- **Gate override rate.** How often someone waives or ignores a failure. Above about 5 percent
  means the gate is wrong, not the people. Fix the gate or delete the check.

That last one is why `scripts/qa-waivers.json` requires an owner, a reason and an expiry date,
and why an expired waiver fails the build. A gate nobody can waive gets ignored. A gate anyone
can waive forever is decoration.
