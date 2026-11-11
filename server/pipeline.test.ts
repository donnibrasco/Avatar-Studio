import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { installPipeline } from "./pipeline";

test("pipeline reserves budgets, deduplicates jobs, retains media, recovers polling and caches speech", async () => {
  const cwd = process.cwd(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-pipeline-"));
  const previousFetch = globalThis.fetch;
  const names = [
    "RUNPOD_API_KEY",
    "DAILY_SPEND_CAP_USD",
    "MONTHLY_SPEND_CAP_USD",
    "PUBLIC_BASE_URL",
    "RUNPOD_INFINITETALK_ENDPOINT",
    "RUNPOD_PVIDEO_ENDPOINT",
    "RUNPOD_CHATTERBOX_ENDPOINT",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_INPUT_USD_PER_MILLION_TOKENS",
    "OPENAI_OUTPUT_USD_PER_MILLION_TOKENS",
  ];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  process.env.RUNPOD_API_KEY = "test-key";
  process.env.DAILY_SPEND_CAP_USD = ".60";
  process.env.MONTHLY_SPEND_CAP_USD = "1";
  process.env.PUBLIC_BASE_URL = "https://office.creativeprocess.io/videolab";
  process.env.RUNPOD_INFINITETALK_ENDPOINT = "infinitetalk-test";
  process.env.RUNPOD_PVIDEO_ENDPOINT = "pvideo-test";
  process.env.RUNPOD_CHATTERBOX_ENDPOINT = "chatterbox-test";
  process.chdir(dir);
  let submits = 0,
    speech = 0,
    completed = false,
    speechCompleted = false,
    pvideoHealthy = true;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:")) return previousFetch(input, init);
    if (url.endsWith("/health")) {
      if (url.includes("/pvideo-test/") && !pvideoHealthy)
        return new Response(JSON.stringify({ status: 401 }), { status: 401 });
      return Response.json({ status: "ok" });
    }
    if (url.endsWith("/infinitetalk-test/run")) {
      submits++;
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.input.input_type, "image");
      assert.equal(payload.input.person_count, "single");
      assert.match(payload.input.image_url, /\/videolab\/api\/media\/avatars\//);
      assert.match(payload.input.wav_url, /\/videolab\/api\/media\/tts\//);
      assert.equal(payload.input.width, 1280);
      assert.equal(payload.input.height, 720);
      assert.equal(payload.input.network_volume, false);
      assert.match(payload.input.prompt, /uploaded image as the exact visual reference/);
      assert.match(payload.input.prompt, /Do not redesign, restyle, replace/);
      return Response.json({ id: "provider-video", status: "IN_QUEUE" });
    }
    if (url.endsWith("/status/provider-speech"))
      return Response.json(
        speechCompleted
          ? {
              status: "COMPLETED",
              output: { audio_base64: "AQIDBA==", format: "wav", sample_rate: 24000 },
            }
          : { status: "IN_PROGRESS" },
      );
    if (url.includes("/status/"))
      return Response.json(
        completed
          ? {
              status: "COMPLETED",
              output: { video: "AQIDBA==", cost: 0.5 },
            }
          : { status: "IN_PROGRESS" },
      );
    if (url.endsWith("/chatterbox-test/run")) {
      speech++;
      return Response.json({ id: "provider-speech", status: "IN_QUEUE" });
    }
    if (url.startsWith("https://cdn.example/"))
      return new Response(new Uint8Array([1, 2, 3, 4]));
    throw new Error("Unexpected external request");
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  let pipeline = installPipeline(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (route: string, body: unknown) =>
    fetch(base + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const health = await (await fetch(base + "/api/runpod/health")).json();
    assert.equal(health.infinitetalk.status, "ready");
    assert.equal(health.pvideo.status, "ready");
    const tts = { text: "Hello world", provider: "runpod-chatterbox" };
    const first = await post("/api/tts/generate", tts);
    assert.equal(first.status, 202);
    const queuedVoice = await first.json();
    assert.equal(queuedVoice.status, "processing");
    const duplicateSpeech = await post("/api/tts/generate", tts);
    assert.equal(duplicateSpeech.status, 202);
    assert.equal((await duplicateSpeech.json()).jobId, queuedVoice.jobId);
    speechCompleted = true;
    await pipeline.poll();
    const voice = await (
      await fetch(`${base}/api/veo/status/${queuedVoice.jobId}`)
    ).json();
    assert.equal(voice.status, "completed");
    assert.match(voice.audioUrl, /\/videolab\/api\/media\/tts\//);
    const savedAudio = await fetch(
      `${base}${voice.audioUrl.replace("/videolab", "")}`,
    );
    assert.equal(savedAudio.status, 200);
    assert.deepEqual(
      [...new Uint8Array(await savedAudio.arrayBuffer())],
      [1, 2, 3, 4],
    );
    const cached = await (await post("/api/tts/generate", tts)).json();
    assert.equal(cached.cached, true);
    assert.equal(cached.costUsd, 0);
    assert.equal(speech, 1);
    const body = {
      engine: "runpod-infinitetalk",
      script: "Hello world",
      prompt:
        "Use the uploaded image as the exact visual reference. Preserve the person's identity and appearance, including face, hair, clothing, framing, and background. Animate only natural speech and mouth movements synchronized to the provided audio. Do not redesign, restyle, replace, or add visual elements.",
      avatarImageUrl: "data:image/jpeg;base64,aGVsbG8=",
      audioUrl: voice.audioUrl,
      duration: "5s",
      resolution: "720p",
    };
    const started = await post("/api/veo/start", body);
    assert.equal(started.status, 200);
    const job = await started.json();
    const duplicate = await (await post("/api/veo/start", body)).json();
    assert.equal(duplicate.jobId, job.jobId);
    assert.equal(submits, 1);
    pvideoHealthy = false;
    const unavailable = await post("/api/veo/start", {
      ...body,
      engine: "runpod-pvideo",
    });
    assert.equal(unavailable.status, 502);
    assert.match((await unavailable.json()).error, /endpoint ID is valid/);
    pvideoHealthy = true;
    const blocked = await post("/api/veo/start", {
      ...body,
      script: "Another script",
    });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).capReached, true);
    assert.equal(submits, 1);
    const summary = await (await fetch(base + "/api/usage/summary")).json();
    assert(summary.todaySpendUsd > 0.5);
    assert.equal(summary.cacheHitsCount, 2);
    // Reopen the ledger as a process restart would, and finish the existing provider job.
    await pipeline.poll();
    pipeline.close();
    completed = true;
    process.env.DAILY_SPEND_CAP_USD = "10";
    process.env.MONTHLY_SPEND_CAP_USD = "0.1";
    const secondApp = express();
    secondApp.use(express.json());
    pipeline = installPipeline(secondApp);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await pipeline.poll();
    const { default: Database } = await import("better-sqlite3");
    const db = new Database("data/db/studio.db");
    const row = db.prepare("SELECT * FROM jobs WHERE id=?").get(job.jobId) as {
      status: string;
      local_media_url: string;
    };
    assert.equal(row.status, "completed");
    assert.match(row.local_media_url, /^\/videolab\/api\/media\/renders\//);
    assert(fs.existsSync(path.join(dir, "data/renders", job.jobId + ".mp4")));
    db.close();
    const restoredServer = secondApp.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) =>
      restoredServer.once("listening", resolve),
    );
    const restoredAddress = restoredServer.address();
    assert(restoredAddress && typeof restoredAddress !== "string");
    const restoredBase = `http://127.0.0.1:${restoredAddress.port}`;
    try {
      const restoredStatus = await (
        await fetch(`${restoredBase}/api/veo/status/${job.jobId}`)
      ).json();
      assert.equal(restoredStatus.status, "completed");
      const retained = await fetch(
        restoredBase + row.local_media_url.replace("/videolab", ""),
      );
      assert.equal(retained.status, 200);
      assert.equal(retained.headers.get("content-type"), "video/mp4");
      assert.deepEqual(
        [...new Uint8Array(await retained.arrayBuffer())],
        [1, 2, 3, 4],
      );
      const monthlyBlocked = await fetch(restoredBase + "/api/veo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, script: "Monthly budget test" }),
      });
      assert.equal(monthlyBlocked.status, 429);
      assert.equal((await monthlyBlocked.json()).capReached, true);
      assert.equal(submits, 1);
      const cachedAtCap = await fetch(restoredBase + "/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tts),
      });
      assert.equal(cachedAtCap.status, 200);
      assert.equal((await cachedAtCap.json()).cached, true);
    } finally {
      await new Promise<void>((resolve) =>
        restoredServer.close(() => resolve()),
      );
    }
    const traversal = await fetch(base + "/api/media/__proto__/test.mp4");
    assert.equal(traversal.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    pipeline.close();
    globalThis.fetch = previousFetch;
    process.chdir(cwd);
    for (const key of names) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Runpod-only speech, script and vision routes use bounded budgets and cache completed results", async () => {
  const cwd = process.cwd(),
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-runpod-only-"));
  const originalFetch = globalThis.fetch;
  const variables = [
    "RUNPOD_API_KEY",
    "DAILY_SPEND_CAP_USD",
    "MONTHLY_SPEND_CAP_USD",
    "RUNPOD_TEXT_ENDPOINT",
    "RUNPOD_TEXT_MODEL",
    "RUNPOD_VISION_ENDPOINT",
    "RUNPOD_VISION_MODEL",
    "RUNPOD_INFINITETALK_ENDPOINT",
    "RUNPOD_PVIDEO_ENDPOINT",
    "RUNPOD_CHATTERBOX_ENDPOINT",
  ];
  const old = Object.fromEntries(
    variables.map((key) => [key, process.env[key]]),
  );
  process.env.RUNPOD_API_KEY = "test-key";
  process.env.DAILY_SPEND_CAP_USD = "1";
  process.env.MONTHLY_SPEND_CAP_USD = "1";
  process.env.RUNPOD_TEXT_ENDPOINT = "text-test";
  process.env.RUNPOD_VISION_ENDPOINT = "vision-test";
  process.env.RUNPOD_INFINITETALK_ENDPOINT = "infinitetalk-test";
  process.env.RUNPOD_PVIDEO_ENDPOINT = "pvideo-test";
  process.env.RUNPOD_CHATTERBOX_ENDPOINT = "chatterbox-test";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  for (const key of [
    "RUNPOD_TEXT_MODEL",
    "RUNPOD_VISION_MODEL",
  ]) delete process.env[key];
  process.chdir(directory);
  let scripts = 0,
    analyses = 0,
    speech = 0,
    speechCompleted = false,
    openAiCalls = 0;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    if (url === "https://api.openai.com/v1/chat/completions") {
      openAiCalls++;
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-openai-key",
      );
      const request = JSON.parse(String(init?.body));
      assert.equal(request.model, "gpt-4o-mini");
      assert.equal(request.max_completion_tokens, 1000);
      return Response.json({
        choices: [
          {
            message: {
              content:
                "A clear, polished spoken script.",
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });
    }
    assert(
      url.startsWith("https://api.runpod.ai/") ||
        url.startsWith("https://cdn.example/"),
    );
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith("/text-test/openai/v1/chat/completions")) {
      scripts++;
      assert.equal(body.model, "Qwen/Qwen3-32B-AWQ");
      assert.equal(body.stream, false);
      assert.equal(body.input, undefined);
      assert.equal(body.chat_template_kwargs.enable_thinking, false);
      return Response.json({
        choices: [
          {
            message: {
              content:
                "<think>Hidden reasoning</think>Welcome to your studio. Bring every idea to life today.",
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      });
    }
    if (url.endsWith("/vision-test/openai/v1/chat/completions")) {
      analyses++;
      assert.equal(body.model, "kimi-k2.6");
      assert.equal(body.messages[0].content[1].type, "image_url");
      assert(body.max_tokens <= 512);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                lookDescription: "Presenter in a blue studio.",
                voiceStyle: "Suggested warm delivery.",
                recommendedVoice: "brian",
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1000, completion_tokens: 80 },
      });
    }
    if (url.endsWith("/status/speech-one")) {
      return Response.json(
        speechCompleted
          ? {
              status: "COMPLETED",
              output: { audio_url: "https://cdn.example/speech.wav" },
            }
          : { status: "IN_PROGRESS" },
      );
    }
    if (url.endsWith("/status/speech-two"))
      return Response.json({ status: "FAILED", error: "No text provided" });
    if (url.endsWith("/chatterbox-test/run")) {
      speech++;
      assert.equal(typeof body.input.text, "string");
      assert.equal(body.input.prompt, undefined);
      assert.equal(body.input.voice, "lucy");
      assert.equal(body.input.format, "wav");
      return Response.json({
        id: body.input.text === "This should fail." ? "speech-two" : "speech-one",
        status: "IN_QUEUE",
      });
    }
    if (url.startsWith("https://cdn.example/"))
      return new Response(new Uint8Array([1, 2, 3]));
    throw new Error("Unexpected provider request");
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  const pipeline = installPipeline(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) =>
    fetch(base + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const script = await (
      await post("/api/script/assist", { topic: "a studio welcome" })
    ).json();
    assert.equal(
      script.script,
      "Welcome to your studio. Bring every idea to life today.",
    );
    assert.equal(script.costUsd, 0.0012);
    assert.equal(
      (
        await (
          await post("/api/script/assist", { topic: "a studio welcome" })
        ).json()
      ).cached,
      true,
    );
    assert.equal(scripts, 1);
    const enhanced = await post("/api/llm/enhance", {
      type: "script",
      text: "hello",
    });
    assert.equal(enhanced.status, 200);
    assert.deepEqual(await enhanced.json(), {
      text: "A clear, polished spoken script.",
      cached: false,
      costUsd: 0.000045,
    });
    const enhancedCached = await (
      await post("/api/llm/enhance", { type: "script", text: "hello" })
    ).json();
    assert.equal(enhancedCached.cached, true);
    assert.equal(enhancedCached.costUsd, 0);
    const invalidType = await post("/api/llm/enhance", {
      type: "visual",
      text: "a portrait",
    });
    assert.equal(invalidType.status, 400);
    assert.equal(openAiCalls, 1);
    const openAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const missingKey = await post("/api/llm/enhance", {
      type: "script",
      text: "No key",
    });
    assert.equal(missingKey.status, 503);
    process.env.OPENAI_API_KEY = openAiKey;
    const frame = "data:image/jpeg;base64,aGVsbG8=";
    const style = await (
      await post("/api/sample/analyze", { frameDataUrl: frame })
    ).json();
    assert.equal(style.recommendedVoice, "brian");
    assert.equal(style.lookDescription, "Presenter in a blue studio.");
    assert.equal(
      (
        await (
          await post("/api/sample/analyze", { frameDataUrl: frame })
        ).json()
      ).cached,
      true,
    );
    assert.equal(analyses, 1);
    const rejected = await post("/api/sample/analyze", {
      frameDataUrl: frame,
      videoDataUrl: "data:video/mp4;base64,aGVsbG8=",
    });
    assert.equal(rejected.status, 400);
    assert.equal(analyses, 1);
    const voice = await post("/api/tts/generate", {
      text: "Hello from Runpod.",
    });
    assert.equal(voice.status, 202);
    const queuedVoice = await voice.json();
    speechCompleted = true;
    await pipeline.poll();
    const completedVoice = await (
      await fetch(`${base}/api/veo/status/${queuedVoice.jobId}`)
    ).json();
    assert.equal(completedVoice.status, "completed");
    assert.match(completedVoice.audioUrl, /\/videolab\/api\/media\/tts\//);
    assert.equal(speech, 1);
    // Existing saved preset names resolve to a supported Runpod preset and share its cache.
    const legacyVoice = await (
      await post("/api/tts/generate", {
        text: "Hello from Runpod.",
        voiceName: "Kore",
      })
    ).json();
    assert.equal(legacyVoice.cached, true);
    assert.equal(speech, 1);
    const failedVoiceResponse = await post("/api/tts/generate", {
      text: "This should fail.",
    });
    assert.equal(failedVoiceResponse.status, 202);
    const failedVoiceJob = await failedVoiceResponse.json();
    await pipeline.poll();
    const failedVoice = await (
      await fetch(`${base}/api/veo/status/${failedVoiceJob.jobId}`)
    ).json();
    assert.equal(failedVoice.status, "failed");
    assert.equal(failedVoice.error, "Speech generation failed: No text provided");
    assert.equal(speech, 2);
    const invalid = await post("/api/veo/start", { engine: "retired-engine" });
    assert.equal(invalid.status, 400);
    const summary = await (await fetch(base + "/api/usage/summary")).json();
    assert(
      summary.jobs.every((job: { provider: string }) =>
        job.provider.startsWith("runpod-") ||
        job.provider.startsWith("openai-"),
      ),
    );
    assert.equal(summary.cacheHitsCount, 4);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    pipeline.close();
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    for (const key of variables) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("lip-sync uses the public API schema, preserves audio, bills actual duration and rejects overlong P-Video audio", async () => {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lipsync-'));
  const realFetch = globalThis.fetch;
  const keys = ['RUNPOD_API_KEY', 'RUNPOD_INFINITETALK_ENDPOINT', 'RUNPOD_PVIDEO_ENDPOINT', 'DAILY_SPEND_CAP_USD', 'MONTHLY_SPEND_CAP_USD'];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { RUNPOD_API_KEY: 'test', RUNPOD_INFINITETALK_ENDPOINT: 'infinitetalk', RUNPOD_PVIDEO_ENDPOINT: 'p-video', DAILY_SPEND_CAP_USD: '10', MONTHLY_SPEND_CAP_USD: '10' });
  process.chdir(dir);
  let submissions = 0;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
    if (url.endsWith('/health')) return Response.json({status: 'ok'});
    if (url.endsWith('/run')) {
      submissions++;
      const {input: payload} = JSON.parse(String(init?.body));
      assert.match(payload.prompt, /sole source of speech and timing/);
      assert.ok(!payload.prompt.includes('turn away from the camera'));
      assert.match(payload.image, /^https:\/\//);
      assert.match(payload.audio, /^https:\/\//);
      assert.equal(payload.wav_url, undefined);
      if (url.includes('/infinitetalk/')) {
        assert.equal(payload.size, '480p');
        assert.equal(payload.input_type, undefined);
      } else {
        assert.equal(payload.save_audio, true);
        assert.equal(payload.draft, false);
        assert.equal(payload.prompt_upsampling, false);
      }
      return Response.json({id: `provider-${submissions}`, status: 'IN_QUEUE'});
    }
    return Response.json({status: 'IN_PROGRESS'});
  }) as typeof fetch;
  const app = express(); app.use(express.json({ limit: "30mb" }));
  const pipeline = installPipeline(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const addr = server.address(); assert(addr && typeof addr !== 'string');
  const post = (body: unknown) => fetch(`http://127.0.0.1:${addr.port}/api/veo/start`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });
  const wav = (seconds: number) => {
    const data = Buffer.alloc(44 + seconds * 16000);
    data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4);
    data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
    data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
    return 'data:audio/wav;base64,' + data.toString('base64');
  };
  try {
    const input = { engine: 'runpod-infinitetalk', resolution: '480p', script: 'Hello from my photo.', prompt: 'turn away from the camera', avatarImageUrl: 'data:image/jpeg;base64,aGVsbG8=', audioUrl: wav(7.5) };
    const res = await post(input); assert.equal(res.status, 200);
    const job = await res.json();
    assert.equal(job.est_cost_usd, 0.25);
    assert.equal(job.source.audioDuration, 7.5);
    assert.equal(job.source.script, input.script);
    const duplicate = await (await post(input)).json();
    assert.equal(duplicate.jobId, job.jobId);
    assert.equal(submissions, 1);
    const pvideo = await post({...input, engine: 'runpod-pvideo', resolution: '720p', audioDuration: 1});
    assert.equal(pvideo.status, 200);
    assert.equal((await pvideo.json()).est_cost_usd, 7.5 * 0.02);
    const tooLong = await post({...input, engine: 'runpod-pvideo', resolution: '720p', audioUrl: wav(11), audioDuration: 1});
    assert.equal(tooLong.status, 400);
    assert.match((await tooLong.json()).error, /10 seconds/);
    assert.equal(submissions, 2);
  } finally {
    pipeline.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = realFetch;
    process.chdir(cwd);
    for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
