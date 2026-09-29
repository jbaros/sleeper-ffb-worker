const API = "https://api.sleeper.app/v1";
const SERVER = { name: "sleeper-fantasy", version: "1.1.0" };
let playerCache = { fetchedAt: 0, data: null };

export const toolDefinitions = [
  {
    name: "get_league_overview",
    description: "Get a Sleeper league's settings, owners, rosters, standings, and current NFL state. Use first to validate a league ID.",
    inputSchema: objectSchema({ league_id: idSchema("Sleeper league ID") }, ["league_id"]),
    annotations: readOnlyAnnotations()
  },
  {
    name: "get_weekly_debrief",
    description: "Get analysis-ready weekly data: paired matchups, team names, scores, starters, bench, player points, transactions, standings, and player metadata.",
    inputSchema: objectSchema({
      league_id: idSchema("Sleeper league ID"),
      week: { type: "integer", minimum: 1, maximum: 25 },
      include_players: { type: "boolean", default: true, description: "Resolve player IDs to names and positions" }
    }, ["league_id", "week"]),
    annotations: readOnlyAnnotations()
  },
  {
    name: "get_league_injuries",
    description: "Get current Sleeper injury and availability metadata for every rostered player in a league, including questionable/doubtful/out designations, IR/PUP-style status, injury details, practice fields when Sleeper provides them, and whether the player is a starter or reserve.",
    inputSchema: objectSchema({
      league_id: idSchema("Sleeper league ID"),
      include_healthy: { type: "boolean", default: false, description: "Include healthy/active rostered players too" }
    }, ["league_id"]),
    annotations: readOnlyAnnotations()
  },
  {
    name: "get_rivalry_history",
    description: "Calculate head-to-head history between stable Sleeper user IDs across league seasons for rivalry recaps and all-time records.",
    inputSchema: objectSchema({
      league_ids: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" }, description: "League IDs, usually newest to oldest" },
      regular_season_weeks: { type: "integer", minimum: 1, maximum: 18, description: "Optional weeks per league; otherwise inferred from playoff settings" }
    }, ["league_ids"]),
    annotations: readOnlyAnnotations()
  },
  {
    name: "get_league_drafts",
    description: "Get a league's drafts and every completed pick, including player metadata provided by Sleeper.",
    inputSchema: objectSchema({ league_id: idSchema("Sleeper league ID") }, ["league_id"]),
    annotations: readOnlyAnnotations()
  },
  {
    name: "get_user_leagues",
    description: "Resolve a Sleeper username or user ID and list that user's NFL leagues for a season.",
    inputSchema: objectSchema({
      username_or_user_id: { type: "string", description: "Sleeper username or user ID" },
      season: { type: "string", pattern: "^[0-9]{4}$" }
    }, ["username_or_user_id", "season"]),
    annotations: readOnlyAnnotations()
  }
];

function objectSchema(properties, required) {
  return { type: "object", properties, required, additionalProperties: false };
}

function idSchema(description) {
  return { type: "string", pattern: "^[A-Za-z0-9_-]+$", description };
}

function readOnlyAnnotations() {
  return { title: "Read Sleeper data", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
}

function cleanId(value, label = "ID") {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`${label} contains invalid characters`);
  return id;
}

