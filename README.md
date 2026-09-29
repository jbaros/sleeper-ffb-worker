# Sleeper Fantasy MCP for Cloudflare Workers

A stateless remote MCP server that gives ChatGPT read-only access to Sleeper fantasy-football data.

## Included tools — v1.2.0

- `get_league_overview` — settings, owners, rosters, standings, and current NFL state
- `get_weekly_debrief` — matchups, scores, starters, bench, player points, transactions, standings, and player metadata
- `get_league_injuries` — roster-aware injury/availability report with starter/reserve and depth-chart context
- `get_trending_players` — Sleeper-wide adds/drops with optional league ownership and free-agent availability
- `get_league_history` — automatically follows `previous_league_id` through prior seasons
- `get_playoff_picture` — current standings plus winners/losers playoff brackets with team names
- `get_traded_picks` — current/future traded draft picks with ownership mapping
- `get_rivalry_history` — head-to-head history; can automatically traverse prior linked league seasons
- `get_league_drafts` — league drafts and completed picks
- `get_user_leagues` — NFL leagues for a Sleeper user and season

The server uses Sleeper's public, read-only API. Sleeper does not require an API token for these endpoints.

## v1.2.0 additions

### Trending players

`get_trending_players` can return adds, drops, or both for a configurable lookback window. Supplying a `league_id` joins the trending results against that league's rosters so the response indicates whether the player is already rostered, which fantasy team owns them, and whether they are a starter/reserve.

Example arguments:

```json
{
  "league_id": "1377766689973739520",
  "type": "both",
  "lookback_hours": 24,
  "limit": 25
}
```

### Richer injury/player data

Player metadata now preserves additional Sleeper fields when available:

- `active`
- `fantasy_positions`
- `depth_chart_position`
- `depth_chart_order`
- `years_exp`
- `age`
- `news_updated`
- injury status/body part/start date/notes
- practice participation/description

This lets an injury report distinguish a starting skill player from a depth player instead of treating every injury equally.

### Automatic league history

`get_league_history` starts with the current league and follows Sleeper's `previous_league_id` chain. It can include standings for each season.

`get_rivalry_history` now supports either:

- `league_id` — automatically discover prior linked seasons, or
- `league_ids` — explicitly provide the seasons to compare

Example:

```json
{
  "league_id": "1377766689973739520",
  "max_seasons": 10
}
```

### Playoff brackets

`get_playoff_picture` combines standings with Sleeper's winners and losers bracket endpoints and resolves roster IDs into fantasy team/owner names.

### Traded picks

`get_traded_picks` returns Sleeper's league-level traded-pick data, including future picks, and resolves original, previous, and current roster ownership.

## Deploy

1. Install Node.js 18 or later.
2. Clone/open this repository.
3. Run `npm install`.
4. Run `npm test`.
5. Run `npx wrangler login` and authorize your Cloudflare account if needed.
6. Run `npm run deploy`.

The Worker URL will look like:

`https://sleeper-fantasy-mcp.<account>.workers.dev`

Your MCP URL is:

`https://sleeper-fantasy-mcp.<account>.workers.dev/mcp`

The health check is:

`https://sleeper-fantasy-mcp.<account>.workers.dev/health`

and should report version `1.2.0`.

## Updating an existing checkout

If you already cloned the repository:

```bash
git pull
npm install
npm test
npm run deploy
```

## Connect it to ChatGPT

After deploying, refresh or reconnect the custom MCP/plugin connection if ChatGPT still shows an older tool list. Version 1.2.0 advertises **10 read-only tools**.

## Optional access key

The Worker can run without authentication because the underlying Sleeper API is public and read-only. If you set a Wrangler secret named `MCP_API_KEY`, requests must provide it as a bearer token. Do not enable this unless your MCP client is configured to send that header.

## Local checks

- `npm test` runs protocol and authorization tests without contacting Sleeper.
- `npm run dev` starts the Worker locally through Wrangler.

Sleeper asks integrations to remain below 1,000 API calls per minute. The Worker batches related requests where practical and caches the large NFL player catalog per Worker isolate for up to 24 hours.
