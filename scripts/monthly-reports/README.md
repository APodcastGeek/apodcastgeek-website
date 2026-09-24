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
   message, and the top-episode card falls back to the all-time top episode
   by lifetime downloads (`mi.topEpisodeAllTimeTitle`) when nothing published
   this month, instead of a placeholder.
3. Episode classification and the "a lifetime figure cannot fall" guard are
   **done, not a patch here.** Pushed straight to `claude-workspace` (it's a
   real git repo with push access, unlike the n8n workflow) — see below.

After the n8n patches: re-run the lifetime Geography export for Bobby
(`node export-data.js --channel bobby-owsinski --breakdown Geography`), upload
the resulting `youtube-geography` row for `2026-08`, and retrigger the six
reports so the published copies are regenerated rather than hand-patched.

## What counts as a podcast episode on YouTube — resolved

Dave's call: playlist membership, not a duration cutoff. Confirmed after a
real misunderstanding worth recording, because it's an easy one to make again:
YouTube's own "views from playlist" analytics only counts plays that happened
while someone was browsing through the playlist itself, a small fraction of a
video's real audience, and Dave was right to rule that out. What actually
shipped never reads a play count from the playlist at all — it uses the
playlist purely as a membership list (which video IDs are episodes), then
sums each of those videos' own full view and watch-time totals from the same
Studio export as before.

Built, tested, and pushed to `claude-workspace` (`APG WEBSITE/clip-repost-engine`),
commits `e87034c` and `a30cb29`, full writeup in
`ops-decision-system/youtube-episode-by-playlist-20260902.md`:

- `src/youtube-playlist.js` (new) — resolves a channel's Podcasts playlist
  (`status.podcastStatus == "enabled"`, a public read, API key only, no
  OAuth) and every video id in it.
- `report-figures.js` and `bot-csvs.js` classify every video by membership in
  that set instead of a 15-minute cutoff, so the figures blob and the summary
  tables the report reads beside it can never disagree on what counts as an
  episode.
- The lifetime figures are now archived and refuse to report a fall below
  what was already published for that client, the same rule `hovercode.js`
  and `buzzsprout.js` already had. This is the actual root-cause fix for the
  regression that started this review: Socially Awkward's 376 -> 339, The
  Surveying Shift's 1,417 -> 1,173, and Bobby Owsinski's 354,494 -> 195,656
  would each have been refused rather than shipped.
- 65 passing in `test/run.js`, including against a mocked YouTube API.

**Still needed before it runs for real:** `YOUTUBE_API_KEY` on the Mac Mini
(enable "YouTube Data API v3" on the existing Google Cloud project, create a
plain API key — no OAuth consent screen, no Google review, unlike the
Analytics scopes in `youtube-api-verification/`). Once that's in place every
report from the next unpublished month builds correctly with no further
action.

**August 2026 itself is not fixed and will not fix itself.** `build-report-row.js`
still refuses to rebuild a month already marked published by default — the
exact protection this whole review exists to argue for. Dave asked for a way
to override that on purpose, which now exists: `--revise` (gated behind a
second explicit flag), backs up the existing rows before touching anything,
deletes each by its own id, and writes fresh ones through the same verified
path as a normal report. Commit `2bbbeee` in claude-workspace; full writeup
in `ops-decision-system/youtube-episode-by-playlist-20260902.md`.

That code has real test coverage against a mocked table, but has never run
against the live n8n API — this environment has no `N8N_CLOUD_API_KEY` and
`docs.n8n.io` is blocked by its own egress policy, so the delete request
shape came from n8n's public docs and community examples, not a call I could
verify here. Nothing in this session can run it for real either way: it
executes on the Mac Mini, which this environment has no access to. The first
real `--revise` should be watched, not fired and trusted blind.
