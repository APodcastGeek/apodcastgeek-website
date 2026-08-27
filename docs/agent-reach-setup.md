# Agent-Reach setup (free web access for Claude)

Gives Claude read/search access to YouTube transcripts, Reddit, GitHub, X and
other platforms without paid API keys.

Upstream: https://github.com/Panniantong/agent-reach (MIT)

## Important correction to the circulated guide

The widely-shared "Free Agent Web Access Setup" writeup says to install this as
an MCP server and add it under **Customize → Connectors**. That does not work:

- Agent-Reach ships a **single CLI entry point** (`agent-reach`). It has no MCP
  server binary — verified against `[project.scripts]` in its `pyproject.toml`.
- It integrates with Claude as a **Skill**, not a Connector. `agent-reach
  install --system` writes a `SKILL.md` into the agent's skills directory.
- Connectors only accept *hosted/remote* MCP servers. A local Python CLI can
  never appear there.

It does use MCP internally for a couple of backends (Exa search via `mcporter`,
`xiaohongshu-mcp`, `mcp-server-linkedin`), which is probably how the
"it's an MCP" claim started.

## Requirements

- Python 3.10+
- `pipx` recommended

## Install

Run these on your own machine — not in a Claude Code cloud session, whose
container is discarded when the session ends.

```bash
pipx install https://github.com/Panniantong/agent-reach/archive/main.zip
agent-reach install --env=auto
```

`--env=auto` does dependency detection only. Registering the skill so Claude
can see it requires the explicit `--system` flag:

```bash
agent-reach install --env=auto --system
```

Optional extra channels:

```bash
agent-reach install --env=auto --system --channels=all
```

Verify which channels actually came up:

```bash
agent-reach doctor
```

Then restart Claude Code / Claude Desktop so the new skill is picked up.

## Credentials

Free with no auth: **YouTube** (via yt-dlp), **GitHub** (public repos), **RSS**,
and arbitrary URLs (via Jina Reader). These are the reliable ones.

Auth required:

```bash
agent-reach configure twitter-cookies   # sets TWITTER_AUTH_TOKEN + TWITTER_CT0
agent-reach configure xhs-cookies
agent-reach configure proxy             # if you are behind a restricted network
```

Reddit requires a login as well.

Note that the cookie-based options hand live session cookies for those accounts
to a third-party tool. Prefer a throwaway account over a primary one, and skip
these entirely if you only need the no-auth sources above.

## Known limits

- X/Twitter has tightened access and moved to pay-per-use; expect rate limits
  or intermittent failures even when configured.
- Empty transcript = the video has no captions. Try auto-captions or another
  video.
- A tool returning nothing usually means that platform is rate-limited, not
  that the install is broken. Re-run `agent-reach doctor` to confirm.

## Uninstall

```bash
agent-reach uninstall
pipx uninstall agent-reach
```
