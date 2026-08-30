# Clip Timecode Locator — Spec

Close the one gap in the existing short-form clip process: the PPD names the
exact words to cut, but not where they are in the raw file.

Status: spec, not built. Written 2026-08-30, revised after reading the real PPD
and the clip selection guide.

---

## 1. What already exists

APG already has a short-form clip system, and it is more developed than anything
worth rebuilding. Two documents define it:

**`Short-Form Clip Selection — Production Brief Guide`** — the selection method:

- 5 clips per episode, 30–50 s ship target. Under 30 s gets flagged for QA;
  50–70 s gets flagged as needing a trim; over 70 s is rejected outright as the
  wrong clip rather than a trim job.
- A 9-type moment taxonomy in priority order — personal story with payoff,
  unpublished confession, expert explainer, contrarian take, surprising stat,
  emotional peak, host/guest tension, numbered list, quotable money line — with
  a spread rule (one per type, up to 3 personal stories).
- An 8-value hook angle vocabulary: Contrarian, Specific Number, Open Loop,
  Expert Explainer Setup, Negativity-Loss, Proof-First, Bold Statement, Question.
- **Hook / Bridge / Climax construction as reverse storytelling** — the three
  beats are pulled from wherever they sit in the transcript, explicitly not a
  chronological chunk. The climax lands at 40–60% and runs on to the real ending.
- Caption formatting rules: ALL CAPS, apostrophes kept, digits not words, no
  full stops or commas, quotation marks around reported speech.

**The per-episode PPD** (e.g. `Soliverse EP46 — Pre-Production Brief`) — the
output: guest intro cuts, 5 clips each with title, moment type, hook angle,
strategic rationale and verbatim ALL-CAPS caption text, plus thumbnails, show
notes, and a complete publishing pack (caption, hashtags, Shorts title,
description, tags per clip). It ends with a QA checklist that self-verifies the
brief against the guide's own rules.

This is a working system. The selection judgement, the taxonomy, the caption
copy, and every piece of publishing metadata are already produced. **Nothing in
this spec should try to replace any of it.**

## 2. The gap

The PPD carries verbatim quotes but no timecodes. From the Soliverse EP46 brief,
stated once at the top and repeated on every single cut:

> Note on timecodes: the source transcript Dave provided is speaker-labeled only
> and contains NO embedded timestamps. Every clip and intro cut below carries the
> exact verbatim quote so the editor can locate it in the raw file. **Timecodes
> must be added by the editor at the edit stage.** Nothing here is invented.

```
Timecode: [No timecode in source transcript - editor to locate]
```

The selection guide lists "Hook / Bridge / Climax **timestamps** + transcript
text" as a required field of every clip. The brief format wants timecodes. It
just can't produce them when the source transcript has none.

So on every episode, an editor scrubs a 35–45 minute raw file hunting for
**roughly 17 verbatim quotes** — 5 clips × 3 beats, plus 2 guest intro cuts. The
words are already decided. The work is purely locating them.

That is the whole problem worth solving.

### What this costs today

Beyond the scrub time, three things are unknowable until an editor has located
everything by hand:

- **Clip duration.** The guide's 30 s / 50 s / 70 s thresholds can't be checked
  at brief-writing time, so a clip that turns out to be 80 seconds is discovered
  at the edit stage — after it's been written up, captioned, and packed for
  publishing.
- **Whether the quote is even findable.** A paraphrase that drifted from what was
  actually said surfaces as an editor failing to find it.
- **Beat ordering.** Hook, Bridge and Climax are pulled from different points, so
  their source order is arbitrary — nobody knows the real assembly until it's cut.

---

## 3. Fix A — upstream, and much cheaper

**Give the brief writer a timestamped transcript in the first place.**

The PPD's own note names the cause precisely: *"the source transcript Dave
provided is speaker-labeled only and contains NO embedded timestamps."* The brief
format already has a slot for timecodes. Fill the input and the output fills
itself — no tool, no new process, no code.

Concretely: whatever produces the transcript that goes into brief writing should
emit `[MM:SS]` markers per speaker turn, or per sentence. Most transcription
services do this natively and it's usually a setting rather than a change of
tool. If transcripts come from an editor's pass or a service that can't, a local
`whisper.cpp` run over the episode audio produces a timestamped transcript
directly.

This should be tried before anything in §4 gets built. It solves the problem for
every future episode at approximately zero cost, and it puts the timecodes in the
document where the process already expects them.

**Fix A does not cover:** briefs already written without timecodes, and
sentence-level markers being coarser than a frame-accurate cut point — an editor
still nudges the in-point off a `[12:04]` marker. For a first pass that is
probably fine. §4 is what closes the remaining gap, and it is worth building only
if the residual scrub still hurts after Fix A is in place.

---

## 4. Fix B — the quote locator

A local CLI that takes the PPD and the raw media and returns exact in/out
timecodes for every quoted beat.

