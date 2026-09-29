import test from "node:test";
import assert from "node:assert/strict";
import worker, { toolDefinitions } from "../src/index.js";

test("health endpoint responds", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), {});
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.mcp_endpoint, "/mcp");
  assert.equal(health.version, "1.2.0");
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