async function sleeper(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { "User-Agent": "sleeper-fantasy-mcp/1.1" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Sleeper API returned ${response.status} for ${path}`);
  return response.json();
}

function ownersFor(users, rosters) {
  const usersById = Object.fromEntries(users.map((u) => [u.user_id, u]));
  return Object.fromEntries(rosters.map((r) => {
    const user = usersById[r.owner_id] || {};
    return [r.roster_id, {
      roster_id: r.roster_id,
      user_id: r.owner_id,
      display_name: user.display_name || user.username || `Roster ${r.roster_id}`,
      username: user.username || null,
      team_name: user.metadata?.team_name || user.display_name || user.username || `Roster ${r.roster_id}`
    }];
  }));
}

function decimalPoints(settings, field) {
  return Number(settings?.[field] || 0) + Number(settings?.[`${field}_decimal`] || 0) / 100;
}

function buildStandings(rosters, owners) {
  return rosters.map((r) => ({
    ...owners[r.roster_id],
    wins: r.settings?.wins || 0,
    losses: r.settings?.losses || 0,
    ties: r.settings?.ties || 0,
    points_for: decimalPoints(r.settings, "fpts"),
    points_against: decimalPoints(r.settings, "fpts_against"),
    waiver_position: r.settings?.waiver_position ?? null,
    waiver_budget_used: r.settings?.waiver_budget_used ?? null
  })).sort((a, b) => b.wins - a.wins || b.points_for - a.points_for);
}

async function getPlayerCatalog() {
  if (!playerCache.data || Date.now() - playerCache.fetchedAt > 24 * 60 * 60 * 1000) {
    playerCache = { data: await sleeper("/players/nfl"), fetchedAt: Date.now() };
  }
  return playerCache;
}

function playerMetadata(player) {
  return {
    full_name: player.full_name || `${player.first_name || ""} ${player.last_name || ""}`.trim(),
    position: player.position || null,
    team: player.team || null,
    status: player.status || null,
    injury_status: player.injury_status || null,
    injury_body_part: player.injury_body_part || null,
    injury_start_date: player.injury_start_date || null,
    injury_notes: player.injury_notes || null,
    practice_participation: player.practice_participation || null,
    practice_description: player.practice_description || null
  };
}

function isPlayerConcern(player) {
  const status = String(player.status || "").toLowerCase();
  const practice = String(player.practice_participation || "").toLowerCase();
  return Boolean(
    player.injury_status ||
    player.injury_body_part ||
    player.injury_notes ||
    player.injury_start_date ||
    (player.practice_participation && !["full", "fp"].includes(practice)) ||
    (status && status !== "active")
  );
}

async function resolvePlayers(ids) {
  const catalog = await getPlayerCatalog();
  const result = {};
  for (const id of ids) {
    const player = catalog.data[id];
    if (player) {
      result[id] = playerMetadata(player);
    } else if (/^[A-Z]{2,3}$/.test(id)) {
      result[id] = { full_name: `${id} Defense`, position: "DEF", team: id };
    }
  }
  return result;
}

async function leagueOverview(leagueId) {
  const id = cleanId(leagueId, "league_id");
  const [league, users, rosters, nflState] = await Promise.all([
    sleeper(`/league/${id}`), sleeper(`/league/${id}/users`),
    sleeper(`/league/${id}/rosters`), sleeper("/state/nfl")
  ]);
  const owners = ownersFor(users, rosters);
  return { league, owners, standings: buildStandings(rosters, owners), rosters, nfl_state: nflState };
}

async function leagueInjuries({ league_id, include_healthy = false }) {
  const id = cleanId(league_id, "league_id");
  const [league, users, rosters, catalog] = await Promise.all([
    sleeper(`/league/${id}`),
    sleeper(`/league/${id}/users`),
    sleeper(`/league/${id}/rosters`),
    getPlayerCatalog()
  ]);
  const owners = ownersFor(users, rosters);
  const starterSlots = (league.roster_positions || []).filter((slot) => slot !== "BN");
  const players = [];

  for (const roster of rosters) {
    const starters = roster.starters || [];
    const reserves = new Set(roster.reserve || []);
    for (const playerId of roster.players || []) {
      const player = catalog.data[playerId];
      if (!player) continue;
      const concern = isPlayerConcern(player);
      if (!include_healthy && !concern) continue;

      const starterIndex = starters.indexOf(playerId);
      players.push({
        player_id: playerId,
        roster_id: roster.roster_id,
        owner: owners[roster.roster_id]?.display_name || null,
        fantasy_team: owners[roster.roster_id]?.team_name || null,
        ...playerMetadata(player),
        is_starter: starterIndex >= 0,
        starter_slot: starterIndex >= 0 ? (starterSlots[starterIndex] || null) : null,
        is_reserve: reserves.has(playerId),
        is_concern: concern
      });
    }
  }

  const designationOrder = { Out: 0, IR: 1, PUP: 2, Doubtful: 3, Questionable: 4 };
  players.sort((a, b) =>
    Number(b.is_starter) - Number(a.is_starter) ||
    (designationOrder[a.injury_status] ?? 99) - (designationOrder[b.injury_status] ?? 99) ||
    a.roster_id - b.roster_id ||
    a.full_name.localeCompare(b.full_name)
  );

  return {
    league: { league_id: league.league_id, name: league.name, season: league.season },
    player_data_fetched_at: new Date(catalog.fetchedAt).toISOString(),
    include_healthy,
    summary: {
      rostered_players_checked: rosters.reduce((sum, roster) => sum + (roster.players?.length || 0), 0),
      players_returned: players.length,
      starters_flagged: players.filter((player) => player.is_starter && player.is_concern).length,
      reserves_flagged: players.filter((player) => player.is_reserve && player.is_concern).length
    },
    players
  };
}

async function weeklyDebrief({ league_id, week, include_players = true }) {
  const id = cleanId(league_id, "league_id");
  const [league, users, rosters, rawMatchups, transactions] = await Promise.all([
    sleeper(`/league/${id}`), sleeper(`/league/${id}/users`),
    sleeper(`/league/${id}/rosters`), sleeper(`/league/${id}/matchups/${week}`),
    sleeper(`/league/${id}/transactions/${week}`)
  ]);
  const owners = ownersFor(users, rosters);
  const groups = new Map();
  for (const team of rawMatchups) {
    const key = team.matchup_id ?? `bye-${team.roster_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      ...owners[team.roster_id], points: team.points ?? 0, custom_points: team.custom_points,
      starters: team.starters || [], players: team.players || [], players_points: team.players_points || {}
    });
  }
  const matchups = [...groups.entries()].map(([matchup_id, teams]) => ({
    matchup_id,
    teams: teams.sort((a, b) => b.points - a.points),
    margin: teams.length === 2 ? Math.abs(Number(teams[0].points) - Number(teams[1].points)) : null
  }));
  const playerIds = new Set();
  for (const matchup of rawMatchups) {
    for (const id of matchup.players || []) playerIds.add(id);
    for (const id of Object.keys(matchup.players_points || {})) playerIds.add(id);
  }
  for (const transaction of transactions) {
    for (const id of Object.keys(transaction.adds || {})) playerIds.add(id);
    for (const id of Object.keys(transaction.drops || {})) playerIds.add(id);
  }
  return {
    league, week, owners, standings: buildStandings(rosters, owners), matchups, transactions,
    players: include_players ? await resolvePlayers(playerIds) : undefined
  };
}

