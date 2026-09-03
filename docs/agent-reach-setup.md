# Agent-Reach setup (free web access for Claude)

Gives Claude read/search access to YouTube transcripts, Reddit, GitHub, X and
other platforms without paid API keys.

Upstream: https://github.com/Panniantong/agent-reach (MIT)

Everything below is verified against the upstream source (`agent_reach/cli.py`,
`pyproject.toml`), not against third-party writeups.

## Important correction to the circulated guide

The widely-shared "Free Agent Web Access Setup" writeup says to install this as
an MCP server and add it under **Customize → Connectors**. That does not work:

- Agent-Reach ships a **single CLI entry point** (`agent-reach`). It has no MCP
  server binary — verified against `[project.scripts]` in its `pyproject.toml`.
- It integrates with Claude as a **Skill**, not a Connector. The installer
  writes a `SKILL.md` into the agent's skills directory.
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
```

**`agent-reach install` is check-only by default.** The mutually exclusive
`--safe` / `--system` pair defaults to `--safe`, so a bare
`agent-reach install --env=auto` inspects your environment and changes nothing.
Actually installing system dependencies, global tools, config and the skill file
requires `--system` explicitly:

```bash
agent-reach install --env=auto --dry-run --system   # show what it would do
agent-reach install --env=auto --system             # do it
```

The `--dry-run` pass is worth doing first: `--system` is what grants the
installer permission to touch global tooling on your machine.

There is also an interactive wizard if you would rather be walked through it:

```bash
agent-reach setup
```

Optional extra channels — the accepted values are `twitter`, `xiaoyuzhou`,
`xueqiu`, `xiaohongshu`, `reddit`, `facebook`, `instagram`, `bilibili`,
`linkedin`, `all`:

```bash
agent-reach install --env=auto --system --channels=reddit,twitter
```

Verify which channels actually came up:

```bash
agent-reach doctor
```

Then restart Claude Code / Claude Desktop so the new skill is picked up. If
Claude still doesn't see the tools, the skill file can be (re-)registered on its
own without re-running the whole installer:

```bash
agent-reach skill --install
```

## Credentials

Free with no auth: **YouTube** (via yt-dlp), **GitHub** (public repos), **RSS**,
and arbitrary URLs (via Jina Reader). These are the reliable ones.

`agent-reach configure` accepts exactly these keys: `proxy`, `github-token`,
`groq-key`, `openai-key`, `twitter-cookies`, `youtube-cookies`, `xhs-cookies`.

Pass secrets on stdin rather than as arguments, so they don't land in your shell
history or the process table:

```bash
agent-reach configure github-token --stdin      # raises public-repo rate limits
agent-reach configure twitter-cookies --stdin
agent-reach configure proxy --stdin             # restricted networks only
```

Cookies can also be pulled straight from a local browser profile, which avoids
copying them by hand. `--platform` is required with `--from-browser`; browsers
are `chrome`, `firefox`, `edge`, `brave`, `opera`, and platforms are `twitter`,
`xiaohongshu`, `bilibili`, `xueqiu`:

```bash
agent-reach configure --from-browser chrome --platform twitter
```

Reddit requires a login as well.

Note that the cookie-based options hand live session cookies for those accounts
to a third-party tool. Prefer a throwaway account over a primary one, and skip
these entirely if you only need the no-auth sources above.

## Known limits

- X/Twitter has tightened access and moved to pay-per-use; expect rate limits
  or intermittent failures even when configured.
- The `transcribe` subcommand runs Whisper via **Groq or OpenAI** and needs a
  paid key (`groq-key` / `openai-key`). It is not part of the "no API keys"
  path — YouTube transcripts come from captions via yt-dlp instead.
- Empty transcript = the video has no captions. Try auto-captions or another
  video.
- A tool returning nothing usually means that platform is rate-limited, not
  that the install is broken. Re-run `agent-reach doctor` to confirm.

## Uninstall

```bash
agent-reach uninstall        # removes config, tokens and skill files
pipx uninstall agent-reach
```

To remove only the skill registration and leave the CLI in place:

```bash
agent-reach skill --uninstall
```
