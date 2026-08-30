# APG Clip Generator — Spec

Turn an episode's transcript timings into the 5 short-form clips, as data first
and pixels second.

Status: spec, not built. Written 2026-08-30.

---

## 1. What this is

Today the 5 short-form clips per episode are found by hand: someone watches or
scrubs the episode, picks moments, cuts them, reframes to vertical, captions
them, and renders. The finding and the cutting are both manual, and both are
repeated identically for every episode of every show.

This tool automates the *finding* and the *repeatable* part of the cutting. It
does not try to automate taste. It produces a **clip plan** — a plain JSON file
describing which moments, cut where, framed how, captioned with which words —
and then renders that plan through pluggable emitters.

The plan is the product. The MP4 is one emitter's opinion of the plan.

### Why a plan and not just MP4s

Three reasons:

1. **Review before render.** A wrong moment costs seconds to fix in a JSON file
   and minutes to fix in a render queue. The plan is reviewable by a human in
   about two minutes per episode.
2. **The renderer is replaceable.** FFmpeg today, an NLE handoff tomorrow,
   something else in two years. The selection logic — the part that's actually
   APG's — outlives all of them.
3. **The plan is a record.** Which moments got picked, why, and what shipped.
   That's the raw material for ever knowing which clips actually performed.

### Non-goals

- Not a replacement for an editor's judgement on the final polish.
- Not a general video editor.
- Not automating thumbnails, show notes, or the SEO article — different tools,
  different inputs.
- Not a client-facing product. Internal, local, one operator.

---

## 2. Pipeline

```
  episode media (video + audio)          PPD document
              │                                │
              └──────────────┬─────────────────┘
                             ▼
                    [1] ingest + align
                             │
                             ▼
                 transcript.json  (word-level timings)
                             │
                             ▼
                       [2] select                    ← Claude
                             │
                             ▼
                  moments (12 candidates, scored)
                             │
                             ▼
                    [3] compose                      ← deterministic
                             │
                             ▼
              ┌──────► clip-plan.json ◄──────┐       ← THE CONTRACT
              │              │                │
        [4] review           │           (hand edits)
       contact sheet         │
                             ▼
                        [5] emit
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    mp4 emitter         srt emitter        fcpxml emitter
   (5× 1080×1920)      (sidecars)         (editor handoff)
```

Stages 1–3 are one command (`plan`). Stage 5 is another (`emit`). They're
separate so the plan can be reviewed and hand-edited between them.

---

## 3. Stage 1 — Ingest and align

### The problem

The PPD is the text of record: human-read, speaker-attributed, correctly spelled
(names, company names, jargon). But it almost certainly carries no word-level
timings, and word-level timings are exactly what shorts captions live on.

Machine transcription has the opposite properties: precise timings, worse text.

**So: take timings from the machine, take words from the PPD, and align them.**

### Steps

1. **Transcribe** the episode audio locally for timings.
   - `whisper.cpp` (Metal-accelerated on Apple silicon) or `faster-whisper`.
   - Word-level timestamps required, not segment-level.
   - Output: word stream with start, duration, confidence.

2. **Parse the PPD** through a source adapter (see below) into a speaker-attributed
   text stream.

3. **Align** the two token streams — a longest-common-subsequence diff over
   normalised tokens (lowercase, strip punctuation). Matched runs take the PPD's
   spelling and the machine's timing. Unmatched machine tokens keep their own
   text and are flagged `aligned: false`. Unmatched PPD tokens get timings
   interpolated from their neighbours and are also flagged.

   Alignment coverage is reported. Below ~85%, the run warns loudly — that
   usually means the PPD is a summary rather than a transcript, or it's the wrong
   episode.

### The adapter interface

`⚠️ OPEN: the PPD's actual format is not yet pinned.` This is the first thing to
settle before building — it decides the whole ingest stage. The interface below
is designed so it doesn't matter which answer we get.

