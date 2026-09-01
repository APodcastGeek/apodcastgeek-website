# Saved video triage

Turns short-form video you save into a reviewable shortlist: transcript, summary,
1–10 usefulness rating, verdict, and concrete ways APG could use it — all landing
in a Notion database you can work through later.

```
Share sheet → Notion row (Status: New) → scheduled job → transcript + analysis → Status: Triaged
```

## Why sharing, not saving

Instagram exposes no API for your saved/bookmarked collection, and no webhook fires
when you save something. Instead of fighting that, this changes the gesture: **Share
→ Shortcut** instead of **Save**. One extra tap, fully supported, nothing to break
when Meta reshuffles their backend.

## Setup

### 1. Create the Notion database

```bash
cd tools/reel-triage
npm install
NOTION_API_KEY=secret_... NOTION_PARENT_PAGE_ID=<page-id> npm run setup-db
```

It prints a database id. Share the database with your Notion integration
(**⋯ → Connections**), or the API can't see it.

### 2. Add repository secrets

`Settings → Secrets and variables → Actions`:

| Secret | Purpose |
| --- | --- |
| `NOTION_API_KEY` | Already set for the blog workflows |
| `NOTION_TRIAGE_DB_ID` | The id from step 1 |
| `ANTHROPIC_API_KEY` | Already set for the blog workflows |
| `YTDLP_COOKIES` | Optional but see below — contents of a `cookies.txt` |

### 3. Build the iOS Shortcut

Shortcuts → new shortcut → **Show in Share Sheet**, accepting *URLs*:

1. **Ask for Input** (Text) — "Why are you saving this?" — allow empty
2. **Get Contents of URL**
   - URL: `https://api.notion.com/v1/pages`
   - Method: `POST`
   - Headers: `Authorization: Bearer <token>`, `Notion-Version: 2022-06-28`, `Content-Type: application/json`
   - Request body (JSON):

```json
{
  "parent": { "database_id": "<NOTION_TRIAGE_DB_ID>" },
  "properties": {
    "Name": { "title": [{ "text": { "content": "(pending)" } }] },
    "URL": { "url": "<Shortcut Input>" },
    "Status": { "select": { "name": "New" } },
    "My Note": { "rich_text": [{ "text": { "content": "<Provided Input>" } }] }
  }
}
```

The job overwrites `Name` with the real video title once it processes the row.

Note this puts a Notion token on your phone. Use a token scoped to just this
database, and rotate it if you lose the device.

## Instagram from CI needs cookies

Instagram serves almost nothing to logged-out clients and throttles datacenter IPs
hard, so a GitHub Actions runner will often fail to download. Export cookies from a
logged-in browser session in Netscape `cookies.txt` format and paste the file
contents into the `YTDLP_COOKIES` secret.

Expect this to be the flakiest part of the pipeline. Cookies expire, and Meta
actively discourages this. Rows that fail are marked `Failed` with the reason
rather than disappearing, so you can re-run them locally:

```bash
cd tools/reel-triage
NOTION_API_KEY=... NOTION_TRIAGE_DB_ID=... ANTHROPIC_API_KEY=... node triage.js
```

Running locally from a residential IP with a logged-in browser is considerably more
reliable than the scheduled job. Flip a `Failed` row back to `New` to retry it.

Downloading other people's videos to transcribe for private notes is a Meta ToS
matter. Keep the transcripts internal — don't republish them.

## What it costs

- **Transcription** — free. `faster-whisper` runs locally on the runner's CPU.
- **Analysis** — Claude Opus 5 at $5/$25 per million input/output tokens. A 60–90s
  reel is roughly 2K input and 1–2K output tokens including thinking, so about
  **$0.04–0.05 per video** — call it $4–5/month at 100 videos.
- **GitHub Actions** — free on public repos; a few minutes per run otherwise.

Set `TRIAGE_MODEL=claude-sonnet-5` to cut the analysis cost roughly 5×, at some
loss of judgement quality in the ratings.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOTION_API_KEY` | — | Required |
| `NOTION_TRIAGE_DB_ID` | — | Required |
| `ANTHROPIC_API_KEY` | — | Required |
| `TRIAGE_MODEL` | `claude-opus-5` | Analysis model |
| `TRIAGE_MAX_ITEMS` | `10` | Rows per run |
| `WHISPER_MODEL` | `small` | `tiny`/`base`/`small`/`medium` — bigger is slower and more accurate |
| `YTDLP_COOKIES_FILE` | — | Path to `cookies.txt` |

## How ratings work

The model reads `scripts/_apg-facts.md` (falling back to the pre-rename `scripts/apg-facts.md`), so "what could we use this for" is grounded
in what APG actually sells rather than generic advice. It's told most saved content
is a 4–6 and that a well-argued Skip beats an inflated score — if everything comes
back an 8, that prompt in `triage.js` is the thing to tune.

## Tests

```bash
npm test
```

Covers the payload helpers that keep requests inside Notion's 2000-character limits
and the rating clamp.
