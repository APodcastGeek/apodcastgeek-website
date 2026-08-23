# Media QA Automation Plan

Post-production QA automation for APG's five deliverable types. Written August 2026 for Dave, to fund or kill, then hand to an engineer. Grounded in a read of the existing pipeline code (`apg-shorts`, `podline`) and the earlier strategy doc (`docs/qa-automation-strategy.md`). Extends that doc's three-tier model to the specific media deliverables Amy checks by hand.

Scale context: ~50 deliverables/month across 12 active clients, 600+ episodes produced to date. Every deliverable currently gets human QA from Amy.

## 0. Summary verdict

Roughly 55 to 65 percent of the checking *volume* Amy does today is Tier 1 deterministic and can be fully automated. Another 10 to 15 percent is Tier 2 statistical flagging. The remainder is judgment and stays with her permanently. The time saving is larger than the volume share suggests, because the automatable checks are the tedious full-scan ones (listening for dead air across a 55-minute episode, checking every clip's tail for a cut word) while the human checks are fast taste calls. The realistic outcome is Amy's per-deliverable time dropping from full review to exception review, with better defect coverage than today, because a machine scans 100 percent of every file and Amy cannot.

Two things block starting: the Frame.io connection is stale and must be reconnected by Dave, and the QA review checklist (the Vercel web app) has not been supplied. The architecture below is deliberately checklist-driven so that neither blocks the design, only the calibration.

## 1. The tier model, applied to media

From the earlier strategy doc, unchanged, because it is correct:

- **Tier 1 deterministic.** Binary, machine decides, blocks release. Loudness, true peak, resolution, aspect, duration, framerate, colour range, channel config, naming, presence of required elements, safe-area on generated cards, dead air, clipping, head/tail silence.
- **Tier 2 statistical.** Anomaly, machine flags, human decides. Never blocks. Blocking on anomalies trains people to override the gate, which destroys it.
- **Tier 3 judgment.** Human decides. AI may pre-screen and rank only. Hard rule: AI can rank and flag; AI cannot approve and cannot reject. Anything AI-graded that reaches a client carries a named human sign-off.

One distinction from the existing code must be preserved, because it is the intellectual core of this plan. The header of `apg-shorts/scripts/qa-clip.js` separates **code bugs** from **generative risks**:

- A code bug (the title-card safe-zone overflow, the caption-order bug) is fixed structurally in the renderer and then no longer needs per-item visual review. A fast glance suffices. Automating QA for code bugs is mostly wasted effort; fixing the code is the QA.
- A generative risk (malformed b-roll, a double-neck guitar, a mangled hand) cannot be fixed structurally because the generator can always produce a new failure mode. It needs eyes on frames, per item, forever. The current policy (2026-07-23) is 3 to 5 frames spread across the b-roll window on every clip. That is exactly the class of check where a vision model pre-screens and ranks, and a human decides.

Practical consequence: whenever a checklist item exists because of a historical code bug in APG's own renderers, the right move is to verify the structural fix once, demote the item to a Tier 2 spot-check, and not build per-item automation for it. Whenever an item exists because of generative or human-editor variability, it needs a per-item check, and the tier depends on whether the failure is objectively measurable.

## 2. Feasibility verdict per deliverable type

Percentages are of Amy's *checking effort per item*, estimated from the checks visible in the existing pipeline and standard podcast deliverable specs. They will be recalibrated against the actual Vercel checklist (section 4) and against shadow-mode data (section 7). Treat them as honest estimates, not commitments.

### 2.1 Main podcast audio. Tier 1 ~70%, Tier 2 ~15%, Tier 3 ~15%. Best automation target.

Audio is the most measurable medium and APG already masters to a known spec: the Podline chain is DeepFilterNet, pyloudnorm to -16 LUFS, ffmpeg high-pass at 80 Hz, true-peak limiter at -1 dBTP (`podline/src/audio-local.js`), or Auphonic doing the equivalent. Verifying conformance to that spec is pure Tier 1: integrated loudness, true peak, LRA, channel config, sample rate, codec, duration, head/tail silence padding, dead air, clipping, digital silence dropouts. All of it is one ffmpeg pass per file.

Tier 2: hum/buzz detection, noise-floor drift between segments (a sign one speaker's track missed noise reduction), loudness balance between speakers, episode duration versus the show's own historical distribution, and unedited-retake detection (near-duplicate consecutive sentences in the transcript are a strong flag for a retake the editor forgot to cut).

Tier 3, permanent: does the edit flow, were the right filler words removed, is a content error present (wrong claim left in after the guest corrected themselves), music bed taste. A transcript pre-screen can rank suspicious regions, a human decides.

### 2.2 Clips (short-form vertical). Tier 1 ~50%, Tier 2 ~15%, Tier 3 ~35%.

The best-understood type, because `qa-clip.js` already does the Tier 1 core: duration in the 25 to 42 second window, resolution, and the tail-decay check for the clipped-final-word bug (50 ms RMS windows over the last second; an abrupt drop below -90 dB immediately after windows above -60 dB is the signature). Add loudness, true peak, aspect ratio 9:16 exact, framerate, caption presence, first/last-frame black detection, and brand-kit conformance (logo present at the configured position and size, correct accent colour, correct fonts on generated cards; `brand/brandkits.json` already encodes all of this per client, including logo position, title-card position and enabled overlays, so the expected values exist as data today).

Tier 3 is irreducibly large here because a clip is an editorial product: is the hook good, does the excerpt stand alone, is the b-roll appropriate and well-formed. The b-roll generative-risk review (3 to 5 frames per clip) stays human-decided with vision-model pre-screening, exactly as the current policy states. `podline/src/qa.js` already implements the pattern: extract frames, send to claude-haiku with a fixed rubric, get pass/flag/fail JSON. Its verdicts feed ranking only.

### 2.3 Main podcast video. Tier 1 ~60%, Tier 2 ~20%, Tier 3 ~20%.

High machine coverage, and this is the type where automation beats Amy on coverage rather than just speed: nobody watches 55 minutes end to end for every episode, but a machine scans every frame. Tier 1: resolution, framerate, codec, colour range, duration matching the delivered audio master within tolerance, audio stream conformance (same checks as 2.1 on the embedded audio), black-frame detection, frozen-frame detection, A/V sync offset between the video's audio track and the delivered audio master (cross-correlation; a fixed offset over threshold is a hard fail), head/tail structure (intro/outro present where the show spec requires them).

Tier 2: A/V sync *drift* over the episode (gradual desync is measurable but the threshold needs calibration), scene-cut density anomalies (a 10-minute stretch with zero cuts on a multicam show suggests the editor missed a camera-switching pass), speaker-versus-shot mismatch (diarized transcript says guest is talking, frame shows host camera; measurable via face position sampling but noisy, so it flags).

Tier 3: edit quality, pacing, whether the cutaways land, lower-third taste.

### 2.4 Guest intros. Tier 1 ~50%, Tier 2 ~10%, Tier 3 ~40%.

These are short generated promo assets built around guest identity, which makes the highest-cost defect class fully deterministic *if and only if a source of truth exists*: the guest's name spelling, title and company, checked via OCR (or text-layer inspection for generated assets) against the booking metadata. A misspelled guest name is the single most embarrassing escaped defect in this deliverable type and it is 100 percent automatable. Add the standard media conformance checks (duration, loudness, resolution, brand kit) from 2.2.

Tier 3: does the chosen quote or moment represent the guest well, is the headshot crop flattering, tone. Vision pre-screen ranks, human decides.

Open dependency: where guest metadata canonically lives (booking system, episode JSON, Notion). Without a machine-readable source of truth, the name check degrades from Tier 1 to Amy eyeballing it, so establishing that source of truth is part of Phase 1.

### 2.5 Thumbnails. Tier 1 ~40%, Tier 2 ~10%, Tier 3 ~50%. Weakest automation target, do last.

Tier 1: dimensions (1280x720 for YouTube), file size under platform limit (2 MB YouTube), format, colour profile, burned-in text spelling versus episode metadata via OCR, text inside safe area via OCR bounding boxes, brand asset conformance via perceptual hash (the delivered thumbnail should contain a region hash-matching the client's current logo file from `brand/assets/`, which also catches stale logo versions).

Tier 2: text legibility scoring (contrast ratio between text and its local background), similarity to the show's recent thumbnails (a pHash distance far outside the show's norm flags either a refresh or a mistake).

Tier 3, half the job: composition, facial expression, whether it will get clicked. That is taste and stays human. A vision model can rank a batch and flag obvious defects (cut-off face, text collision), nothing more.

## 3. Technique mapping

What is genuinely solved by deterministic tooling versus what needs a model. Every named filter below is a standard ffmpeg/ffprobe capability, no exotic dependencies.

| Check class | Technique | Tier | Solved or model-dependent |
|---|---|---|---|
| Container/stream conformance (resolution, fps, codec, pixel format, colour range, channel layout, sample rate, duration) | `ffprobe -show_streams -show_format`, exactly as `qa-clip.js` does today | 1 | Solved |
| Loudness, true peak, LRA | `ffmpeg -af ebur128=peak=true`, parse integrated LUFS, LRA, true peak; compare to spec (-16 LUFS, -1 dBTP per the Podline mastering chain) | 1 | Solved |
| Dead air, head/tail silence | `silencedetect=n=-50dB:d=3` (thresholds per spec file) | 1 | Solved |
| Clipping, DC offset | `astats` per-frame metadata: flat-top counts, peak counts at 0 dBFS | 1 | Solved |
| Black frames, freeze frames | `blackdetect=d=0.5:pix_th=0.02`, `freezedetect=n=-60dB:d=2` | 1 | Solved |
| Broadcast-illegal video levels | `signalstats` min/max analysis | 1 | Solved |
| Clipped-final-word / abrupt tail | The existing `qa-clip.js` windowed-RMS tail-decay detector, promoted from script to library function | 1 | Solved, in production today |
| Transcript-to-audio alignment (clipped words anywhere, unedited retakes, region ranking) | MMS_FA CTC forced alignment, already built in `apg-shorts/scripts/align_transcript.py` (word-level timings with confidence scores, SCORE_MIN 0.20). Low alignment confidence at a cut boundary flags a damaged word; near-duplicate consecutive segments flag retakes | 1 for boundary damage, 2 for retakes | Solved for detection; retake confirmation needs a human |
| A/V sync | Cross-correlate the video's audio track against the delivered audio master; report fixed offset (Tier 1 fail over ~80 ms) and drift (Tier 2) | 1/2 | Solved for offset; drift threshold needs calibration |
| Burned-in text spelling (guest names, titles, captions) | OCR (tesseract for clean generated text; a vision model for stylised text) against episode metadata, fuzzy match with a strict threshold. High-confidence exact mismatch is Tier 1; low OCR confidence demotes that instance to Tier 2 flag rather than false-failing | 1, degrading to 2 | Solved when a metadata source of truth exists |
| Text safe-area / overflow | OCR bounding boxes versus safe margins from the spec file. Note: for APG's own renderer this was a code bug, now fixed structurally; per-item checking applies mainly to externally produced assets | 1 | Solved |
| Logo/brand asset presence and version | Perceptual hash (pHash/blockhash) of the region at the configured logo position (`brandkits.json` gives position and size per client) against the canonical asset file; colour sampling for accent-colour conformance | 1 | Solved |
| Thumbnail similarity to show norm | pHash distance against the show's recent thumbnail set | 2 | Solved as a flag |
| Generative/visual risk (malformed b-roll, artefacts, framing) | Vision-model frame sampling, the `podline/src/qa.js` pattern: extract N frames, fixed rubric, pass/flag/fail JSON, cheap model (claude-haiku class). For b-roll: 3 to 5 frames across the b-roll window per the 2026-07-23 policy | 3 (pre-screen only) | Model-dependent, and by design never authoritative |
| Composition, hook quality, edit taste, quote selection | Human. Vision/LLM may rank a batch to order Amy's queue | 3 | Not solvable, correctly so |

Rule of thumb that falls out of the table: anything with a number in the spec is solved by ffmpeg and comparison. Anything requiring reading text is solved by OCR plus a source of truth. Anything requiring an opinion needs a model, and the model is only ever allowed to sort Amy's queue.

## 4. Checklist-as-data design

The Vercel QA review checklist app enumerates every item Amy checks. We do not yet have its URL or contents, and Dave has said every item on it must be covered. Therefore the system takes the checklist as a data input. Nothing in the engine hardcodes a check list; the engine executes a spec.

### 4.1 How checklist items map into the system

Every item from the Vercel checklist gets classified, once, into exactly one of four dispositions:

1. **`auto`**: Tier 1, an executable check with an engine and parameters. Machine decides.
2. **`flag`**: Tier 2, an executable check that can only flag. Machine measures, human decides.
3. **`prescreen`**: Tier 3 with AI assist. A vision/LLM rubric ranks and flags, human decides.
4. **`manual`**: Tier 3, no automation. Stays on Amy's residual checklist.

The mapping is stored in the spec file itself, keyed by the checklist item's ID, so coverage is auditable: the system can print, per deliverable type, what percentage of the official checklist is in each disposition, and no item can silently disappear. Items in `manual` are not failures of the project; they are the honest boundary of it.

This classification cannot be finalised until we have the checklist. Section 2's tier percentages, the concrete check parameters, and the size of Amy's residual list all depend on it. The engine, the spec schema, and every check in section 3 do not.

### 4.2 Worked spec schema

One `defaults.yaml` plus per-client overlay files, mirroring how `brandkits.json` already does per-client variation (a `__default` kit plus per-slug overrides). Per-show variation nests under the client the same way `config/shows.json` keys by show.

```yaml
# qa-spec/defaults.yaml
version: 1
checks:
  - id: audio.loudness
    checklist_item: VC-012            # ID from the Vercel checklist app
    applies_to: [episode-audio, episode-video, clip, guest-intro]
    tier: 1
    disposition: auto
    engine: ffmpeg.ebur128
    params: { target_lufs: -16, tolerance_lu: 1.0, max_true_peak_dbtp: -1.0 }
    blocking: true

  - id: clip.duration
    checklist_item: VC-031
    applies_to: [clip]
    tier: 1
    disposition: auto
    engine: ffprobe.format
    params: { min_sec: 25, max_sec: 42 }   # matches qa-clip.js today
    blocking: true

  - id: clip.tail_decay
    checklist_item: VC-034
    applies_to: [clip, guest-intro]
    tier: 1
    disposition: auto
    engine: apg.tail_decay            # the qa-clip.js detector, as a library
    params: { window_ms: 50, silence_db: -90, active_db: -60 }
    blocking: true

  - id: text.guest_name
    checklist_item: VC-047
    applies_to: [guest-intro, thumbnail, clip]
    tier: 1
    disposition: auto
    engine: ocr.match
    params: { source: episode.guest_name, fuzzy_max_edits: 0, min_ocr_conf: 0.85 }
    blocking: true
    on_low_confidence: flag           # OCR unsure -> Tier 2 flag, never a false block

  - id: audio.retake_suspect
    checklist_item: VC-019
    applies_to: [episode-audio, episode-video]
    tier: 2
    disposition: flag
    engine: transcript.near_duplicate
    params: { similarity_min: 0.85, window_segments: 3 }
    blocking: false

  - id: visual.broll_generative
    checklist_item: VC-052
    applies_to: [clip]
    tier: 3
    disposition: prescreen
    engine: vision.frame_sample       # the podline qa.js pattern
    params: { frames: 5, region: broll_window, rubric: broll-malformed.md }
    blocking: false
    output: rank_and_flag             # can never approve or reject

  - id: editorial.hook_quality
    checklist_item: VC-055
    applies_to: [clip]
    tier: 3
    disposition: manual               # stays on Amy's residual list
```

```yaml
# qa-spec/clients/bobby-owsinski.yaml
extends: defaults
shows:
  inner-circle:
    overrides:
      clip.duration: { min_sec: 30, max_sec: 60 }   # example per-show variance
      video.resolution: { episode-video: "3840x2160" }
    disable: [visual.broll_generative]              # show uses no b-roll
```

Resolution order: defaults, then client overlay, then show overlay. Every executed check records which layer supplied its parameters, so a wrong threshold is traceable to a file and a line. The spec lives in git; changing a client's QA contract is a reviewed commit, not a config click.

## 5. Architecture

Frame.io V4 is the asset hub, reached today through the Zapier MCP connector (`App216464CLIAPI`). The documented surface covers everything needed: `files.*` and `folders.index` for assets and traversal, `metadata.*` and `metadataFields.*` for writing verdicts onto assets, `comments.create` with frame timestamps, `versionStacks.*` for resubmissions, `webhooks.create` for upload triggers, `shares.*` for client links. The connection is currently stale and returns an auth error; nothing below can be verified live until Dave reconnects it.

Flow, per deliverable:

1. **Trigger.** `webhooks.create` registers an upload/file-ready webhook. On upload of a new file or a new version into a watched project folder, Frame.io calls the QA worker. This is what makes QA automatic rather than polled.
2. **Resolve.** The worker fetches asset and folder metadata (`files.show`, `folders.index`), derives client, show and deliverable type from folder path plus custom metadata fields, and loads the resolved spec (section 4.2).
3. **Fetch.** Download the media file to the worker. The natural runner is the existing Mac Mini, which already runs mastering, rendering, frame extraction and alignment for these exact files and has ffmpeg, the MMS_FA venv, and the vision-QA plumbing installed. A small always-on VPS is the fallback if the Mac Mini's availability is a concern; decide in Phase 0.
4. **Run.** Execute every applicable check from the spec. Media checks are one or two ffmpeg passes; OCR and pHash run on extracted frames; Tier 3 pre-screens call the vision model with the spec's rubric. Total cost per deliverable is minutes of compute.
5. **Write back.**
   - `metadata.bulkUpdate`: custom fields on the asset, e.g. `QA Status` (pass / flag / fail / pending-human), `QA Tier1 Score`, `QA Run ID`, `QA Spec Version`.
   - `comments.create`: one summary comment with the findings, plus individual frame-timestamped comments for time-anchored findings (dead air at 14:32, black frame at 41:07, suspect b-roll frame at 0:18), so Amy clicks straight to the evidence instead of scrubbing.
6. **Route.** Tier 1 fail: the asset is marked failed, the editor is notified with the specific finding, and it never reaches Amy's queue until resubmitted. Tier 1 pass with Tier 2/3 flags: it lands in Amy's exception queue, ordered by the pre-screen ranking. Clean pass: it lands in Amy's queue marked clean, and in early phases she still reviews it (section 7).
7. **Versions.** On resubmission, `versionStacks.*` links the new version; the worker re-runs the full suite (never a partial re-run, regressions happen) and the comment thread shows the delta: which findings cleared, which persist, which are new.
8. **Release.** Client `shares.*` links are created only from assets whose `QA Status` is pass and, for anything AI-pre-screened, which carry a named human sign-off recorded in metadata. That is the three-tier hard rule made mechanical.

**Editor submission checklist integration.** Editors already fill a submission checklist per delivery. Each checklist question maps to check IDs in the spec. On every run the worker cross-checks the editor's self-report against machine findings. "Loudness verified" ticked while ebur128 reads -13.2 LUFS is two findings: the loudness defect, and the false attestation. The mismatch rate is tracked per editor as a Tier 2 signal. It is a coaching and trust instrument for Dave, not an automated sanction; a rising rate means the checklist has become a ritual for that editor, which is exactly the failure mode the checklist was meant to prevent.

**Zapier caveat, stated plainly.** The Zapier MCP connector is fine for prototyping and for orchestration glue, but a webhook-triggered worker processing 50 media files a month should hold a direct Frame.io V4 API credential (Adobe IMS OAuth) for the hot path: fewer moving parts, no third-party rate limits between an upload and its verdict. Plan on Zapier for Phase 2 wiring, direct API by Phase 4. This needs no design change; the surface is identical.

**Escalation, inherited from the strategy doc.** A check that fails silently is worse than no check. Every worker error (download failed, ffmpeg crashed, webhook missed) produces a visible `QA Status: error` on the asset and a notification. The Podline QA module's soft-fail design (errors become flags, never silent passes) is the right instinct and is kept, with one correction: in Podline a QA error lets the pipeline proceed; here an error must park the asset as unverified, not pass it.

## 6. What stays with Amy, permanently

Honestly, and by design:

- **All Tier 3 decisions.** Hook quality, edit flow, b-roll appropriateness, thumbnail composition, quote selection, whether the deliverable feels right for the client. The AI orders her queue; it never empties it.
- **Every Tier 2 flag.** Anomalies need context the machine does not have (yes, this episode is meant to be 20 minutes, it is a special).
- **Named sign-off on anything AI-pre-screened that reaches a client.** Non-negotiable per the tier rules.
- **The taste standard itself.** Amy owns the spec files' judgment-adjacent thresholds and the pre-screen rubrics. When the vision rubric misranks, she is the one who edits it. The system makes her taste enforceable at scale; it does not replace it.
- **Spot-check audits of clean passes.** A small random sample (say 1 in 10) of machine-passed deliverables gets a full human review forever. This is the only defence against a drifted threshold quietly passing defects, and it is also the ongoing measurement of escaped-defect rate.

Her job changes from scanning everything to reviewing exceptions, making taste calls, auditing the machine, and improving the spec. That is a better job, and it is the job that scales past 12 clients.

## 7. Staged rollout

Ordered by payoff per unit of effort. Effort assumes one engineer familiar with the existing codebase, part-time.

**Phase 0: prerequisites. A few days, mostly Dave.**
Reconnect Frame.io (stale auth). Obtain the Vercel checklist URL and export its items. Confirm the runner (Mac Mini versus VPS). Identify the canonical source of guest/episode metadata. Baseline Amy's current minutes per deliverable type for one or two weeks; without this baseline the project cannot prove its value.

**Phase 1: the check library, run by hand. 1 to 2 weeks.**
Promote `qa-clip.js` from a single-purpose script into a library of engines (ffprobe conformance, ebur128, silencedetect, astats, blackdetect/freezedetect, tail-decay, OCR match, pHash, forced-alignment checks reusing `align_transcript.py`). Build the spec loader and the defaults/overlay resolution. Classify the Vercel checklist items into the four dispositions with Amy at the table. Deliverable: a CLI that takes a file plus client/show/type and prints a full report. Highest payoff of the whole project, because Amy can start using the CLI output on episode audio and clips immediately, before any Frame.io wiring exists.

**Phase 2: Frame.io wiring. 1 to 2 weeks.**
Webhook registration, asset fetch, metadata fields (define them once via `metadataFields.*`), comment write-back with frame timestamps, version-stack handling, editor-checklist cross-check. Nothing gates yet.

**Phase 3: shadow mode. 6 to 8 weeks minimum. Cannot be skipped or shortened.**
The system runs on every upload and writes its findings, but blocks nothing and Amy's process is unchanged. Every disagreement is logged in both directions: machine flagged, Amy passed (false positive, tune the threshold) and Amy caught, machine missed (coverage gap, add or fix a check). At 50 deliverables/month this window yields 75 to 100 comparisons, the minimum for trustworthy calibration. Exit criteria per check, not per system: a Tier 1 check graduates to blocking only after zero false blocks across its trailing 50 evaluations and agreement with Amy above 95 percent. This phase is where the tier percentages in section 2 become measured facts instead of estimates.

**Phase 4: Tier 1 gating, check by check. 1 week of switching, ongoing calibration.**
Graduated checks start blocking: a failing asset bounces to the editor with the specific finding before Amy ever sees it. Editor-checklist mismatch tracking goes live. Move the hot path off Zapier onto a direct Frame.io credential.

**Phase 5: Tier 2 baselines and Tier 3 pre-screening. 2 to 3 weeks, then ongoing.**
Statistical baselines need history: per-show duration distributions, thumbnail pHash norms, loudness-balance norms, built from the 600-episode back catalogue where files are retrievable. Vision pre-screen ranking of Amy's queue goes live (b-roll frames, thumbnail defects, guest-intro framing). Thumbnails come last, as the weakest automation target.

Rough total: 6 to 8 engineer-weeks of build spread over roughly 4 months of calendar time, most of which is shadow-mode calendar, not effort.

## 8. Metrics

Defined before Phase 3 starts, or shadow mode proves nothing.

- **Escaped defect rate.** Client-visible defects per 100 deliverables, from client reports plus Amy's spot-check audits of clean passes. The metric the whole project exists to reduce. Requires logging today's baseline, informally if necessary, starting now.
- **Agreement rate with Amy (shadow mode).** Per check: machine verdict versus Amy's verdict. Above 95 percent with zero false blocks graduates a Tier 1 check to gating. Persistent disagreement means the check or the spec is wrong, and the number says which conversation to have.
- **Detection latency.** Upload to verdict-on-asset. Target under 15 minutes for clips and thumbnails, under 60 for a full episode video. The comparison baseline is today's latency, which is however long until Amy next has a review slot.
- **Amy's minutes per deliverable.** Measured against the Phase 0 baseline. This is the funding metric.
- **Override rate.** How often a human ships past a Tier 1 fail. Target under 5 percent. A rising rate means thresholds are wrong or trust is broken; either way the gate is dying and the number is the early warning. (Tier 2 flags are not overrides; dismissing them is the design.)
- **Editor checklist mismatch rate.** Per editor, attestations contradicted by machine findings. Trend matters more than level.
- **False-positive rate on Tier 1.** Post-gating, any false block is a severity-one bug in the QA system itself: it burns editor trust, which is the scarcest resource the system has.

## 9. Prerequisites and open questions

Blocking prerequisites:

1. **Frame.io reconnection.** The connection is stale and returns an auth error. Dave must reconnect before Phase 2 can be verified. All Frame.io behaviour in this plan is planned against the documented V4 surface, not against live calls.
2. **The Vercel QA checklist.** Not yet supplied (no URL, no contents). Until it arrives: the disposition mapping (4.1), the concrete check parameters, the final tier percentages in section 2, and the size of Amy's residual list cannot be finalised. The engine, schema and architecture do not depend on it.
3. **Metadata source of truth.** Guest name spelling, episode titles, per-show delivery specs. The OCR checks are only Tier 1 if this exists in machine-readable form. `shows.json`, `clients.json` and `brandkits.json` cover brand and format; guest/episode data needs a confirmed home.
4. **Runner decision.** Mac Mini (already provisioned for exactly this work) versus an always-on VPS. Depends on the Mini's uptime and headroom, which Dave knows and this plan does not.

Open questions:

5. Are Frame.io uploads the true delivery moment for all five types, thumbnails included, or do some deliverables bypass Frame.io? The webhook trigger only covers what flows through Frame.io.
6. Does Amy check things that are not on the Vercel checklist? Tacit checks must be surfaced during the Phase 1 classification session or they become silent coverage gaps.
7. Per-client loudness variance: is -16 LUFS universal across all 12 clients, or do any specify platform-specific targets? The spec supports it either way; the values need confirming.
8. Zapier connector rate limits and webhook delivery guarantees for the interim Phase 2 wiring, verifiable only after the reconnection.
9. Back-catalogue access for Phase 5 baselines: how much of the 600-episode history is retrievable in original quality?
10. Whether the editor submission checklist is structured data today or free text. If free text, a small structuring pass is needed before the cross-check can run.