```
  raw episode media            PPD (Google Doc export)
          │                             │
          ▼                             ▼
  [1] transcribe               [2] parse beats
   word-level timings           quotes + structure
          │                             │
          └──────────────┬──────────────┘
                         ▼
                  [3] locate quotes
               fuzzy match → timecodes
                         │
                         ▼
                  clip-plan.json
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        [4] review            [5] emit (optional)
     timecodes + durations    mp4 / srt / fcpxml
```

### Stage 1 — Transcribe

`whisper.cpp` (Metal-accelerated) or `faster-whisper` over the episode audio,
**word-level** timestamps. This transcript is never shipped and never seen — it
exists only as a coordinate system to locate the PPD's quotes against. Its text
quality barely matters; its timing accuracy is everything.

### Stage 2 — Parse the PPD

The PPD is a Google Doc. Export as plain text or `.docx`, or pull it directly via
the Drive API — the docs live in Dave's Drive and are readable programmatically,
so the manual download offered isn't necessary. Manual export stays as the
fallback.

The structure is regular enough to parse with anchored patterns:

- `SECTION 2: GUEST INTRO` → `--- GUEST INTRO CLIP n ... ---` blocks, each with
  a `Caption (ALL CAPS):` line.
- `SECTION 3: SHORT FORM CLIPS` → `CLIP n` blocks with `Clip title:`,
  `Moment type:`, `Hook angle:`, `Strategic rationale:`, then `HOOK` and
  `CONTENT TO FOLLOW` entries each carrying `Timecode:` and
  `Transcript (ALL CAPS):`.

Note the shape drift worth handling: the guide specifies three beats (Hook /
Bridge / Climax), the EP46 brief emits two (`HOOK` / `CONTENT TO FOLLOW`). The
parser should accept **1–3 beats per clip** rather than assuming either.

`⚠️ Confirm before building:` whether the two-beat form is the current house
format or an EP46-specific variation, and whether every show's PPD follows the
same section headings.

### Stage 3 — Locate

For each quote, find where it occurs in the word stream.

**Normalisation, both sides:** lowercase, strip punctuation, collapse whitespace.
Two conversions matter specifically because of the caption rules:

- **Digits ↔ words.** The PPD writes numbers as digits by rule ("720 GIGAWATTS",
  "99 PERCENT"); whisper may emit either. Normalise both directions before
  matching or every number-bearing quote — which, given "Specific Number" is a
  primary hook angle, is most of them — fails to match.
- **Reported-speech quote marks.** The PPD inserts quotation marks around "he was
  like…" constructions. They aren't spoken and must be stripped.

**Match:** slide the normalised quote across the normalised word stream, scoring
by token-level edit distance. Take the best-scoring window; map its first and
last tokens back to their real `t` values.

**Report confidence on every match.** A quote that was lightly paraphrased into
the brief will score meaningfully lower than a verbatim one, and that is the
signal worth surfacing — it says "this line isn't quite what was said" while
there's still time to fix the brief. Below a threshold, flag rather than guess.
Never emit a timecode the tool isn't confident in; a wrong timecode is worse than
an absent one, because absent sends the editor to the scrub they're already
doing, while wrong sends them to the wrong part of the file.

### Stage 4 — Snap and check

- Snap out-points to the end of the final word, plus a 350 ms tail. Extend to the
  next silence gap ≥ 250 ms within 1.5 s of search. A cut in a gap is invisible;
  a cut on a breath is not.
- 150 ms lead-in on in-points.
- **Compute total clip duration and apply the guide's own thresholds:**
  under 30 s → flag for QA review; 50–70 s → flag as needing a trim; over 70 s →
  flag as reject-and-reselect. These are the guide's rules, checked automatically
  at brief time instead of discovered at edit time.
- Report each clip's beats in **source order** alongside their brief order, so the
  reverse-storytelling assembly is visible before anyone opens an editor.

---

## 5. The clip plan

```json
{
  "version": 1,
  "episode": { "show": "soliverse", "number": 46,
               "file_name": "SOL_EP46_Julian_Jansen",
               "ppd": "https://docs.google.com/document/d/…" },
  "source_media": "/Volumes/APG/soliverse/046/raw.mp4",
  "intro_cuts": [
    { "n": 1, "role": "cold_open", "target": [5, 9],
      "caption": "IN 2008 IT WASN'T ABOUT A BATTERY MAKING MONEY …",
      "in": 412.80, "out": 419.15, "duration": 6.35, "confidence": 0.97 }
  ],
  "clips": [
    {
      "n": 1,
      "title": "Every Percent Is Money",
      "moment_type": "Quotable money line",
      "hook_angle": "Specific Number",
      "rationale": "A hard operating claim tied straight to revenue …",
      "beats": [
        { "role": "hook",
          "caption": "EVERY PERCENTAGE OF AVAILABILITY IS WORTH A LOT OF MONEY FOR A CUSTOMER IN A MERCHANT MARKET CONTEXT",
          "in": 1284.15, "out": 1291.02, "confidence": 0.99 },
        { "role": "content",
          "caption": "SO MAKING SURE YOU HAVE HIGH AVAILABILITY AND FLUENCE'S FLEET HAS BEEN CERTIFIED …",
          "in": 1301.40, "out": 1329.88, "confidence": 0.96 }
      ],
      "duration": 35.35,
      "source_order": [1, 2],
      "flags": []
    }
  ],
  "unlocated": []
}
```

