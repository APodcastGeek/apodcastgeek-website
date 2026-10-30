# YouTube Pro

[AgriciDaniel/youtubepro](https://github.com/AgriciDaniel/youtubepro) — a local-first
workspace for YouTube research, AI insights, script writing and thumbnail creation.
Apache 2.0.

Not vendored into this repo: it is a standalone React/Express app with 426 npm
dependencies and has no business living in the marketing site. Clone it wherever you
keep local tools. These are the steps, verified end to end.

## Install

```bash
git clone https://github.com/AgriciDaniel/youtubepro && cd youtubepro
cp .env.example .env      # or leave it and enter keys in Settings
npm ci
npm run dev               # http://127.0.0.1:5000
```

Needs Node 22.12+. Two keys, both Google:

- `YOUTUBE_API_KEY` — YouTube Data API v3, from Google Cloud Console.
- `GEMINI_API_KEY` — from Google AI Studio. Drives insights, ideas, scripts, thumbnails.

Keys stay server-side and are never returned to the browser. Without them the app
still boots and returns a clean 503 naming the missing key.

## Verified on 2026-08-30

Against commit `63cd9b9`:

| check | result |
|---|---|
| `npm ci` | 426 packages, clean |
| `npm audit` | 0 vulnerabilities |
| `npm test` | 62/62 pass |
| `npm run check` (tsc) | clean |
| `npm run build` | clean |
| production boot | serves on loopback, full CSP + nosniff + Permissions-Policy |
| Settings gate w/ `X-Forwarded-For` | 403 rejected, no `.env` written |
| Settings gate w/ foreign `Host` | 403 rejected, no `.env` written |

Source review: outbound hosts are Google/YouTube only (`googleapis.com`,
`i.ytimg.com`, `yt3.ggpht.com`, fonts). No telemetry, no npm install lifecycle
hooks, no response-body logging.

## Watch out for

- **YouTube search quota.** Search costs 100 units against a 10,000/day default
  quota — roughly 100 searches per day. Enrichment calls are far cheaper. This is
  the limit you will hit first.
- **Do not expose it.** It binds `127.0.0.1` deliberately and has no login. Setting
  `HOST=0.0.0.0` puts an unauthenticated app holding two billable API keys on the
  network.
- **Gemini image output carries SynthID** provenance watermarking.
- The `@replit/vite-plugin-*` devDependencies are leftovers from the project's
  Replit origin. Development only, not in the production build.

## Why it fits here

Research to script to thumbnail matches the episode-promo pipeline. The script
writer's output is a natural input to `/slopmonster` before anything ships.
