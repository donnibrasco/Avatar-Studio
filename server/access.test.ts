import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import { installAccess, passwordHash } from "./access";

test("private studio blocks paid routes, persists secure sessions, rejects cross-site writes and throttles sign-in", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-access-"));
  fs.writeFileSync(path.join(directory, "studio-account.json"), JSON.stringify({ username: "owner", passwordHash: passwordHash("test-private-password") }));
  let time = Date.now(), mutations = 0;
  const start = async () => {
    const app = express();
    const access = installAccess(app, { directory, origin: "https://studio.test/videolab", secure: true, now: () => time });
    app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
    app.post("/api/paid", (_req, res) => { mutations++; res.json({ accepted: true }); });
    app.get("/api/private", (_req, res) => res.json({ secret: "workspace-only" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(r => server.once("listening", r));
    const address = server.address(); assert(address && typeof address !== "string");
    return { server, access, base: `http://127.0.0.1:${address.port}` };
  };
  let running = await start();
  const stop = async () => { await new Promise<void>(r => running.server.close(() => r())); running.access.close(); };
  const login = (password: string, origin = "https://studio.test") => fetch(running.base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ username: "owner", password }) });
  try {
    assert.equal((await fetch(running.base + "/api/health")).status, 200);
    assert.equal((await fetch(running.base + "/api/paid", { method: "POST" })).status, 401);
    assert.equal(mutations, 0);
    assert.equal((await fetch(running.base + "/api/private")).status, 401);
    assert.equal((await login("test-private-password", "https://attacker.test")).status, 403);
    assert.equal((await login("wrong")).status, 401);
    const response = await login("test-private-password"); assert.equal(response.status, 200);
    const header = response.headers.get("set-cookie")!;
    assert.match(header, /HttpOnly/i); assert.match(header, /Secure/); assert.match(header, /SameSite=Strict/); assert.match(header, /Path=\/videolab/);
    const cookie = header.split(";")[0];
    assert.equal((await fetch(running.base + "/api/private", { headers: { Cookie: cookie } })).status, 200);
    assert(!fs.readFileSync(path.join(directory, "sessions.db")).includes(cookie.split("=")[1]), "session tokens are hashed on disk");
    assert.equal((await fetch(running.base + "/api/paid", { method: "POST", headers: { Cookie: cookie, Origin: "https://attacker.test" } })).status, 403);
    assert.equal(mutations, 0);
    await stop(); running = await start();
    assert.equal((await fetch(running.base + "/api/private", { headers: { Cookie: cookie } })).status, 200, "session survives restart");
    for (let i = 0; i < 30; i++) assert.equal((await fetch(running.base + "/api/paid", { method: "POST", headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(running.base + "/api/paid", { method: "POST", headers: { Cookie: cookie } })).status, 429);
    assert.equal(mutations, 30);
    assert.equal((await fetch(running.base + "/api/auth/logout", { method: "POST", headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(running.base + "/api/private", { headers: { Cookie: cookie } })).status, 401);
    const second = await login("test-private-password"); const secondCookie = second.headers.get("set-cookie")!.split(";")[0];
    time += 9 * 60 * 60 * 1000;
    assert.equal((await fetch(running.base + "/api/private", { headers: { Cookie: secondCookie } })).status, 401, "expired sessions are rejected");
    for (let i = 0; i < 5; i++) assert.equal((await login("wrong")).status, 401);
    assert.equal((await login("test-private-password")).status, 429);
  } finally { await stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
