# Monthly report fixes — August 2026 review

Krisha's notes on the first automated run (1 September 2026, reporting on
August) were checked against the published HTML in `reports/`, the n8n code
nodes, and the export engine in `claude-workspace/APG WEBSITE/clip-repost-engine`.
This folder holds the fixes that cannot be applied from this repo. `scripts/**`
is excluded from Firebase hosting, so nothing here is served.

## What was found

| Report | Note | Verdict | Cause |
|---|---|---|---|
| Bobby Owsinski | Top Geographies (YouTube, all-time) blank | Correct | No `youtube-geography` row existed for `bobby-owsinski__2026-08`. The lifetime Geography export for his channel did not come back on the 1st (the export job treats geography as prose-only and marks the month done without it). The template then drew a heading over two empty columns. |
| The Surveying Shift | "Per-episode audio breakdown / Episode-level detail will populate…" | Correct diagnosis, wrong expectation for this month | Zero episodes published in August. The engine builds the audio episode table only from episodes published in the month (Buzzsprout's API only gives lifetime plays per episode), so there was nothing to rank. The fallback copy was misleading; the fix is honest copy now and a per-episode baseline from September onwards if wanted. |
| Socially Awkward | All-time YouTube views 376 → 339 and watch time 22.3h → 20.7h | Correct, and it is wider than one client | The new engine counts a video as an episode only if it is 15 minutes or longer. Socially Awkward has episodes of 12–13 minutes. The 16 videos over 15 minutes sum to exactly 338 views / 20.7 h in the 29 Aug export. July's figure came from YouTube Studio's Podcast tab (playlist membership), which is what Krisha checked (449 views / 31.0 h). Surveying Shift (1,417 → 1,173) and Bobby Owsinski (354,494 → 195,656) fell for the same reason. |
| Socially Awkward | "AT", "CH" instead of country names | Correct | The Aggregate Analytics node maps ISO codes to names with a 20-entry table. |
| High Stakes | "AE", "PT", "IL", "PL" | Correct | Same table. "ES" is in it, so Spain rendered. |

Found while checking, not in the notes:

- Every August report prints Buzzsprout cities with a dangling comma
  ("Ashburn, Virginia, "). The top-up bot now writes the city as one cell and
  the node appends ", " + an empty State.
- The hover sparklines on the all-time cards (`var D = {...}` in every report)
  are the same hard-coded placeholder series in all six reports, not client data.
  They are only visible on hover. Worth removing from the template.

## What was changed in this repo

`reports/*__2026-08.html` (the copies clients open):

- Socially Awkward: Austria, Switzerland.
- High Stakes: United Arab Emirates, Portugal, Israel, Poland.
- Bobby Owsinski: the empty geography block now says the data was unavailable.
- The Surveying Shift: the top-episode card says no episode was released and
  that the 26 downloads came from the back catalogue.
- All six: city labels without the trailing comma.

The all-time YouTube figures were NOT hand-edited. They depend on which
definition of "episode" the pipeline should use (see Open decision), and a
number typed in by hand would be overwritten on the next regeneration anyway.

## Patches to apply elsewhere

1. `n8n-aggregate-analytics-country-names.patch.js` — Aggregate Analytics node.
   Full ISO country table + `Intl.DisplayNames` fallback, and the city label fix.
2. `n8n-build-apg-report.patch.js` — Build APG Report node. Empty-geography
   message, honest top-episode fallback, and a data check that names an
   all-time figure that is lower than this month's total or last month's
   published figure.
3. `clip-repost-engine.patch` — Mac Mini engine. `report-figures.js` writes
   `ytLifetimeEpisodeViews` / `ytLifetimeEpisodeWatchHours` into the figures
   blob and refuses to write a month whose lifetime figure is below the one
   published the month before (the same rule `hovercode.js` and
   `buzzsprout.js` already apply). `build-report-row.js` makes the two fields
   required. Apply from `APG WEBSITE/` with `patch -p1 < clip-repost-engine.patch`,
   then run `node test/run.js`.

After the n8n patches: re-run the lifetime Geography export for Bobby
(`node export-data.js --channel bobby-owsinski --breakdown Geography`), upload
the resulting `youtube-geography` row for `2026-08`, and retrigger the six
reports so the published copies are regenerated rather than hand-patched.

## Open decision: what counts as a podcast episode on YouTube

Lifetime episode views under each rule, from the 29 Aug exports:

| Client | Studio Total row | ≥ 15 min (current) | ≥ 3 min | July report (Podcast tab) |
|---|---|---|---|---|
| Socially Awkward | 5,976 | 338 | 411 | 376 (449 on 2 Sep per Krisha) |
| The Surveying Shift | 11,415 | 1,172 | 1,247 | 1,417 |
| Bobby Owsinski | 2,599,170 | 175,961 | 2,144,532 | 354,494 |
| High Stakes | 3,256,943 | 3,220,695 | 3,223,001 | 3,143,848 |
| Trial Lawyer View | 29,323 | 10,445 | 10,510 | 9,638 |
| Support Your Local Tattooer | 123,045 | 7,595 | 7,595 | 6,779 |

No duration rule reproduces the Podcast tab: Bobby's channel carries years of
long non-podcast videos, so 3 minutes overshoots by six times and 15 minutes
undershoots by half. The only definition that matches what a client sees in
YouTube Studio is playlist membership (the videos assigned to the show's
podcast). Two ways to get it:

- Pull the lifetime `Podcast` breakdown as an eighth export pass and take its
  Total row for the all-time headline (one extra pass, matches July and
  Krisha's check exactly, but per-video figures such as the top episode still
  have to use a duration rule).
- Read the podcast playlist's video IDs through the YouTube Data API (needs an
  API key and each show's playlist id in `config.json`) and classify every
  video by membership. Consistent everywhere, one-off setup.

The monthly "YouTube Episode Views" row and the top episode use the same
15-minute rule, so whichever definition is chosen should apply to both.