```js
// scripts/clips/sources/<name>.js
module.exports = {
  name: 'ppd',
  // Detect whether this adapter handles the given input.
  matches(inputPath) { /* → boolean */ },
  // Produce a speaker-attributed text stream.
  read(inputPath) {
    return {
      speakers: [ { id: 'host', name: "Dave O'Gara" }, { id: 'guest', name: '…' } ],
      turns: [ { speaker: 'host', text: '…' }, … ]
    };
  }
};
```

One adapter per source format. `ppd` is the one that matters; `whisper-only`
(skip alignment, use machine text directly) ships alongside it as the fallback
for episodes with no PPD, and as the thing to test against before the PPD parser
exists.

### Normalised transcript

```json
{
  "episode_id": "the-den-042",
  "show": "the-den",
  "duration": 3412.5,
  "source": { "ppd": "…/ppd.docx", "media": "…/episode.mp4", "alignment_coverage": 0.94 },
  "speakers": [
    { "id": "host",  "name": "Dave O'Gara" },
    { "id": "guest", "name": "Jane Smith" }
  ],
  "words": [
    { "t": 12.34, "d": 0.22, "w": "compounding", "speaker": "guest", "aligned": true },
    { "t": 12.56, "d": 0.31, "w": "returns",     "speaker": "guest", "aligned": true }
  ]
}
```

`t` = start seconds, `d` = duration seconds. Flat word array; sentences and gaps
are derived, never stored — derived data in a file is data that goes stale.

---

## 4. Stage 2 — Selection

One Claude call per episode. Input: the full transcript with timestamps plus the
show's clip brief. Output: scored candidate moments.

### What makes a good short (this is the actual IP)

These criteria go in the prompt and are the thing to tune over time:

- **Self-contained.** Lands with zero context. No "as I was saying", no
  callback to something 20 minutes earlier.
- **One idea.** Not a good three-minute answer trimmed to 40 seconds.
- **Hook in the first 3 seconds.** Opens on the claim, not the wind-up.
- **Has a spine** — a claim, a number, a story, a contrarian take, a named
  mistake. Not a pleasantry, not a segue, not agreement noises.
- **Lands.** Ends on a completed thought, not a trailing "…and so, yeah."
- **Attributable.** One speaker carries it, or a clean two-line exchange.

### Request shape

Node, CommonJS, to match `scripts/generate-draft.js` and `scripts/build-blog.js`.
Use the official SDK — `functions/package.json` already depends on
`@anthropic-ai/sdk`, so this is a dependency the repo already carries.

```js
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

const res = await client.messages.parse({
  model: 'claude-opus-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  system: [
    { type: 'text', text: SELECTION_RULES, cache_control: { type: 'ephemeral' } }
  ],
  messages: [{ role: 'user', content: transcriptAsIndexedText }],
  output_config: { format: zodOutputFormat(MomentsSchema) }
});
```

Structured outputs, not JSON-in-prose parsing. The existing
`generate-draft.js` validator hand-parses fenced JSON and swallows failures as a
pass (`scripts/generate-draft.js:60`) — don't repeat that here; a parse failure
must be an error.

`MomentsSchema` returns 12 candidates:

```js
{
  moments: [{
    start_word: 4821,          // index into transcript.words
    end_word:   4903,
    hook:       "The 10% number nobody believes",   // internal label, never burned in
    why:        "Names a number, then immediately backs it with a mechanism",
    score:      0.87,          // 0–1, the model's own confidence
    speaker:    "guest"
  }]
}
```

Twelve candidates, five ship. The extra seven are the bench — when a pick gets
rejected at review there's a replacement without re-running.

### Model and cost

`claude-opus-5` ($5/M in, $25/M out). Selection *is* the judgement call; it's the
one place in this pipeline where model quality shows up in the deliverable, and
it's a single call per episode.

A 60-minute episode is roughly 9,000 words ≈ 12K input tokens, with maybe 4K
output. That's about **$0.16 per episode** — roughly $8/month across ten shows at
weekly cadence. Cost is not a reason to downgrade here.

