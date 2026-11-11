import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import express from "express";
import Database from "better-sqlite3";
import { createMinimaxClient, probeMedia } from "./minimax";
import { installPipeline } from "./pipeline";
import { wavDuration } from "./audio";

function wav(seconds: number) {
  const rate = 24000, length = Math.round(seconds * rate), data = Buffer.alloc(44 + length * 2);
  data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) data.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return `data:audio/wav;base64,${data.toString("base64")}`;
}
test("MiniMax refuses unsafe transport and never submits without approval", async () => {
  const old = process.env.MINIMAX_BASE_URL, enabled = process.env.MINIMAX_GENERATION_ENABLED;
  try {
    process.env.MINIMAX_BASE_URL = "http://public.example";
    assert.throws(() => createMinimaxClient(), /HTTPS origin/);
    process.env.MINIMAX_BASE_URL = "http://127.0.0.1:30011";
    process.env.MINIMAX_GENERATION_ENABLED = "false";
    await assert.rejects(createMinimaxClient().submit({}), /awaiting approval/);
  } finally {
    if (old === undefined) delete process.env.MINIMAX_BASE_URL; else process.env.MINIMAX_BASE_URL = old;
    if (enabled === undefined) delete process.env.MINIMAX_GENERATION_ENABLED; else process.env.MINIMAX_GENERATION_ENABLED = enabled;
  }
});

