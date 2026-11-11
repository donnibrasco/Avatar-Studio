import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import { installAccess, passwordHash } from "./access";
import { installPipeline } from "./pipeline";

test("private media requires a session or a scoped unexpired signature; worker callbacks keep their own authorization", async () => {
  const cwd = process.cwd(), temporary = fs.mkdtempSync(path.join(os.tmpdir(), "studio-private-media-"));
  const names = ["RUNPOD_API_KEY", "MUSETALK_CALLBACK_SECRET", "RUNPOD_BILLING_GUARD_ENABLED"];
  const old = Object.fromEntries(names.map(k => [k, process.env[k]]));
  Object.assign(process.env, { RUNPOD_API_KEY: "test-key", MUSETALK_CALLBACK_SECRET: "test-callback-secret", RUNPOD_BILLING_GUARD_ENABLED: "false" });
  process.chdir(temporary);
  fs.mkdirSync("data/private", { recursive: true });
  fs.writeFileSync("data/private/studio-account.json", JSON.stringify({ username: "owner", passwordHash: passwordHash("test-password") }));
  const app = express();
  app.use((req, _res, next) => { if (req.url.startsWith("/videolab/")) req.url = req.url.slice(9); next(); });
  const access = installAccess(app, { origin: "https://studio.test/videolab", secure: true });
  app.use(express.json());
  const pipeline = installPipeline(app);
  const filename = "a".repeat(64) + ".png", filePath = "/videolab/api/media/avatars/" + filename;
  fs.writeFileSync(path.join("data/cache/avatars", filename), "private fixture");
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const address = server.address(); assert(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const signed = (pathname: string, expires: number) => `${pathname}?expires=${expires}&token=${createHmac("sha256", "test-callback-secret").update(`studio-media-v1:${pathname}:${expires}`).digest("hex")}`;
  try {
    assert.equal((await fetch(base + filePath)).status, 401);
    const expiry = Math.floor(Date.now() / 1000) + 60;
    const url = signed(filePath, expiry);
    assert.equal((await fetch(base + url)).status, 200, "worker can read exactly the signed file");
    assert.equal((await fetch(base + url.replace(filename, "b".repeat(64) + ".png"))).status, 401);
    assert.equal((await fetch(base + signed(filePath, expiry - 120))).status, 401);
    assert.equal((await fetch(base + signed(filePath, expiry + 7200))).status, 401);
    assert.equal((await fetch(base + url + "&token=" + "c".repeat(64))).status, 401);
    const callback = await fetch(base + "/api/veo/output/test-job", { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: "wrong" });
    assert.equal(callback.status, 401); assert.equal((await callback.json()).error, "Invalid output authorization");
    const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "owner", password: "test-password" }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await fetch(base + filePath, { headers: { Cookie: cookie } })).status, 200);
  } finally {
    await new Promise<void>(r => server.close(() => r())); pipeline.close(); access.close(); process.chdir(cwd);
    for (const k of names) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
