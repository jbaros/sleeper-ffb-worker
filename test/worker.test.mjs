import test from "node:test";
import assert from "node:assert/strict";
import worker, { completedRegularSeasonWeeks, toolDefinitions } from "../src/index.js";

test("health endpoint responds", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), {});
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.mcp_endpoint, "/mcp");
  assert.equal(health.version, "1.2.1");
});

test("MCP initialize succeeds", async () => {
  const request = new Request("https://example.test/mcp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })
  });
  const response = await worker.fetch(request, {});
  const payload = await response.json();
  assert.equal(payload.result.serverInfo.name, "sleeper-fantasy");
  assert.equal(payload.result.protocolVersion, "2025-03-26");
});

test("MCP advertises ten read-only tools", async () => {
  const request = new Request("https://example.test/mcp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  const response = await worker.fetch(request, {});
  const payload = await response.json();
  assert.equal(payload.result.tools.length, 10);
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_league_injuries"), true);
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_trending_players"), true);
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_league_history"), true);
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_playoff_picture"), true);
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_traded_picks"), true);
  assert.equal(toolDefinitions.every((tool) => tool.annotations.readOnlyHint), true);
});

test("optional bearer secret is enforced", async () => {
  const request = new Request("https://example.test/mcp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  const response = await worker.fetch(request, { MCP_API_KEY: "secret" });
  assert.equal(response.status, 401);
});


test("rivalry history excludes future scheduled weeks", () => {
  const currentLeague = {
    status: "in_season",
    settings: { playoff_week_start: 15, last_scored_leg: 3 }
  };
  assert.equal(completedRegularSeasonWeeks(currentLeague), 3);
  assert.equal(completedRegularSeasonWeeks(currentLeague, 14), 3);
});

test("completed leagues keep their full regular season history", () => {
  const completedLeague = {
    status: "complete",
    settings: { playoff_week_start: 15, last_scored_leg: 17 }
  };
  assert.equal(completedRegularSeasonWeeks(completedLeague), 14);
  assert.equal(completedRegularSeasonWeeks(completedLeague, 12), 12);
});

test("preseason leagues do not invent completed rivalry games", () => {
  const preseasonLeague = {
    status: "pre_draft",
    settings: { playoff_week_start: 15 }
  };
  assert.equal(completedRegularSeasonWeeks(preseasonLeague), 0);
});
