# Sleeper Fantasy MCP for Cloudflare Workers

A stateless remote MCP server that gives ChatGPT Work read-only access to Sleeper fantasy-football data.

## Included tools

- `get_league_overview`
- `get_weekly_debrief`
- `get_league_injuries` — roster-aware injury/status report with starter/reserve flags
- `get_rivalry_history`
- `get_league_drafts`
- `get_user_leagues`

The server uses Sleeper's public, read-only API. It does not need your Sleeper password or an API token.

## Deploy

1. Install Node.js 18 or later.
2. Extract this project and open a terminal in its directory.
3. Run `npm install`.
4. Run `npx wrangler login` and authorize your Cloudflare account.
5. Run `npm run deploy`.
6. Copy the resulting `https://sleeper-fantasy-mcp.<account>.workers.dev` URL.

Your MCP URL will be:

`https://sleeper-fantasy-mcp.<account>.workers.dev/mcp`

## Connect it to ChatGPT Work

1. In ChatGPT, open **Settings → Security and login** and enable **Developer mode**.
2. Open **Plugins**, select **Create** (or the plus button), and enter a name such as **Sleeper Fantasy**.
3. Choose a public MCP connection and enter the complete Worker URL ending in `/mcp`.
4. Review the six discovered read-only tools and create the connection.
5. Start a new Work conversation and enable **Sleeper Fantasy** from the tools menu.

Example prompt:

> Create a funny Week 1 debrief for league 1377766689973739520. Compare league 1255993192340279296 for rivalry history. Include awards, bench mistakes, upsets, and friendly slander.

## Optional access key

The Worker is safe to run without authentication because it only reads public Sleeper data. If you set a Wrangler secret named `MCP_API_KEY`, requests must provide it as a bearer token. Do not enable this unless your MCP client supports configuring that header.

## Local checks

- `npm test` runs protocol and authorization tests without contacting Sleeper.
- `npm run dev` starts the Worker locally through Wrangler.

Sleeper asks integrations to remain below 1,000 API calls per minute. The tools batch related calls and resolve the player catalog at most once per Worker isolate every 24 hours.

## Injury/status data

`get_league_injuries` joins the league rosters to Sleeper's `/players/nfl` catalog and returns current rostered-player availability metadata. By default it returns only players with a potential concern; pass `include_healthy: true` to include every rostered player. Fields include Sleeper's `injury_status`, body part, start date, notes, practice participation/description when present, overall player status, and whether the player is currently a starter or reserve.

Sleeper's player catalog is cached per Worker isolate for up to 24 hours, matching Sleeper's guidance to fetch the large player dataset sparingly. Practice fields can be sparse, so the tool preserves them when available but does not depend on them.
