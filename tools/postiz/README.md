# Postiz self-host

[Postiz](https://github.com/gitroomhq/postiz-app) is an open-source social media
scheduler (AGPL-3.0). This directory holds the deployment config for running it
on an A Podcast Geek host so we can queue episode clips to Instagram and friends.

**This cannot run in a Claude Code web session** — those containers have no Docker
daemon, are reclaimed after inactivity, and have no public HTTPS URL for Meta's
OAuth callback. Run it on a real host.

## Install

```bash
cd tools/postiz
cp .env.example .env
openssl rand -hex 48            # paste into JWT_SECRET
$EDITOR .env                    # set MAIN_URL + JWT_SECRET + change the postgres password
docker compose up -d
docker compose logs -f postiz   # first boot runs DB migrations, give it a few minutes
```

Postiz listens on `:4007`. Put a reverse proxy (Caddy, nginx, or a Cloudflare
Tunnel) in front of it terminating TLS at `MAIN_URL`. **`MAIN_URL` must be the
exact public HTTPS URL you browse** — Postiz builds its OAuth redirect URIs from
it, and a mismatch makes every channel connection fail.

Once you have registered your own account, set `DISABLE_REGISTRATION=true` in
`.env` and `docker compose up -d` again.

## Connecting Instagram

Instagram has no credentials of its own in Postiz — it authenticates through a
Meta app, so `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` are what drive it.

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   (type: Business).
2. Add the **Instagram** product and set the OAuth redirect URI to
   `${MAIN_URL}/api/integrations/social/instagram`.
3. Put the app ID and secret into `.env`, then `docker compose up -d`.
4. Add your own Instagram account as a **developer or tester** on the Meta app.
   Until Meta approves the advanced permissions, only listed dev/tester accounts
   can connect at all. Budget days for app review, not minutes.
5. In Postiz, Add Channel -> Instagram.

### Meta's constraints (not Postiz's)

- The IG account must be **Business or Creator**. Personal accounts cannot
  publish via API.
- **Reels require a Business account** — Creator accounts are not supported for
  Reels publishing through the API.
- Connecting via a Facebook Business (Page-linked) unlocks the Instagram Audio
  API; the standalone Instagram flow does not, so you cannot attach music or
  original sounds to Reels on a standalone connection.
- Supported: feed posts (single image, carousel, video/Reels) and Stories
  (image and video).
- Not supported: Story link stickers / swipe-up — the Graph API does not expose
  interactive sticker payloads.
- Rate limit: 100 API-published posts per rolling 24h per account. A carousel
  counts as one.

## Notes

- **Licensing.** AGPL-3.0. Fine for internal agency use. If we ever offer a
  hosted Postiz to clients as a service, the copyleft obligations need a look
  first.
- **Resources.** The Temporal stack (Elasticsearch + its own Postgres) is the
  heavy part. Give the host ~4GB RAM.
- **Backups.** All state is in the `postgres-volume` and `postiz-uploads`
  Docker volumes.
- **Automation.** Postiz has a REST API and an agent CLI, which is the hook for
  wiring episode-clip generation into a posting queue.
- This lives in the website repo only because that is the repo attached to the
  session it was written in. It probably belongs in `claude-workspace` — moving
  it is just a directory move.