`beats` is an array because Hook, Bridge and Climax are pulled from different
points in the transcript — a clip is inherently non-contiguous, and any emitter
has to concatenate. `source_order` exposes whether the brief's order matches the
recording's.

`caption` text is copied **verbatim from the PPD**, never regenerated from the
machine transcript. The PPD's caption copy has already been through the house
formatting rules and QA; the machine transcript is a coordinate system, not a
source of words. This is also the safety property: the tool cannot put words in a
guest's mouth, because it never writes any.

---

## 6. Emitters (optional, later)

Only worth building once located timecodes are trusted. Same interface either
way: read the plan, write files.

- **`fcpxml`** — the highest-value one. A multi-segment clip per beat, in brief
  order, dropped straight onto an editor's timeline in Premiere or Resolve. This
  is the handoff that removes assembly as well as locating.
- **`srt`** — caption sidecars from the PPD text, timed to the located beats.
- **`mp4`** — full auto-render: 1080×1920, burned ALL-CAPS captions, loudness
  normalised. Details below, but this is the least urgent piece: it competes with
  an editor's polish, whereas locating and assembly compete with nobody.

If `mp4` is built: crop or blur-pad to 9:16 (per-show config, since camera
framing is fixed within a show), captions burned via an `.ass` file for styling
control, two-pass `loudnorm=I=-14:TP=-1.5:LRA=11`, H.264 / yuv420p / CRF 18 /
AAC 192k / `+faststart`. Seek with a coarse `-ss` before `-i` and a fine `-ss`
after, so a 45-minute file doesn't decode from the top for a 35-second cut.

---

## 7. Where it runs

Local CLI, Node, CommonJS to match `scripts/generate-draft.js` and
`scripts/build-blog.js`.

```bash
node scripts/clips/locate.js --ppd <doc-id-or-path> --media <raw.mp4>
node scripts/clips/review.js --plan clip-plan.json
node scripts/clips/emit.js   --plan clip-plan.json --emitter fcpxml
```

Raw episode masters are multi-GB. They never leave the machine and never touch a
CI runner or a Firebase function — both have timeout and size ceilings that a
45-minute master breaks immediately.

---

## 8. Phases

| Phase | Ships | Value |
|---|---|---|
| **0** | **Fix A** — timestamped transcripts into brief writing. No code. | May close the gap entirely. Try before building anything. |
| **1** | `locate.js` + review output: timecodes, durations, threshold flags, confidence. | Kills the scrub. Duration problems surface at brief time. |
| **2** | `fcpxml` emitter. | Assembly handed over too, not just locations. |
| **3** | `srt`, then `mp4` if auto-render earns its place. | Diminishing; only if the editor's polish stops being the bottleneck. |

Phase 0 might make phases 1–3 unnecessary. That is the good outcome, and it's why
it's phase 0 rather than a footnote.

---

## 9. What was considered and dropped

**Automating clip selection.** An earlier draft of this spec proposed a Claude
call to pick moments and score them. That was written before reading the
selection guide and a real PPD. Selection already exists, is documented to a
level of detail the proposal did not approach, and produces richer output — the
taxonomy, the reverse-storytelling construction, the caption copy, the publishing
pack. Rebuilding it would be a downgrade. The tool locates; it does not choose.

**WolfCut as a base** (`jub0t/WolfCut`, the open-source CapCut replacement that
prompted this research). Not useful here. Its shorts-relevant features —
auto-reframe, word-level caption highlighting, silence removal — are unbuilt
roadmap items, its CLI is a ~200-line engine test harness that can't open a
project file, and it's five days old at `v0.2.0-alpha.6`. More to the point, the
bottleneck isn't editing capability. It's knowing where in the file the words
are, which WolfCut doesn't do either.

**Regenerating captions from the transcript.** The PPD's caption text is already
correct and already QA'd against house formatting rules. Re-deriving it would
introduce errors into text that has none.

---

## 10. Open questions

1. **Can the transcript source emit timestamps?** This is phase 0 and the whole
   question. If yes, most of this spec is unnecessary.
2. **Two beats or three?** The guide specifies Hook / Bridge / Climax; EP46 emits
   HOOK / CONTENT TO FOLLOW. Which is current, and is it consistent across shows?
3. **Is the PPD section structure stable across shows?** The parser anchors on
   headings; ten shows with drifting templates means ten parsers.
4. **Where do raw masters live**, and is the path predictable per show?
5. **Who runs this** — Dave, or Terry/Krisha as part of brief QA? That decides
   whether the output is a CLI report or something friendlier.

---

*Appendix note, unrelated to this tool:* `scripts/generate-draft.js:44` pins
`claude-haiku-4-5-20251001`. The current ID for that model carries no date
suffix. Worth fixing next time that file is touched.