> **Existing-code note:** `scripts/generate-draft.js:44` pins
> `claude-haiku-4-5-20251001`. The current ID for that model is
> `claude-haiku-4-5` with no date suffix. Not urgent, not this tool's problem,
> but worth fixing next time that file is touched.

---

## 5. Stage 3 — Compose

Deterministic, no model. Turns word indices into cut points, framing, and caption
cues. This stage is where a naive tool produces clips that *feel* wrong, so the
rules are explicit.

### Boundary snapping

1. Never cut mid-word. Snap start back to `words[start].t`, end forward to
   `words[end].t + words[end].d`.
2. Extend outward to the nearest silence gap ≥ 250 ms, up to 1.5 s of search.
   A cut placed in a gap is invisible; a cut placed on a breath is not.
3. Add 150 ms lead-in and 350 ms tail. Without the tail, every clip feels
   guillotined.
4. Clamp: **15 s minimum, 75 s maximum**. Under 15 s there isn't room to land an
   idea; over 75 s, retention is gone regardless of platform ceilings.

### Internal tightening (phase 3)

Gaps > 700 ms *inside* a clip get cut. This is why the plan carries a
`segments` array rather than a single in/out — the schema supports multi-segment
clips from day one even though phase 1 always emits exactly one. Getting this
into the contract early costs nothing; retrofitting it later means re-cutting
every emitter.

### Frame layouts

Named layouts, not free-form geometry. Source is assumed 1920×1080; output is
always 1080×1920.

| Layout | What it does | Use when |
|---|---|---|
| `blur-pad` | Source scaled to 1080 wide, centred, blurred scaled-up copy behind | Default. Safe with any framing, any number of people on screen. |
| `speaker-crop` | 9:16 crop around one speaker, scaled to full frame | Single talking head. Highest impact — fills the screen with a face. |
| `stack-two` | Two 16:9 crops stacked, host above guest | Two-camera shows. The podcast-native vertical look. |

