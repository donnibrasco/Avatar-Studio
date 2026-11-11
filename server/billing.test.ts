import { test } from "node:test";
import assert from "node:assert/strict";
import { createBillingGuard } from "./billing";

test("billing admission fails closed on stale reads and distinguishes missing records from free usage", async () => {
  const originalFetch = globalThis.fetch;
  const oldEnabled = process.env.RUNPOD_BILLING_GUARD_ENABLED, oldKey = process.env.RUNPOD_API_KEY;
  process.env.RUNPOD_BILLING_GUARD_ENABLED = "true"; process.env.RUNPOD_API_KEY = "test-private-key";
  let time = Date.UTC(2026, 10, 10, 12), records = 0, fail = false, reads = 0;
  globalThis.fetch = (async (input, init) => {
    reads++;
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-private-key");
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.runpod.io"); assert.equal(url.pathname, "/v2/billing");
    if (fail) return Response.json({}, { status: 503 });
    return Response.json({ metadata: { recordCount: records, totals: { totalAmount: records ? (url.searchParams.get("bucketSize") === "day" ? 0.9 : 3.4) : 0 } } });
  }) as typeof fetch;
  try {
    const guard = createBillingGuard({ now: () => time });
    assert.throws(() => guard.admission(), /unavailable or stale/);
    await Promise.all([guard.refresh(), guard.refresh()]); assert.equal(reads, 2, "concurrent refreshes share the same two reads");
    assert.equal(guard.summary().snapshot?.status, "pending");
    assert.equal(guard.summary().snapshot?.dayBilledUsd, null);
    assert.deepEqual(guard.admission(), { day: 0, month: 0 });
    records = 1; await guard.refresh();
    assert.deepEqual(guard.admission(), { day: 0.9, month: 3.4 });
    time += 11 * 60 * 1000; fail = true;
    await assert.rejects(guard.refresh(), /billing check failed/);
    assert.throws(() => guard.admission(), /unavailable or stale/);
    fail = false; await guard.refresh();
    time += 24 * 60 * 60 * 1000;
    assert.throws(() => guard.admission(), /unavailable or stale/, "UTC rollover invalidates the previous snapshot");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldEnabled === undefined) delete process.env.RUNPOD_BILLING_GUARD_ENABLED; else process.env.RUNPOD_BILLING_GUARD_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.RUNPOD_API_KEY; else process.env.RUNPOD_API_KEY = oldKey;
  }
});