for (const [resolution, aspectRatio, nativeSize, expectedWidth, expectedHeight, shortEdge] of [
  ["720p", "16:9", "1344x768", 1280, 720, 768],
  ["480p", "16:9", "864x480", 854, 480, 480],
  ["480p", "9:16", "480x864", 480, 854, 480],
] as const) test(`MiniMax ${resolution} ${aspectRatio} preserves source audio, resolution, recovery and submission safety`, async () => {
  const cwd = process.cwd(), directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-minimax-test-"));
  const previousFetch = globalThis.fetch;
  const names = ["MINIMAX_BASE_URL", "MINIMAX_GENERATION_ENABLED", "MINIMAX_HOURLY_USD", "MINIMAX_MAX_JOB_SECONDS", "DAILY_SPEND_CAP_USD", "MONTHLY_SPEND_CAP_USD", "RUNPOD_INFINITETALK_ENDPOINT", "RUNPOD_PVIDEO_ENDPOINT"];
  const old = Object.fromEntries(names.map(k => [k, process.env[k]]));
  Object.assign(process.env, { MINIMAX_BASE_URL: "https://minimax.test", MINIMAX_GENERATION_ENABLED: "true", MINIMAX_HOURLY_USD: "0.27", MINIMAX_MAX_JOB_SECONDS: "7200", DAILY_SPEND_CAP_USD: "5", MONTHLY_SPEND_CAP_USD: "10", RUNPOD_INFINITETALK_ENDPOINT: "", RUNPOD_PVIDEO_ENDPOINT: "" });
  const portrait = path.join(directory, "portrait.png"), native = path.join(directory, "native.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x320", "-frames:v", "1", "-threads", "1", portrait]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=blue:s=${nativeSize}:r=24`, "-f", "lavfi", "-i", "anullsrc=r=32000:cl=stereo", "-t", String(107 / 24), "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", native]);
  process.chdir(directory);
  let submissions = 0, cancellations = 0, complete = false, uncertain = false, invalidContent = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://minimax.test")) return previousFetch(input, init);
    if (url.endsWith("/health")) return Response.json({ status: "ok" });
    if (url.endsWith("/v1/videos") && init?.method === "POST") {
      submissions++;
      const b = JSON.parse(String(init.body));
      assert.equal(b.task, "ref2va"); assert.equal(b.target.short_edge, shortEdge);
      assert.equal(b.target.aspect_ratio, aspectRatio);
      assert.equal(b.target.duration_seconds, 4); assert.equal(b.num_inference_steps, 50);
      assert.equal(b.enhance_prompt, false); assert.equal(b.conditions[0].role, "reference");
      assert.match(b.conditions[0].uri, /^data:image\/png;base64,/);
      assert.equal(wavDuration(Buffer.from(b.conditions[1].uri.split(",")[1], "base64")), 4);
      assert.match(b.output_path, /^\/workspace\/minimax-h3-service\/outputs\/[\w-]+$/);
      if (uncertain) throw new Error("socket closed after submitting");
      return Response.json({ id: `h3-${submissions}`, status: "queued" });
    }
    if (init?.method === "DELETE") { cancellations++; return Response.json({ status: "deleted" }); }
    if (url.endsWith("/content")) return invalidContent ? new Response("<html>bad</html>", { headers: { "Content-Type": "text/html" } }) : new Response(fs.readFileSync(native), { headers: { "Content-Type": "video/mp4" } });
    return Response.json({ id: "h3-1", status: complete ? "completed" : "in_progress", progress: 37, inference_time_s: 1.2 });
  }) as typeof fetch;
  let app = express(); app.use(express.json({ limit: "30mb" }));
  let pipeline = installPipeline(app);
  let server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const address = server.address(); assert(address && typeof address !== "string");
  let base = `http://127.0.0.1:${address.port}`;
  const restart = async () => {
    await new Promise<void>(r => server.close(() => r())); pipeline.close();
    app = express(); app.use(express.json({ limit: "30mb" })); pipeline = installPipeline(app);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
    const address = server.address(); assert(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`;
    await new Promise(r => setTimeout(r, 50));
  };
  const input = { script: "Hello from the source voice.", avatarImageUrl: `data:image/png;base64,${fs.readFileSync(portrait).toString("base64")}`, audioUrl: wav(3), audioDuration: 100, aspectRatio, resolution };
  const post = (body: object) => fetch(base + "/api/veo/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const job = async (id: string) => (await fetch(base + "/api/veo/status/" + id)).json();
  try {
    const health = await (await fetch(base + "/api/minimax/health")).json();
    assert.equal(health.status, "ready"); assert.equal(health.generationEnabled, true); assert.equal(health.reservationUsd, 0.54);
    const started = await post(input); assert.equal(started.status, 202);
    const first = await started.json(); assert.equal(first.provider, "minimax-h3"); assert.equal(first.source.audioDuration, 3);
    assert.equal(first.source.resolution, resolution);
    assert.equal((await (await post(input)).json()).jobId, first.jobId); assert.equal(submissions, 1);
    assert.equal((await post({ ...input, resolution: "1080p" })).status, 400);
    assert.equal((await post({ ...input, resolution: ["480p"] })).status, 400);
    assert.equal((await post({ ...input, resolution: resolution === "480p" ? "720p" : "480p" })).status, 409, "a different resolution must not return the existing render");
    if (resolution === "480p") assert.equal((await (await post({ ...input, resolution: undefined })).json()).jobId, first.jobId, "480p is the API default");
    assert.equal((await post({ ...input, script: "A different concurrent job." })).status, 409);
    await pipeline.poll(); assert.equal((await job(first.jobId)).source.minimax.progress, 37);
    await restart();
    complete = true; await pipeline.poll();
    const finished = await job(first.jobId); assert.equal(finished.status, "completed"); assert.equal(submissions, 1);
    assert(finished.actual_cost_usd > 0 && finished.actual_cost_usd < 0.54);
    const delivered = path.join("data/renders", path.basename(finished.videoUrl));
    const metadata = await probeMedia(delivered);
    assert.equal(metadata.streams.find(s => s.codec_type === "video")?.width, expectedWidth);
    assert.equal(metadata.streams.find(s => s.codec_type === "video")?.height, expectedHeight);
    assert(Math.abs(Number(metadata.format.duration) - 3) < 0.1);
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", delivered, "-map", "0:a:0", "-f", "s16le", "-ac", "1", "-ar", "24000", "pipe:1"], { maxBuffer: 1024 * 1024 });
    let energy = 0; for (let i = 0; i < pcm.length; i += 2) energy += (pcm.readInt16LE(i) / 32768) ** 2;
    assert(Math.sqrt(energy / (pcm.length / 2)) > 0.1, "export must preserve the original voice, not the provider's silent audio");
    assert.equal((await (await post(input)).json()).status, "completed"); assert.equal(submissions, 1);
    assert.equal((await post({ ...input, audioUrl: wav(16), audioDuration: 1 })).status, 400); assert.equal(submissions, 1);
    uncertain = true;
    const unknownInput = { ...input, script: "An uncertain submission." };
    const unknown = await (await post(unknownInput)).json(); assert.equal(unknown.status, "submission_unknown"); assert.equal(submissions, 2);
    assert.equal((await post({ ...unknownInput, forceRegenerate: true })).status, 409);
    await restart();
    assert.equal((await job(unknown.jobId)).status, "submission_unknown"); assert.equal(submissions, 2);
    // Operator reconciliation is simulated only in this isolated test database.
    const db = new Database("data/db/studio.db"); db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(unknown.jobId);
    uncertain = false; complete = false;
    const timed = await (await post({ ...input, script: "A render with a time limit." })).json();
    const row = db.prepare("SELECT source FROM job_sources WHERE job_id=?").get(timed.jobId) as { source: string };
    const source = JSON.parse(row.source); source.minimax.submittedAt = Date.now() - 7201 * 1000;
    db.prepare("UPDATE job_sources SET source=? WHERE job_id=?").run(JSON.stringify(source), timed.jobId);
    await pipeline.poll(); assert.equal((await job(timed.jobId)).status, "failed"); assert.equal(cancellations, 1); assert.equal(submissions, 3);
    complete = true; invalidContent = true;
    const bad = await (await post({ ...input, script: "Invalid provider media." })).json();
    await pipeline.poll(); assert.equal((await job(bad.jobId)).status, "failed"); assert.equal(submissions, 4);
    complete = false; invalidContent = false;
    const manual = await (await post({ ...input, script: "A render cancelled by its user." })).json();
    const cancellation = await fetch(base + "/api/veo/cancel/" + manual.jobId, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal((await cancellation.json()).status, "cancelled"); assert.equal(cancellations, 2); assert.equal(submissions, 5);
    await pipeline.poll(); assert.equal((await job(manual.jobId)).status, "cancelled");
    // Jobs saved before resolution support keep their original 720p export after a restart.
    if (resolution === "720p") {
      const legacy = await (await post({ ...input, script: "A legacy saved render." })).json();
      const row = db.prepare("SELECT source FROM job_sources WHERE job_id=?").get(legacy.jobId) as { source: string };
      const source = JSON.parse(row.source); delete source.resolution;
      db.prepare("UPDATE job_sources SET source=? WHERE job_id=?").run(JSON.stringify(source), legacy.jobId);
      await restart(); complete = true; await pipeline.poll();
      assert.equal((await job(legacy.jobId)).status, "completed");
    }
    db.close();
  } finally {
    pipeline.close(); await new Promise<void>(r => server.close(() => r()));
    globalThis.fetch = previousFetch; process.chdir(cwd);
    for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
