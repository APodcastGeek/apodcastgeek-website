# Firecrawl MCP

Wired up in `/.mcp.json` at the repo root. Gives Claude Code `firecrawl_scrape`,
`firecrawl_extract`, `firecrawl_crawl`, `firecrawl_map` and `firecrawl_search`
for pulling brand and prospect data at low token cost.

## Supply the API key

The config reads `${FIRECRAWL_API_KEY}` from the environment, so **no key is ever
committed**. Get one at [firecrawl.dev](https://firecrawl.dev), then:

```bash
# add to ~/.zshrc or ~/.bashrc, NOT to any file in this repo
export FIRECRAWL_API_KEY="fc-..."
```

Restart Claude Code. Without the variable set, the server still starts but every
call returns an auth error.

## Why this and not the one-click connector

The Firecrawl connector in claude.ai settings is a *research* connector — it
exposes `firecrawl_search` and paper/GitHub search only. The scrape/crawl/extract
endpoints, which is what brand extraction needs, come from this MCP server.

## Cost

Free tier is 500 credits/month. Scrape, crawl and map are 1 credit per page;
search is 2 per 10 results. `firecrawl_extract` with an AI schema and stealth mode
run up to 5 credits per request — that is the one that adds up, and it is also the
one most useful here, so prefer `firecrawl_scrape` when a page's markdown is enough
and save `extract` for when you genuinely need structured fields.

## Brand extraction

`brand-schema.json` is a starting schema for client and prospect onboarding. Use it
with `firecrawl_extract` against a company's homepage plus `/about`:

> Extract brand data from example.com using tools/firecrawl/brand-schema.json

Pair it with `/slopmonster` — pull a prospect's live copy, lint it, and the score
plus named tells make a concrete opening for a pitch.