async function rivalryHistory({ league_ids, regular_season_weeks }) {
  const records = {};
  const seasons = [];
  for (const rawLeagueId of league_ids) {
    const leagueId = cleanId(rawLeagueId, "league_id");
    const [league, users, rosters] = await Promise.all([
      sleeper(`/league/${leagueId}`), sleeper(`/league/${leagueId}/users`), sleeper(`/league/${leagueId}/rosters`)
    ]);
    const owners = ownersFor(users, rosters);
    const lastWeek = regular_season_weeks || Math.max(1, Math.min(18, Number(league.settings?.playoff_week_start || 15) - 1));
    const weeks = await Promise.all(Array.from({ length: lastWeek }, (_, i) => sleeper(`/league/${leagueId}/matchups/${i + 1}`)));
    weeks.forEach((weekMatchups, weekIndex) => {
      const paired = new Map();
      for (const matchup of weekMatchups) {
        if (matchup.matchup_id == null || !owners[matchup.roster_id]?.user_id) continue;
        if (!paired.has(matchup.matchup_id)) paired.set(matchup.matchup_id, []);
        paired.get(matchup.matchup_id).push(matchup);
      }
      for (const teams of paired.values()) {
        if (teams.length !== 2) continue;
        const teamA = owners[teams[0].roster_id];
        const teamB = owners[teams[1].roster_id];
        const key = [teamA.user_id, teamB.user_id].sort().join("::");
        if (!records[key]) {
          records[key] = {
            users: [teamA, teamB].sort((a, b) => a.user_id.localeCompare(b.user_id)),
            games: 0, wins: {}, points: {}, meetings: []
          };
        }
        const record = records[key];
        record.games += 1;
        for (const team of teams) {
          const userId = owners[team.roster_id].user_id;
          record.points[userId] = (record.points[userId] || 0) + Number(team.points || 0);
        }
        const firstPoints = Number(teams[0].points || 0);
        const secondPoints = Number(teams[1].points || 0);
        const winner = firstPoints === secondPoints
          ? "tie"
          : owners[(firstPoints > secondPoints ? teams[0] : teams[1]).roster_id].user_id;
        record.wins[winner] = (record.wins[winner] || 0) + 1;
        record.meetings.push({
          season: league.season, week: weekIndex + 1,
          scores: teams.map((team) => ({ user_id: owners[team.roster_id].user_id, points: team.points })), winner
        });
      }
    });
    seasons.push({ league_id: leagueId, name: league.name, season: league.season, weeks_checked: lastWeek });
  }
  return { seasons, rivalries: Object.values(records).sort((a, b) => b.games - a.games) };
}

