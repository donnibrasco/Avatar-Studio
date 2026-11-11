import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import express from "express";
import Database from "better-sqlite3";
import { installPipeline } from "./pipeline";
import { probeMedia } from "./minimax";

test("MuseTalk caches movement, submits once, survives restart, preserves voice and quarantines uncertain submissions", async () => {
  const cwd = process.cwd(), directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-musetalk-test-"));
  const previousFetch = globalThis.fetch;
  const env = { RUNPOD_API_KEY: "test-key", RUNPOD_MUSETALK_ENDPOINT: "musetalk-test", MUSETALK_GENERATION_ENABLED: "true",
    MUSETALK_CALLBACK_SECRET: "test-signing-key", MUSETALK_HOURLY_USD: "0.58", MUSETALK_MAX_JOB_SECONDS: "600",
    PUBLIC_BASE_URL: "https://studio.test/videolab", DAILY_SPEND_CAP_USD: "5", MONTHLY_SPEND_CAP_USD: "50" };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  process.chdir(directory);
  const source = path.join(directory, "source.mp4"), portrait = path.join(directory, "portrait.png"), audio = path.join(directory, "voice.wav"), longAudio = path.join(directory, "long.wav");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25", "-t", "1", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", source]);
  execFileSync("ffmpeg", ["-v", "error", "-i", source, "-frames:v", "1", "-threads", "1", portrait]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-t", "0.8", "-c:a", "pcm_s16le", audio]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "61", "-c:a", "pcm_s16le", longAudio]);
  const videoBytes = fs.readFileSync(source), digest = createHash("sha256").update(videoBytes).digest("hex");
  let submissions = 0, cancellations = 0, complete = false, uncertain = false, failed = false, runInput: any;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("api.runpod.ai/")) return previousFetch(input, init);
    if (url.endsWith("/health")) return Response.json({ workers: { ready: 0, idle: 0 } });
    if (url.endsWith("/run")) {
      submissions++;
      const body = JSON.parse(String(init?.body)); runInput = body.input;
      assert.equal(body.policy.executionTimeout, 600000);
      assert.equal(runInput.resolution, "480p");
      assert.match(runInput.output_token, /^[a-f0-9]{64}$/);
      assert.notEqual(runInput.output_token, env.RUNPOD_API_KEY);
      if (uncertain) throw new Error("Connection lost after submission");
      // Hold briefly so two concurrent identical requests race through the preflight.
      await new Promise(r => setTimeout(r, 30));
      return Response.json({ id: `provider-${submissions}`, status: "IN_QUEUE" });
    }
    if (url.includes("/cancel/")) { cancellations++; return Response.json({ status: "CANCELLED" }); }
    if (url.includes("/status/")) return Response.json({ status: failed ? "FAILED" : complete ? "COMPLETED" : "IN_PROGRESS",
      executionTime: 10000, output: complete ? { uploaded: true, sha256: digest } : undefined, error: failed ? "No visible face" : undefined });
    throw new Error("Unexpected provider request");
  }) as typeof fetch;
  let app!: express.Express, pipeline!: ReturnType<typeof installPipeline>, server!: ReturnType<express.Express["listen"]>, base!: string;
  const start = async () => {
    app = express(); app.use(express.json({ limit: "30mb" })); pipeline = installPipeline(app);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
    const address = server.address(); assert(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`;
  };
  const stop = async () => { await new Promise<void>(r => server.close(() => r())); pipeline.close(); };
  const post = async (route: string, body: unknown) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const getJob = async (id: string) => (await fetch(`${base}/api/veo/status/${id}`)).json();
  const uploadOutput = (id: string, token: string, bytes = videoBytes) => fetch(`${base}/api/veo/output/${id}`, { method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" }, body: bytes });
  let db: Database.Database | undefined;
  try {
    await start();
    const invalid = await post("/api/avatars/upload-video", { dataUrl: "data:video/mp4;base64,YmFk" }); assert.equal(invalid.status, 400);
    const uploaded = await post("/api/avatars/upload-video", { dataUrl: `data:video/mp4;base64,${videoBytes.toString("base64")}` });
    assert.equal(uploaded.status, 200); const avatar = await uploaded.json();
    assert.equal(avatar.aspectRatio, "16:9"); assert.equal(avatar.duration, 1);
    const cachedSource = await fetch(base + avatar.videoUrl.replace("/videolab", "")); assert.equal(cachedSource.status, 200);
    const normalized = await probeMedia(path.join("data/cache/sources", path.basename(avatar.videoUrl)));
    assert(!normalized.streams.some(s => s.codec_type === "audio"));
    const motion = execFileSync("ffmpeg", ["-v", "error", "-i", path.join("data/cache/sources", path.basename(avatar.videoUrl)), "-vf", "fps=2", "-f", "framemd5", "pipe:1"]).toString();
    const frames = motion.split("\n").filter(line => line && !line.startsWith("#"));
    assert(frames.length >= 2); assert.notEqual(frames[0].split(",").at(-1), frames[1].split(",").at(-1), "uploaded motion must not become a repeated still frame");
    const body = { engine: "runpod-musetalk", script: "My selected voice", avatarVideoUrl: avatar.videoUrl,
      audioUrl: `data:audio/wav;base64,${fs.readFileSync(audio).toString("base64")}`, aspectRatio: "16:9", resolution: "480p" };
    assert.equal((await post("/api/veo/start", { ...body, avatarVideoUrl: "https://untrusted.test/video.mp4" })).status, 400);
    assert.equal((await post("/api/veo/start", { ...body, audioUrl: `data:audio/wav;base64,${fs.readFileSync(longAudio).toString("base64")}`, audioDuration: 1 })).status, 400);
    assert.equal(submissions, 0, "invalid media must not reach a paid worker");
    const starts = await Promise.all([post("/api/veo/start", body), post("/api/veo/start", body)]);
    const jobs = await Promise.all(starts.map(r => r.json()));
    assert.equal(jobs[0].jobId, jobs[1].jobId); assert.equal(submissions, 1);
    const first = jobs[0]; assert.equal(first.source.audioDuration, 0.8);
    assert.equal(runInput.source_kind, "video");
    const signedSource = new URL(runInput.source_url);
    assert.equal(signedSource.origin + signedSource.pathname, "https://studio.test" + avatar.videoUrl);
    assert.match(signedSource.searchParams.get("token") || "", /^[a-f0-9]{64}$/);
    assert(!JSON.stringify(first).includes(runInput.output_token), "worker authorization must not reach the browser");
    assert.equal((await post("/api/veo/start", { ...body, forceRegenerate: true })).status, 409);
    assert.equal((await uploadOutput(first.jobId, "a".repeat(64))).status, 401);
    assert.equal((await uploadOutput(first.jobId, runInput.output_token, Buffer.from("not video"))).status, 400);
    assert.equal((await uploadOutput(first.jobId, runInput.output_token)).status, 200);
    assert.equal((await uploadOutput(first.jobId, runInput.output_token)).status, 200, "same output can be acknowledged twice");
    const changed = Buffer.concat([videoBytes, Buffer.from("changed")]);
    assert.equal((await uploadOutput(first.jobId, runInput.output_token, changed)).status, 409);
    await stop(); process.env.MUSETALK_HOURLY_USD = "1"; await start(); complete = true; await pipeline.poll();
    const finished = await getJob(first.jobId); assert.equal(finished.status, "completed"); assert.equal(submissions, 1);
    assert(Math.abs(finished.actual_cost_usd - 10 * 0.58 / 3600) < 1e-9);
    const delivered = path.join("data/renders", path.basename(finished.videoUrl));
    const metadata = await probeMedia(delivered);
    assert.equal(metadata.streams.find(s => s.codec_type === "video")?.width, 854);
    assert(Math.abs(Number(metadata.format.duration) - 0.8) < 0.1);
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", delivered, "-map", "0:a:0", "-ar", "24000", "-ac", "1", "-f", "s16le", "pipe:1"]);
    let energy = 0; for (let i = 0; i < pcm.length; i += 2) energy += (pcm.readInt16LE(i) / 32768) ** 2;
    assert(Math.sqrt(energy / (pcm.length / 2)) > 0.05, "silent worker output must receive the user's real voice");
    assert.equal((await (await post("/api/veo/start", body)).json()).status, "completed"); assert.equal(submissions, 1);
    assert.equal((await uploadOutput(first.jobId, runInput.output_token)).status, 409);
    complete = false;
    const vertical = await (await post("/api/veo/start", { ...body, aspectRatio: "9:16" })).json();
    assert.equal((await uploadOutput(vertical.jobId, runInput.output_token)).status, 200);
    complete = true; await pipeline.poll();
    const verticalJob = await getJob(vertical.jobId); assert.equal(verticalJob.status, "completed");
    const verticalMedia = await probeMedia(path.join("data/renders", path.basename(verticalJob.videoUrl)));
    assert.equal(verticalMedia.streams.find(s => s.codec_type === "video")?.width, 480);
    assert.equal(verticalMedia.streams.find(s => s.codec_type === "video")?.height, 854);
    complete = false;
    const photoBody = { ...body, avatarVideoUrl: undefined, avatarImageUrl: `data:image/png;base64,${fs.readFileSync(portrait).toString("base64")}` };
    const photo = await (await post("/api/veo/start", photoBody)).json(); assert.equal(runInput.source_kind, "image");
    failed = true; await pipeline.poll(); assert.equal((await getJob(photo.jobId)).status, "failed");
    assert((await getJob(photo.jobId)).actual_cost_usd > 0, "failed work retains runtime cost");
    failed = false;
    const retried = await post("/api/veo/start", photoBody); assert.equal(retried.status, 202, "failed request can be explicitly retried");
    const retriedJob = await retried.json();
    const cancelled = await post(`/api/veo/cancel/${retriedJob.jobId}`, {}); assert.equal((await cancelled.json()).status, "cancelled");
    assert.equal(cancellations, 1);
    uncertain = true;
    const unknown = await (await post("/api/veo/start", { ...photoBody, forceRegenerate: true })).json();
    assert.equal(unknown.status, "submission_unknown"); const before = submissions;
    await stop(); await start();
    assert.equal((await post("/api/veo/start", { ...photoBody, forceRegenerate: true })).status, 409);
    assert.equal((await post(`/api/veo/cancel/${unknown.jobId}`, {})).status, 409); assert.equal(submissions, before);
    db = new Database("data/db/studio.db");
    assert(db.prepare("SELECT est_cost_usd FROM jobs WHERE id=?").get(unknown.jobId));
  } finally {
    db?.close(); if (server!) await stop();
    globalThis.fetch = previousFetch; process.chdir(cwd);
    for (const [name, value] of Object.entries(old)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
