# Sleeper Fantasy MCP

A lightweight, read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for [Sleeper](https://sleeper.com/) fantasy football data, designed for AI clients such as ChatGPT and deployable on Cloudflare Workers.

Use it to build weekly league recaps, inspect injuries, analyze waiver trends, explore historical rivalries, review playoff brackets, track traded picks, and more — without running a database or storing Sleeper credentials.

[![Test](https://github.com/jbaros/sleeper-ffb-worker/actions/workflows/test.yml/badge.svg)](https://github.com/jbaros/sleeper-ffb-worker/actions/workflows/test.yml)

## Features

- **Read-only by design** — no roster, lineup, waiver, or league mutations.
- **No Sleeper API key required** — uses Sleeper's public read-only API.
- **Cloudflare Workers** — small, stateless deployment with no database required.
- **League-aware player context** — joins Sleeper player data against league rosters.
- **Historical league traversal** — can follow Sleeper's `previous_league_id` chain automatically.
- **MCP-native tools** — structured data intended for use by AI clients rather than scraping webpages.
- **Optional bearer-token protection** — enable `MCP_API_KEY` if your MCP client supports custom authorization headers.

## Available MCP tools

| Tool | Purpose |
| --- | --- |
| `get_league_overview` | League settings, owners, rosters, standings, and current NFL state |
| `get_weekly_debrief` | Matchups, scores, starters, bench players, player points, transactions, standings, and player metadata |
| `get_league_injuries` | Roster-aware injury and availability data with starter, reserve, practice, and depth-chart context |
| `get_trending_players` | Sleeper-wide adds/drops with optional league ownership and free-agent availability |
| `get_league_history` | Traverse linked prior seasons using `previous_league_id` |
| `get_rivalry_history` | Historical head-to-head records across one or more league seasons |
| `get_playoff_picture` | Current standings plus winners and losers playoff brackets |
| `get_traded_picks` | Current and future traded draft picks with ownership mapping |
| `get_league_drafts` | League drafts and completed draft picks |
| `get_user_leagues` | NFL leagues for a Sleeper user and season |

## Quick start

### Requirements

- Node.js 18 or newer
- npm
- A Cloudflare account
- An MCP client that supports a remote HTTP MCP server

Clone the repository:

```bash
git clone https://github.com/jbaros/sleeper-ffb-worker.git
cd sleeper-ffb-worker
```

Install dependencies and run the tests:

```bash
npm install
npm test
```

Authenticate Wrangler with Cloudflare:

```bash
npx wrangler login
```

Deploy:

```bash
npm run deploy
```

Wrangler will return a Worker URL similar to:

```text
https://sleeper-fantasy-mcp.<your-subdomain>.workers.dev
```

The MCP endpoint is:

```text
https://sleeper-fantasy-mcp.<your-subdomain>.workers.dev/mcp
```

The health endpoint is:

```text
https://sleeper-fantasy-mcp.<your-subdomain>.workers.dev/health
```

For v1.2.0, the health response should include:

```json
{
  "ok": true,
  "service": "sleeper-fantasy",
  "version": "1.2.0",
  "mcp_endpoint": "/mcp"
}
```

## Connect an MCP client

Configure your MCP client with the deployed Worker URL ending in `/mcp`.

For clients such as ChatGPT that support custom remote MCP connections, add the Worker as a new MCP/plugin connection and review the discovered tools before enabling it.

If you deploy a new version and your client still shows an older tool list, refresh or reconnect the MCP connection so the client rediscovers the server schema.

## Example prompts

Replace `<LEAGUE_ID>` with your Sleeper league ID.

### Weekly recap

```text
Give me a Week 4 recap for league <LEAGUE_ID>. Include the closest matchup,
biggest blowout, bench mistakes, transactions, major injuries, and some
friendly trash talk.
```

### Injury report

```text
Give me an injury report for league <LEAGUE_ID>. Prioritize starters,
questionable/doubtful/out players, reserve-list players, and important
depth-chart context.
```

### Waiver / trending players

```text
Show the most-added and most-dropped players over the last 24 hours and tell
me which of them are still free agents in league <LEAGUE_ID>.
```

### League history and rivalries

```text
Build an all-time rivalry report for league <LEAGUE_ID> using its linked
previous seasons. Include head-to-head records and total points scored.
```

### Playoff picture

```text
Give me the current playoff picture for league <LEAGUE_ID> and explain the
current seeds and bracket matchups.
```

## Player and injury data

The Worker fetches Sleeper's NFL player catalog and preserves useful metadata when available, including:

- player name, team, and position
- fantasy positions
- active/status state
- depth-chart position and order
- age and years of experience
- injury status
- injury body part
- injury start date
- injury notes
- practice participation/description
- Sleeper's `news_updated` timestamp

`get_league_injuries` joins this data against the league roster and reports whether a player is currently a starter or reserve.

Sleeper does not populate every field for every player, and practice/injury metadata may be sparse or change during the week. Consumers should treat missing fields as unavailable rather than as confirmation that a player is healthy.

## Trending players

`get_trending_players` supports:

- `add`
- `drop`
- `both`

It also accepts a configurable lookback window and result limit.

Supplying a `league_id` enriches each trending result with league-specific information such as:

- whether the player is already rostered
- whether the player is available
- fantasy team / owner
- starter status
- reserve status

Example tool arguments:

```json
{
  "league_id": "<LEAGUE_ID>",
  "type": "both",
  "lookback_hours": 24,
  "limit": 25
}
```

## League history

Sleeper links renewed leagues using `previous_league_id`.

`get_league_history` can follow that chain automatically, and `get_rivalry_history` can use the same approach to build multi-season head-to-head records.

Example:

```json
{
  "league_id": "<LEAGUE_ID>",
  "max_seasons": 10
}
```

You can also pass explicit league IDs to `get_rivalry_history` when you want complete control over which seasons are included.

## Playoff brackets

`get_playoff_picture` combines:

- current standings
- Sleeper winners bracket
- Sleeper losers bracket
- roster IDs resolved to owner/team names

Bracket data may be empty or incomplete before Sleeper generates the playoff bracket for the season.

## Traded draft picks

`get_traded_picks` returns Sleeper's league-level traded-pick records and resolves:

- original owner
- previous owner
- current owner
- season
- round

This is useful for dynasty, keeper, and draft-pick-trading leagues.

## Authentication

By default, the Worker does not require authentication. The underlying Sleeper endpoints used by this project are public and read-only.

If you want to protect your MCP endpoint, create a Wrangler secret:

```bash
npx wrangler secret put MCP_API_KEY
```

When `MCP_API_KEY` is configured, requests to `/mcp` must include:

```http
Authorization: Bearer <your-secret>
```

Only enable this if your MCP client supports sending the required authorization header.

Do **not** commit secrets, API keys, `.dev.vars`, or other credentials to the repository.

## Updating an existing deployment

From an existing checkout:

```bash
git pull
npm install
npm test
npm run deploy
```

If the MCP tool list changed, refresh or reconnect your MCP client after deploying.

## Development

Run the test suite:

```bash
npm test
```

Start a local Wrangler development server:

```bash
npm run dev
```

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

### Project layout

```text
.
├── .github/
│   └── workflows/
│       └── test.yml
├── src/
│   └── index.js
├── test/
│   └── worker.test.mjs
├── package.json
├── wrangler.jsonc
└── README.md
```

## API behavior and limitations

- The project is intentionally **read-only**.
- Sleeper's player catalog is large, so the Worker caches it per Worker isolate for up to 24 hours.
- Sleeper asks integrations to remain below 1,000 API calls per minute.
- Practice, injury, depth-chart, and news-related fields may be missing or delayed.
- Playoff bracket endpoints may not contain useful data until Sleeper creates the bracket.
- Historical traversal depends on leagues being linked through Sleeper's `previous_league_id`.
- This project does not scrape sports-news websites or attempt to replace official team/NFL reporting.

## Security and privacy

This Worker does not require Sleeper usernames, passwords, session cookies, or private Sleeper credentials.

League and player information returned by the Worker comes from Sleeper's public API. If you deploy the Worker without `MCP_API_KEY`, anyone who knows the Worker URL can call its read-only MCP tools.

If that is not appropriate for your deployment, enable `MCP_API_KEY` or place the Worker behind another access-control layer.

## License

See [LICENSE](LICENSE).

## Disclaimer

This is an unofficial community project and is not affiliated with, endorsed by, or sponsored by Sleeper.

Sleeper and related names and marks belong to their respective owners.
