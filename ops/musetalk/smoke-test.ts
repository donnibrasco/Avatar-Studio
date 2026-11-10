import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  prepare: { type: "boolean" }, submit: { type: "boolean" }, status: { type: "boolean" },
  source: { type: "string" }, audio: { type: "string" }, script: { type: "string" },
  aspect: { type: "string", default: "16:9" },
  directory: { type: "string", default: "data/musetalk-validation" },
} });
const base = new URL(process.env.STUDIO_TEST_BASE_URL || "http://127.0.0.1:3003");
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)))
  throw new Error("Use a local app URL or HTTPS");
const directory = path.resolve(values.directory!);
fs.mkdirSync(directory, { recursive: true });
const stateFile = path.join(directory, "state.json"), requestFile = path.join(directory, "request.json");
const state: { jobId?: string; submissionStarted?: string; rejected?: string } = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
async function json(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}
const api = (route: string, body?: unknown) => fetch(new URL(route, base), { method: body === undefined ? "GET" : "POST",
  headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(150000) });
const dataUrl = (file: string, types: Record<string, string>) => {
  const mime = types[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported media type: ${path.extname(file)}`);
  const bytes = fs.readFileSync(file);
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Keep validation inputs under 20 MB");
  return `data:${mime};base64,${bytes.toString("base64")}`;
};

if (values.prepare) {
  if (state.submissionStarted || state.jobId) throw new Error("Existing validation must be resumed; use a different directory for a new test");
  if (!values.source || !values.audio || !values.script) throw new Error("Preparation requires --source, --audio and --script");
  const image = /\.(png|jpe?g|webp)$/i.test(values.source);
  const request: Record<string, unknown> = { engine: "runpod-musetalk", script: values.script, aspectRatio: values.aspect, resolution: "480p",
    audioUrl: dataUrl(values.audio, { ".wav": "audio/wav", ".mp3": "audio/mpeg" }) };
  if (image) request.avatarImageUrl = dataUrl(values.source, { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" });
  else {
    const avatar = await json(await api("/api/avatars/upload-video", { dataUrl: dataUrl(values.source, { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" }) }));
    request.avatarVideoUrl = avatar.videoUrl;
  }
  fs.writeFileSync(requestFile, JSON.stringify(request));
  fs.writeFileSync(path.join(directory, "review.json"), JSON.stringify({ source: path.resolve(values.source), audio: path.resolve(values.audio), script: values.script,
    engine: "runpod-musetalk", aspectRatio: values.aspect, resolution: "480p", health: await json(await api("/api/runpod/health")), submitted: false }, null, 2));
  console.log(`Prepared without GPU generation: ${path.join(directory, "review.json")}`);
} else {
  if (!values.submit && !values.status) throw new Error("Use --prepare, --submit or --status");
  if (!state.jobId) {
    if (!values.submit) throw new Error("No existing validation job");
    if (state.submissionStarted) throw new Error("Earlier submission outcome is unknown. Review the app ledger before any new attempt");
    if (process.env.APPROVE_PAID_GENERATION !== "yes") throw new Error("First submission requires APPROVE_PAID_GENERATION=yes");
    const request = JSON.parse(fs.readFileSync(requestFile, "utf8"));
    state.submissionStarted = new Date().toISOString(); delete state.rejected; save();
    const response = await api("/api/veo/start", request);
    const result = await response.json();
    if (!response.ok) {
      // A reverse proxy can return an error after the app accepted a submission.
      // Keep the marker even on HTTP errors; an operator must establish no job ran.
      state.rejected = result.error || `HTTP ${response.status}`; save();
      throw new Error(`${state.rejected}. Review the app ledger before another attempt`);
    }
    if (!result.jobId) throw new Error("No app job ID; review the ledger before retrying");
    state.jobId = result.jobId; save();
  }
  for (let attempt = 0; attempt < 180; attempt++) {
    const job = await json(await api(`/api/veo/status/${encodeURIComponent(state.jobId!)}`));
    fs.writeFileSync(path.join(directory, "job.json"), JSON.stringify(job, null, 2));
    console.log(`${state.jobId}: ${job.status}`);
    if (job.status === "completed") {
      const url = new URL(job.videoUrl, base);
      const output = await fetch(new URL(url.pathname.replace(/^\/videolab(?=\/api\/)/, ""), base), { signal: AbortSignal.timeout(120000) });
      if (!output.ok) throw new Error(`Output download failed (HTTP ${output.status})`);
      fs.writeFileSync(path.join(directory, "output.mp4"), Buffer.from(await output.arrayBuffer()));
      console.log(`Saved ${path.join(directory, "output.mp4")}; allocated cost: $${job.actual_cost_usd}. Review lips, identity, timing and movement.`);
      break;
    }
    if (["failed", "cancelled", "submission_unknown"].includes(job.status)) throw new Error(job.error || job.status);
    if (attempt === 179) throw new Error("Still pending. Resume this same job with --status");
    await new Promise(r => setTimeout(r, 5000));
  }
}
