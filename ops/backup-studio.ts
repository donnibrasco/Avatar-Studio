import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { spawn, execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const mode = process.argv[2], supplied = process.argv[3];
const keyFile = "data/private/backup.key", header = Buffer.from("AVATAR_BACKUP_V1\n");
fs.mkdirSync("data/private", { recursive: true, mode: 0o700 });
if (!fs.existsSync(keyFile)) {
  if (mode !== "backup") throw new Error("Restore requires the original private backup key");
  fs.writeFileSync(keyFile, randomBytes(32), { flag: "wx", mode: 0o600 });
}
const key = fs.readFileSync(keyFile);
if (key.length !== 32) throw new Error("Invalid backup key");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "studio-backup-"));
try {
  if (mode === "backup") {
    const snapshot = path.join(temporary, "snapshot"); fs.mkdirSync(snapshot);
    const db = new Database("data/db/studio.db", { readonly: true });
    await db.backup(path.join(snapshot, "studio.db")); db.close();
    for (const [source, destination] of [["data/cache", "cache"], ["data/renders", "renders"], ["data/private/studio-account.json", "studio-account.json"], [".env", "server.env"]]) {
      if (fs.existsSync(source)) fs.cpSync(source, path.join(snapshot, destination), { recursive: true });
    }
    fs.writeFileSync(path.join(snapshot, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), schema: 1, sessionsExcluded: true }));
    fs.mkdirSync("data/backups", { recursive: true, mode: 0o700 });
    const destination = supplied || `data/backups/studio-${Date.now()}.aes`;
    const iv = randomBytes(12); fs.writeFileSync(destination, Buffer.concat([header, iv]), { flag: "wx", mode: 0o600 });
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const tar = spawn("tar", ["-cf", "-", "-C", snapshot, "."], { stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise<void>((resolve, reject) => { tar.once("error", reject); tar.once("close", code => code === 0 ? resolve() : reject(new Error("Archive creation failed"))); });
    await Promise.all([pipeline(tar.stdout, cipher, fs.createWriteStream(destination, { flags: "a" })), exited]);
    fs.appendFileSync(destination, cipher.getAuthTag());
    console.log(JSON.stringify({ backup: destination, encrypted: true, keyFile, note: "Keep a separate secure copy of the key and the encrypted archive off this host." }));
  } else if (mode === "verify" && supplied) {
    const size = fs.statSync(supplied).size;
    const fd = fs.openSync(supplied, "r"), prefix = Buffer.alloc(header.length + 12), tag = Buffer.alloc(16);
    try { fs.readSync(fd, prefix, 0, prefix.length, 0); fs.readSync(fd, tag, 0, 16, size - 16); } finally { fs.closeSync(fd); }
    if (!prefix.subarray(0, header.length).equals(header) || size < prefix.length + 16) throw new Error("Invalid encrypted backup");
    const decipher = createDecipheriv("aes-256-gcm", key, prefix.subarray(header.length)); decipher.setAuthTag(tag);
    const archive = path.join(temporary, "verified.tar");
    // Authenticate the whole archive before any extraction occurs.
    await pipeline(fs.createReadStream(supplied, { start: prefix.length, end: size - 17 }), decipher, fs.createWriteStream(archive, { mode: 0o600 }));
    const names = execFileSync("tar", ["-tf", archive], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\n").filter(Boolean);
    if (names.some(name => name.startsWith("/") || name.split("/").includes(".."))) throw new Error("Unsafe archive path");
    const restored = path.join(temporary, "restored"); fs.mkdirSync(restored);
    execFileSync("tar", ["-xf", archive, "-C", restored]);
    const db = new Database(path.join(restored, "studio.db"), { readonly: true });
    const integrity = db.pragma("integrity_check", { simple: true });
    const jobs = db.prepare("SELECT COUNT(*) count FROM jobs").get(); db.close();
    if (integrity !== "ok" || !fs.existsSync(path.join(restored, "studio-account.json"))) throw new Error("Restored data failed verification");
    console.log(JSON.stringify({ verified: true, integrity, jobs, productionFilesChanged: false }));
  } else throw new Error("Use: node --import tsx ops/backup-studio.ts backup [archive.aes] | verify archive.aes");
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