Each clip in the plan names its layout and carries the crop boxes it needs in
**source pixels**. In phase 1–2 these come from the show config (camera framing
doesn't move within an episode, so per-show boxes are correct and cost nothing).
Face detection to derive them per-clip is a phase-3 upgrade, not a prerequisite.

### Caption cues

- Group words into cues of **1–3 words**, max ~1.2 s per cue. Big, centred,
  one or two words at a time — the format shorts actually use.
- Cue text is **verbatim from the aligned transcript**. See §8.
- Vertical position: **62–78% of frame height**. Above the platform UI chrome at
  the bottom, clear of the top. Fixed, not per-clip.
- Active-word highlight: the current word in the show's accent colour, the rest
  of the cue in white.

---

## 6. The clip plan

The contract. Every emitter reads this and nothing else.

```json
{
  "version": 1,
  "episode_id": "the-den-042",
  "show": "the-den",
  "generated": "2026-08-30T14:02:11Z",
  "source_media": "/Volumes/APG/the-den/042/episode.mp4",
  "clips": [
    {
      "id": "the-den-042-c1",
      "rank": 1,
      "hook": "The 10% number nobody believes",
      "why": "Names a number, then immediately backs it with a mechanism",
      "speaker": "guest",
      "segments": [ { "in": 1284.15, "out": 1322.90 } ],
      "duration": 38.75,
      "layout": "speaker-crop",
      "crop": { "x": 656, "y": 0, "w": 608, "h": 1080 },
      "captions": [
        { "t": 0.00, "d": 0.72, "text": "Ten percent",  "words": [
            { "t": 0.00, "d": 0.31, "w": "Ten" },
            { "t": 0.31, "d": 0.41, "w": "percent" } ] },
        { "t": 0.72, "d": 0.55, "text": "of guests",    "words": [ … ] }
      ],
      "audio": { "target_lufs": -14.0 },
      "authored_text": []
    }
  ],
  "bench": [ { "…": "the 7 unshipped candidates, same shape" } ]
}
```

Caption times are **clip-relative**, segment times are **source-relative**. Mixing
those two frames is the single most likely bug in the whole tool; keeping the
distinction in the field names is deliberate.

---

## 7. Stage 5 — Emitters

```js
// scripts/clips/emitters/<name>.js
module.exports = {
  name: 'mp4',
  emit(plan, clip, opts) { /* → { files: [paths] } */ }
};
```

### `mp4` — the finished vertical clip

One FFmpeg invocation per clip. Filtergraph for `blur-pad`:

```
[0:v]split[fg][bg];
[bg]scale=1080:1920:force_original_aspect_ratio=increase,
    crop=1080:1920,gblur=sigma=40[bgb];
[fg]scale=1080:-2[fgs];
[bgb][fgs]overlay=(W-w)/2:(H-h)/2[comp];
[comp]subtitles=captions.ass[v]
```

For `speaker-crop`, replace the composite with
`crop=ih*9/16:ih:X:0,scale=1080:1920,setsar=1`. For `stack-two`, two crops each
scaled to 1080×960 and `vstack`ed.

Encode settings: H.264 high, `yuv420p`, CRF 18, source frame rate, AAC 192k,
`-movflags +faststart`.

**Seeking:** coarse `-ss (in - 2)` *before* `-i`, then fine `-ss 2 -t <duration>`
*after* — fast seek to a nearby keyframe, then frame-accurate trim. Coarse-only
lands on the wrong frame; fine-only decodes from the top of a 60-minute file.

**Loudness:** two-pass `loudnorm=I=-14:TP=-1.5:LRA=11`. Single-pass loudnorm
gives inconsistent results across clips from the same episode, which is exactly
the thing anyone would notice.

**Captions:** generate an `.ass` file per clip and burn it in with `subtitles=`.
ASS rather than SRT because it's the format that carries styling — font, weight,
outline, shadow, position, and per-word colour override for the highlight. One
Dialogue event per cue, with the active word wrapped in an inline colour
override. (libass also supports `\k` karaoke timing; per-event overrides are more
predictable to generate and to debug.)

### `srt` — caption sidecars

Plain SRT per clip, cue-grouped. For upload where the platform does its own
caption rendering, and for anyone who wants the text.

### `fcpxml` — editor handoff (phase 4)

FCPXML rather than a WolfCut project: both Premiere and Resolve import it, so
one emitter covers whatever the editor actually uses. A WolfCut emitter is a
30-line variant of the same code if that editor ever matures past alpha — the
plan already holds everything either format needs.

---

## 8. Guardrails

**Caption text is verbatim, always.** The model selects *boundaries*; it never
writes a word that appears on screen. Putting words in a client's or their
guest's mouth is the one failure here that can't be walked back — a mis-cut clip
is embarrassing, a fabricated quote is a different category of problem. Any
authored on-screen text (a title card, a hook overlay) goes in
`authored_text[]`, flagged, and requires human sign-off before it renders.

This is the same discipline as `scripts/apg-facts.md` applied to a different
surface: that file exists because generated prose drifts from the truth, and clip
captions are generated prose over someone else's voice.

**Alignment coverage is a gate, not a warning to click through.** Below 85%, the
plan command exits non-zero.

**Nothing auto-publishes.** The tool writes files to disk. A human moves them.

---

## 9. Review

`review` writes a single self-contained HTML contact sheet next to the plan: the
5 picks in rank order, each with hook, why, timecode, duration, a poster frame
pulled at the clip's midpoint, and the full caption text. The 7 bench candidates
below, collapsed.

Editing the plan is editing the JSON — change an `in`/`out`, swap a clip for one
off the bench, change a `layout` — then re-run `emit`. No round-trip through a UI.

Target: **two minutes of review per episode**, and the reviewer is deciding, not
transcribing.

---

## 10. Layout, CLI, config

```
scripts/clips/
  plan.js               # ingest → align → select → compose → clip-plan.json
  emit.js               # clip-plan.json → files
  review.js             # clip-plan.json → contact-sheet.html
  lib/
    align.js            # LCS diff over token streams
    transcribe.js       # whisper wrapper
    compose.js          # snapping, layouts, cue grouping
    ass.js              # ASS subtitle writer
    ffmpeg.js           # filtergraph builders + invocation
  sources/
    ppd.js
    whisper-only.js
  emitters/
    mp4.js
    srt.js
    fcpxml.js           # phase 4
  shows/
    the-den.json
    high-stakes.json
    …
```

```bash
node scripts/clips/plan.js   --episode /Volumes/APG/the-den/042 --show the-den
node scripts/clips/review.js --plan .../clip-plan.json
node scripts/clips/emit.js   --plan .../clip-plan.json --emitter mp4 --out ./dist
```

Runs locally. Episode video is multi-GB — it never leaves the machine, never gets
uploaded, and never touches a CI runner or a Firebase function (both of which
would hit hard timeout and size ceilings on the first real episode).

### Per-show config

The `reports/` directory shows ten active shows — the-den, high-stakes, sylt,
soliverse, bobby-owsinski, trial-lawyer-view, the-surveying-shift,
transformational-educators, socially-awkward, workspace-design-lab — each with
its own brand and camera setup. Per-show config is therefore a requirement, not a
nice-to-have:

```json
{
  "show": "the-den",
  "default_layout": "speaker-crop",
  "speakers": { "host": { "crop": { "x": 96,  "y": 0, "w": 608, "h": 1080 } },
                "guest": { "crop": { "x": 1216, "y": 0, "w": 608, "h": 1080 } } },
  "captions": { "font": "…", "weight": 800, "size": 78,
                "fill": "#FFFFFF", "highlight": "#…", "outline": 6,
                "y_pct": 0.68 },
  "clip_brief": "Optional show-specific selection guidance, appended to the rules."
}
```

---

## 11. Phases

| Phase | Ships | Value at this point |
|---|---|---|
| **1** | transcribe → align → select → plan → contact sheet. No rendering. | Finding the moments stops being manual. Biggest single time win, smallest build. |
| **2** | `mp4` emitter, `blur-pad`, burned captions, loudness. `srt`. | Clips render unattended. Editor polishes rather than builds. |
| **3** | `speaker-crop` + `stack-two`, PPD adapter, internal tightening. | Clips stop looking auto-generated. |
| **4** | `fcpxml` handoff. Selection-prompt tuning against clips that performed. | Full NLE round-trip; selection quality compounds. |

Phase 1 is worth shipping alone. If it stops there it has still removed the
scrubbing.

---

## 12. Risks and open questions

**Open — needs an answer before phase 1:**

- **PPD format.** Word doc? Notion page? Google Doc? Something else? This
  decides the ingest adapter and is the only true blocker.
- **Does the PPD carry timings already?** If yes, the transcribe-and-align step
  collapses to a parse, and phase 1 gets substantially smaller.
- **Where do episode masters live**, and is the layout consistent per show?
  `plan.js --episode <dir>` assumes a predictable directory.

**Risks:**

- **Selection quality is the whole tool.** Everything else is plumbing that
  either works or doesn't. There's no way to know if the picks are good without
  a reference set — collect 20–30 past clips that actually performed and check
  the tool's picks against them before trusting it on live episodes.
- **Diarisation.** Speaker attribution comes from the PPD where it exists;
  whisper-only episodes will need a diarisation pass, which is a meaningful
  accuracy risk on crosstalk.
- **Source variability.** Resolution, camera count, and framing differ per show.
  Per-show config absorbs this, but every new show needs its boxes set once.
- **Compute.** Whisper is roughly real-time on CPU, several times faster with
  Metal/GPU. A 60-minute episode is a coffee break, not a background task.
- **Alignment on heavily-edited PPDs.** If the PPD is cleaned up rather than
  verbatim, coverage drops and the gate fires. That's the gate working, but it
  means the fallback path (whisper-only) has to be genuinely usable.
