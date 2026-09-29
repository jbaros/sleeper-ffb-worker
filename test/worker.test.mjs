import test from "node:test";
import assert from "node:assert/strict";
import worker, { toolDefinitions } from "../src/index.js";

test("health endpoint responds", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mcp_endpoint, "/mcp");
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

test("MCP advertises six read-only tools", async () => {
  const request = new Request("https://example.test/mcp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  const response = await worker.fetch(request, {});
  const payload = await response.json();
  assert.equal(payload.result.tools.length, 6);
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_league_injuries"), true);
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
