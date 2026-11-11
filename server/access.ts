import express from "express";
import Database from "better-sqlite3";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
function validPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{64}$/.test(expected || "")) return false;
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(expected, "hex"));
}

/** One private workspace. Every signed-in member has access to this workspace.
 * Public registration and multi-tenant customer accounts are deliberately absent.
 */
export function installAccess(app: express.Express, options: {
  directory?: string; origin?: string; secure?: boolean; now?: () => number;
} = {}) {
  const directory = options.directory || "data/private";
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const accountFile = path.join(directory, "studio-account.json");
  if (!fs.existsSync(accountFile)) {
    const password = randomBytes(24).toString("base64url");
    const credentials = { username: "owner", passwordHash: passwordHash(password) };
    fs.writeFileSync(accountFile, JSON.stringify(credentials), { flag: "wx", mode: 0o600 });
    fs.writeFileSync(path.join(directory, "studio-login.txt"),
      `Avatar Studio private workspace\nURL: ${options.origin || process.env.PUBLIC_BASE_URL || "https://office.creativeprocess.io/videolab"}/\nUsername: owner\nPassword: ${password}\n\nKeep this file private. It is not served by the app.\n`,
      { flag: "wx", mode: 0o600 });
  }
  const account = JSON.parse(fs.readFileSync(accountFile, "utf8")) as { username: string; passwordHash: string };
  if (!account.username || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(account.passwordHash))
    throw new Error("Invalid private studio account configuration");
  const db = new Database(path.join(directory, "sessions.db"));
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
  const origin = new URL(options.origin || process.env.PUBLIC_BASE_URL || "https://office.creativeprocess.io/videolab").origin;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const cookieName = secure ? "__Secure-avatar_session" : "avatar_session";
  const now = options.now || Date.now;
  const ttl = 8 * 60 * 60 * 1000;
  const attempts = new Map<string, { count: number; reset: number }>();
  function allow(key: string, limit: number, window: number) {
    const time = now();
    for (const [k, entry] of attempts) if (entry.reset <= time) attempts.delete(k);
    let entry = attempts.get(key);
    if (!entry) { entry = { count: 0, reset: time + window }; attempts.set(key, entry); }
    return ++entry.count <= limit;
  }
  const token = (req: express.Request) => {
    const match = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="));
    const value = match?.slice(cookieName.length + 1) || "";
    return /^[a-f0-9]{64}$/.test(value) ? value : "";
  };
  const authenticated = (req: express.Request) => {
    const value = token(req);
    return Boolean(value && db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?").get(digest(value), now()));
  };
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "private, no-store");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
          ((req.get("Origin") && req.get("Origin") !== origin) || req.get("Sec-Fetch-Site") === "cross-site")) {
        res.status(403).json({ error: "Use Avatar Studio from its own website." }); return;
      }
    }
    res.locals.studioAuthenticated = authenticated(req);
    res.locals.studioAccessRequired = true;
    next();
  });
  app.get("/api/auth/session", (_req, res) => res.json({ authenticated: Boolean(res.locals.studioAuthenticated) }));
  app.post("/api/auth/login", express.json({ limit: "2kb" }), (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!allow("login:" + ip, 5, 15 * 60 * 1000) || !allow("login:global", 30, 15 * 60 * 1000)) {
      res.setHeader("Retry-After", "900"); res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." }); return;
    }
    const { username, password } = req.body || {};
    if (typeof password !== "string" || password.length > 1024 ||
        !validPassword(password, account.passwordHash) || username !== account.username) {
      res.status(401).json({ error: "Incorrect username or password." }); return;
    }
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now());
    const oldToken = token(req);
    if (oldToken) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(oldToken));
    const value = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?)").run(digest(value), now() + ttl);
    res.cookie(cookieName, value, { httpOnly: true, secure, sameSite: "strict", path: "/videolab", maxAge: ttl });
    res.json({ authenticated: true });
  });
  app.post("/api/auth/logout", (req, res) => {
    const value = token(req);
    if (value) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(value));
    res.clearCookie(cookieName, { httpOnly: true, secure, sameSite: "strict", path: "/videolab" });
    res.json({ authenticated: false });
  });
  app.use("/api", (req, res, next) => {
    const health = req.method === "GET" && req.path === "/health";
    const callback = req.method === "PUT" && /^\/veo\/output\/[\w-]+$/.test(req.path);
    // Worker GETs carry a signed, expiring URL verified by the pipeline media route.
    const workerMedia = ["GET", "HEAD"].includes(req.method) && req.path.startsWith("/media/");
    if (health || callback || workerMedia) { next(); return; }
    if (!res.locals.studioAuthenticated) { res.status(401).json({ error: "Sign in to Avatar Studio.", signInRequired: true }); return; }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !allow("mutations:" + digest(token(req)), 30, 60 * 1000)) {
      res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Too many requests. Wait a minute before trying again." }); return;
    }
    next();
  });
  return { close: () => db.close() };
}