export async function callTool(name, args = {}) {
  if (name === "get_league_overview") return leagueOverview(args.league_id);
  if (name === "get_weekly_debrief") return weeklyDebrief(args);
  if (name === "get_league_injuries") return leagueInjuries(args);
  if (name === "get_rivalry_history") return rivalryHistory(args);
  if (name === "get_league_drafts") {
    const leagueId = cleanId(args.league_id, "league_id");
    const drafts = await sleeper(`/league/${leagueId}/drafts`);
    return { drafts: await Promise.all(drafts.map(async (draft) => ({
      ...draft, picks: await sleeper(`/draft/${cleanId(draft.draft_id, "draft_id")}/picks`)
    }))) };
  }
  if (name === "get_user_leagues") {
    const user = await sleeper(`/user/${cleanId(args.username_or_user_id, "username_or_user_id")}`);
    if (!user?.user_id) throw new Error("Sleeper user not found");
    return { user, leagues: await sleeper(`/user/${cleanId(user.user_id, "user_id")}/leagues/nfl/${cleanId(args.season, "season")}`) };
  }
  throw new Error(`Unknown tool: ${name}`);
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

async function handleRpc(message) {
  if (message.method === "initialize") {
    return rpcResult(message.id, {
      protocolVersion: message.params?.protocolVersion || "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER
    });
  }
  if (message.method === "ping") return rpcResult(message.id, {});
  if (message.method === "tools/list") return rpcResult(message.id, { tools: toolDefinitions });
  if (message.method === "tools/call") {
    try {
      const value = await callTool(message.params?.name, message.params?.arguments || {});
      return rpcResult(message.id, {
        content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false
      });
    } catch (error) {
      return rpcResult(message.id, {
        content: [{ type: "text", text: `Sleeper request failed: ${error.message}` }], isError: true
      });
    }
  }
  if (message.method?.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: `Method not found: ${message.method}` } };
}

function jsonResponse(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return jsonResponse(null, 204);
    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({ ok: true, service: SERVER.name, version: SERVER.version, mcp_endpoint: "/mcp" });
    }
    if (url.pathname !== "/mcp") return jsonResponse({ error: "Not found" }, 404);
    if (env.MCP_API_KEY && request.headers.get("Authorization") !== `Bearer ${env.MCP_API_KEY}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (request.method === "GET") return jsonResponse({ error: "Use POST for stateless Streamable HTTP MCP" }, 405);
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }
    if (Array.isArray(payload)) {
      const replies = (await Promise.all(payload.map(handleRpc))).filter(Boolean);
      return replies.length ? jsonResponse(replies) : jsonResponse(null, 202);
    }
    const reply = await handleRpc(payload);
    return reply ? jsonResponse(reply) : jsonResponse(null, 202);
  }
};
