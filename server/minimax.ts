import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
export const MINIMAX_ENGINE = "minimax-h3";
export const MINIMAX_REQUEST_VERSION = 2;
export class MinimaxError extends Error {
  constructor(public status: number, message: string, public submissionUnknown = false) { super(message); }
}
export function minimaxVideoProfile(resolution: unknown, aspectRatio: string) {
  if (!["16:9", "9:16"].includes(aspectRatio) || typeof resolution !== "string" || !["480p", "720p"].includes(resolution))
    throw new MinimaxError(400, "MiniMax-H3 supports 480p or 720p delivery in landscape or portrait");
  // Native H3 canvases follow the pinned SGLang resolver's 32-pixel grid.
  const low = resolution === "480p", portrait = aspectRatio === "9:16";
  const shortEdge = low ? 480 : 768, nativeLong = low ? 864 : 1344;
  const deliveryShort = low ? 480 : 720, deliveryLong = low ? 854 : 1280;
  return {
    shortEdge,
    nativeWidth: portrait ? shortEdge : nativeLong,
    nativeHeight: portrait ? nativeLong : shortEdge,
    width: portrait ? deliveryShort : deliveryLong,
    height: portrait ? deliveryLong : deliveryShort,
  };
}
export type MinimaxStatus = {
  id: string; status: string; progress?: number; error?: { message?: string };
  inference_time_s?: number; peak_memory_mb?: number;
};
const positive = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
};
export async function probeMedia(file: string) {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { timeout: 30000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name?: string; width?: number; height?: number; duration?: string; sample_rate?: string; channels?: number; avg_frame_rate?: string }>; format: { duration?: string } };
  } catch { throw new MinimaxError(400, "The uploaded media could not be decoded. Use a valid image and speech file."); }
}
export function buildMinimaxPrompt(script: string) {
  const dialogue = script.replace(/[<>]/g, "");
  return `subject_definitions:\n<Subject 1> (S1) is the person in <Picture 1>. <Audio 1> is their complete supplied speech.\n\nsummary:\n[reference generation + audio reuse] One continuous talking-head shot of <Subject 1> speaking <Audio 1>.\n\nretention_analysis:\n<Subject 1>: fully_preserved - retain identity, clothing, lighting and background.\n<Audio 1>: fully_copy - reuse the complete speech as the final soundtrack.\n\ndetailed_description:\n[Shot 1] A stationary camera shows <Subject 1> facing forward, with natural restrained lip and jaw articulation synchronized to <Audio 1>. <Subject 1> (S1) speaks, <d>${dialogue}</d> Match the audio's phonemes, pauses and breaths. Keep the mouth still during silence. Preserve the reference appearance. No cuts, camera motion, additional people, text, music or sound effects.\n\noverall_soundscape:\nOnly the supplied speech from <Audio 1>.\n\nnon_diegetic_music:\nNone.`;
}
export function createMinimaxClient() {
  const base = process.env.MINIMAX_BASE_URL?.trim().replace(/\/$/, "") || "";
  if (base) {
    const u = new URL(base);
    if (u.username || u.password || u.search || u.hash || u.pathname !== "/" ||
        !(u.protocol === "https:" || (u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)))) {
      throw new Error("MINIMAX_BASE_URL must be an HTTPS origin or a local SSH tunnel origin");
    }
  }
  const hourlyUsd = positive("MINIMAX_HOURLY_USD", 0.27);
  const maxJobSeconds = positive("MINIMAX_MAX_JOB_SECONDS", 7200);
  const generationEnabled = process.env.MINIMAX_GENERATION_ENABLED === "true";
  const reservationUsd = hourlyUsd * maxJobSeconds / 3600;
  const identity = `${base}:MiniMax-H3:42ed227ee7df40d41602854ae760620d6eb651fe:50:${MINIMAX_REQUEST_VERSION}`;
  const api = async (pathname: string, method = "GET", body?: unknown, timeout = 30000) => {
    if (!base) throw new MinimaxError(503, "MiniMax-H3 is not configured.");
    const submitting = method === "POST";
    let response: Response;
    try {
      response = await fetch(base + pathname, {
        method, headers: { "Content-Type": "application/json", ...(process.env.MINIMAX_API_KEY ? { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new MinimaxError(503, submitting ? "MiniMax submission outcome is unknown. Do not retry: review the job before submitting again." : "MiniMax-H3 is unavailable or still loading.", submitting);
    }
    if (!response.ok) {
      if (response.status === 404 && pathname.startsWith("/v1/videos/"))
        throw new MinimaxError(410, "MiniMax lost this job after a service restart. It was not resubmitted; its budget reservation is retained.");
      throw new MinimaxError(response.status >= 500 ? 503 : 400,
        `MiniMax-H3 returned HTTP ${response.status}. ${submitting && response.status >= 500 ? "Submission outcome is unknown; do not retry automatically." : "Check the service and input files."}`,
        submitting && response.status >= 500);
    }
    return response;
  };
  return {
    configured: Boolean(base), generationEnabled, hourlyUsd, maxJobSeconds, reservationUsd, identity,
    async health() {
      const details = { generationEnabled, hourlyUsd, reservationUsd, maxJobSeconds, maxAudioSeconds: 15, defaultResolution: "480p", resolutions: ["480p", "720p"] };
      if (!base) return { ...details, status: "not_configured" as const };
      try { await api("/health", "GET", undefined, 5000); return { ...details, status: "ready" as const }; }
      catch { return { ...details, status: "unavailable" as const, error: "MiniMax-H3 is loading or unavailable." }; }
    },
    async prepare(imageFile: string, audioFile: string, script: string, aspectRatio: string, resolution = "480p") {
      const profile = minimaxVideoProfile(resolution, aspectRatio);
      const [image, audio] = await Promise.all([probeMedia(imageFile), probeMedia(audioFile)]);
      const visual = image.streams.find(s => s.codec_type === "video");
      const audioStream = audio.streams.find(s => s.codec_type === "audio");
      const seconds = Number(audioStream?.duration || audio.format.duration);
      if (!visual?.width || !visual.height || visual.width * visual.height > 25000000)
        throw new MinimaxError(400, "Use an image of up to 25 megapixels.");
      if (!audioStream || !Number.isFinite(seconds) || seconds <= 0 || seconds > 15)
        throw new MinimaxError(400, "MiniMax-H3 supports up to 15 seconds of speech. Shorten the script and preview again.");
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-h3-"));
      try {
        const picture = path.join(directory, "portrait.png"), speech = path.join(directory, "speech.wav");
        const targetSeconds = Math.max(4, seconds);
        await Promise.all([
          exec("ffmpeg", ["-v", "error", "-nostdin", "-threads", "1", "-i", imageFile, "-vf", "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease,format=rgb24", "-frames:v", "1", "-threads", "1", picture], { timeout: 60000, maxBuffer: 1024 * 1024 }),
          exec("ffmpeg", ["-v", "error", "-nostdin", "-i", audioFile, "-af", "apad", "-t", String(targetSeconds), "-ar", "32000", "-ac", "2", "-c:a", "pcm_s16le", speech], { timeout: 60000, maxBuffer: 1024 * 1024 }),
        ]);
        const [pictureBytes, speechBytes] = await Promise.all([fs.readFile(picture), fs.readFile(speech)]);
        return { seconds, targetSeconds, payload: {
          model: "MiniMaxAI/MiniMax-H3", task: "ref2va", prompt: buildMinimaxPrompt(script),
          conditions: [
            { type: "image", role: "reference", uri: `data:image/png;base64,${pictureBytes.toString("base64")}` },
            { type: "audio", role: "reference", uri: `data:audio/wav;base64,${speechBytes.toString("base64")}` },
          ],
          target: { short_edge: profile.shortEdge, aspect_ratio: aspectRatio, duration_seconds: targetSeconds },
          num_outputs_per_prompt: 1, num_inference_steps: 50, flow_shift: 12, audio_flow_shift: 3,
          seed: 42, enhance_prompt: false,
        } };
      } finally { await fs.rm(directory, { recursive: true, force: true }); }
    },
    async submit(payload: unknown) {
      if (!generationEnabled) throw new MinimaxError(503, "MiniMax generation is awaiting approval. No video has been submitted.");
      const response = await api("/v1/videos", "POST", payload, 120000);
      let result: MinimaxStatus;
      try { result = await response.json(); }
      catch { throw new MinimaxError(503, "MiniMax returned an invalid submission response. Outcome is unknown; do not retry.", true); }
      if (!result.id || !/^[\w-]{1,128}$/.test(result.id)) throw new MinimaxError(503, "MiniMax did not return a valid job ID. Outcome is unknown; do not retry.", true);
      return result;
    },
    async status(id: string): Promise<MinimaxStatus> { return (await api(`/v1/videos/${encodeURIComponent(id)}`)).json(); },
    async cancel(id: string) { await api(`/v1/videos/${encodeURIComponent(id)}`, "DELETE"); },
    async deliver(id: string, audioFile: string, destination: string, seconds: number, aspectRatio: string, resolution = "720p") {
      const { nativeWidth, nativeHeight, width, height } = minimaxVideoProfile(resolution, aspectRatio);
      const response = await api(`/v1/videos/${encodeURIComponent(id)}/content`, "GET", undefined, 120000);
      if (!response.body || !/video\/mp4|application\/octet-stream/.test(response.headers.get("content-type") || ""))
        throw new MinimaxError(502, "MiniMax returned invalid video content.");
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-h3-export-"));
      const raw = path.join(temporary, "native.mp4"), exported = path.join(temporary, "delivery.mp4");
      try {
        const handle = await fs.open(raw, "wx");
        try {
          let bytes = 0;
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            bytes += chunk.length;
            if (bytes > 200 * 1024 * 1024) throw new MinimaxError(502, "MiniMax output exceeds 200MB.");
            await handle.writeFile(chunk);
          }
        } finally { await handle.close(); }
        const native = await probeMedia(raw);
        const nativeVideo = native.streams.find(s => s.codec_type === "video"), nativeAudio = native.streams.find(s => s.codec_type === "audio");
        if (nativeVideo?.codec_name !== "h264" || nativeVideo.width !== nativeWidth || nativeVideo.height !== nativeHeight ||
            nativeVideo.avg_frame_rate !== "24/1" || nativeAudio?.sample_rate !== "32000" || nativeAudio.channels !== 2 ||
            Number(native.format.duration) + 0.05 < seconds)
          throw new MinimaxError(502, "MiniMax returned a video outside the expected audio/video contract.");
        await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", raw, "-i", audioFile,
          "-map", "0:v:0", "-map", "1:a:0", "-t", String(seconds),
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
          "-r", "24", "-c:v", "libx264", "-preset", "fast", "-threads", "2", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-ar", "32000", "-ac", "2", "-movflags", "+faststart", exported], { timeout: 180000, maxBuffer: 1024 * 1024 });
        const output = await probeMedia(exported);
        const v = output.streams.find(s => s.codec_type === "video"), a = output.streams.find(s => s.codec_type === "audio");
        if (v?.width !== width || v.height !== height || !a || Math.abs(Number(output.format.duration) - seconds) > 0.2)
          throw new MinimaxError(502, "MiniMax export did not pass media validation.");
        await fs.copyFile(exported, destination + ".tmp");
        await fs.rename(destination + ".tmp", destination);
        return { width, height, duration: Number(output.format.duration) };
      } finally { await fs.rm(temporary, { recursive: true, force: true }); }
    },
  };
}
