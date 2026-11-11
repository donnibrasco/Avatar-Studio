import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import Database from "better-sqlite3";
import { installPipeline } from "./pipeline";

test("concurrent speech previews share a queued job and an ambiguous submission survives restart without replay", async () => {
  const cwd = process.cwd(), temporary = fs.mkdtempSync(path.join(os.tmpdir(), "studio-speech-safety-"));
  const keys = ["RUNPOD_API_KEY", "RUNPOD_CHATTERBOX_ENDPOINT", "RUNPOD_BILLING_GUARD_ENABLED"];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]])), originalFetch = globalThis.fetch;
  Object.assign(process.env, { RUNPOD_API_KEY: "test-key", RUNPOD_CHATTERBOX_ENDPOINT: "test-speech", RUNPOD_BILLING_GUARD_ENABLED: "false" });
  process.chdir(temporary);
  let submissions = 0;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.runpod.ai/")) return originalFetch(input, init);
    if (url.endsWith("/run")) {
      submissions++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.policy.executionTimeout, 120000);
      if (body.input.text === "uncertain") throw new Error("Connection lost after provider accepted request");
      await new Promise(r => setTimeout(r, 50));
      return Response.json({ id: "provider-speech", status: "IN_QUEUE" });
    }
    if (url.includes("/status/")) return Response.json({ status: "IN_PROGRESS" });
    throw new Error("Unexpected provider request");
  }) as typeof fetch;
  const start = async () => {
    const app = express(); app.use(express.json()); const pipeline = installPipeline(app);
    const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
    const address = server.address(); assert(address && typeof address !== "string");
    return { pipeline, server, base: `http://127.0.0.1:${address.port}` };
  };
  let running = await start();
  const stop = async () => { await new Promise<void>(r => running.server.close(() => r())); running.pipeline.close(); };
  const preview = (text: string) => fetch(running.base + "/api/tts/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: "brian" }) });
  try {
    const responses = await Promise.all([preview("queued"), preview("queued")]);
    assert(responses.every(r => r.status === 202));
    const jobs = await Promise.all(responses.map(r => r.json()));
    assert.equal(jobs[0].jobId, jobs[1].jobId); assert.equal(submissions, 1);
    assert(!jobs[1].audioUrl, "a pending preview must not claim a nonexistent cached audio file");
    assert.equal((await preview("uncertain")).status, 409); assert.equal(submissions, 2);
    let db = new Database("data/db/studio.db", { readonly: true });
    const unknown = db.prepare("SELECT * FROM jobs WHERE status='submission_unknown'").get() as { id: string; est_cost_usd: number };
    assert(unknown); assert(unknown.est_cost_usd > 0); db.close();
    await stop(); running = await start();
    assert.equal((await preview("uncertain")).status, 409); assert.equal(submissions, 2);
    db = new Database("data/db/studio.db", { readonly: true });
    assert.equal((db.prepare("SELECT status FROM jobs WHERE id=?").get(unknown.id) as { status: string }).status, "submission_unknown"); db.close();
  } finally {
    await stop(); globalThis.fetch = originalFetch; process.chdir(cwd);
    for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
