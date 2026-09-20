import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithGatewayRecovery } from "../src/gateway-recovery.mjs";
const refusal = () => Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });

test("waits for readiness and delivers the same request once after refusal", async () => {
  let calls = 0, probes = 0;
  const init = { body: "same bytes", method: "POST" };
  const result = await fetchWithGatewayRecovery("http://127.0.0.1:1/v1/responses", init, {
    budgetMs: 1000, pollMs: 1, log() {},
    probeFetch: async () => new Response("", { status: ++probes < 3 ? 503 : 200 }),
    fetchImpl: async (_, actual) => { assert.equal(actual, init); if (++calls === 1) throw refusal(); return new Response("ok"); },
  });
  assert.equal(await result.text(), "ok"); assert.equal(calls, 2); assert.equal(probes, 3);
});

test("does not replay resets, HTTP errors, or response streams", async () => {
  for (const code of ["ECONNRESET", "UND_ERR_SOCKET"]) {
    let calls = 0;
    await assert.rejects(fetchWithGatewayRecovery("unused", {}, { fetchImpl: async () => { calls++; throw Object.assign(new Error(code), { code }); } }), new RegExp(code));
    assert.equal(calls, 1);
  }
  for (const status of [200, 429, 500, 502, 503]) {
    let calls = 0;
    const result = await fetchWithGatewayRecovery("unused", {}, { fetchImpl: async () => { calls++; return new Response("partial", { status }); } });
    assert.equal(result.status, status); assert.equal(calls, 1);
  }
});

test("unavailability has a deadline and cancellation stops the readiness wait", async () => {
  let calls = 0;
  const options = { budgetMs: 20, pollMs: 1, log() {}, fetchImpl: async () => { calls++; throw refusal(); }, probeFetch: async () => new Response("", { status: 503 }) };
  await assert.rejects(fetchWithGatewayRecovery("unused", {}, options), /fetch failed/);
  assert.equal(calls, 1);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5);
  try { await assert.rejects(fetchWithGatewayRecovery("unused", { signal: controller.signal }, { ...options, budgetMs: 1000 }), { name: "AbortError" }); }
  finally { clearTimeout(timer); }
});
