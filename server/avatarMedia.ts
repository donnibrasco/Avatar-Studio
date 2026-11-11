import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { probeMedia } from "./minimax";

const exec = promisify(execFile);
export class AvatarMediaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function cacheAvatarVideo(dataUrl: unknown, destination: string) {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:video\/(mp4|webm|quicktime);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > Math.ceil(20 * 1024 * 1024 / 3) * 4)
    throw new AvatarMediaError(400, "Upload an MP4, WebM or MOV avatar video of up to 20 MB.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes.toString("base64") !== match[2])
    throw new AvatarMediaError(400, "The avatar video is not valid base64 media.");
  const hash = createHash("sha256").update("avatar-video-480p-v1:").update(bytes).digest("hex");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "studio-avatar-video-"));
  try {
    const input = path.join(temporary, `input.${match[1] === "quicktime" ? "mov" : match[1]}`);
    await fs.writeFile(input, bytes);
    const metadata = await probeMedia(input);
    const video = metadata.streams.find(s => s.codec_type === "video");
    const duration = Number(metadata.format.duration);
    if (!video?.width || !video.height || video.width * video.height > 8388608 ||
        !Number.isFinite(duration) || duration < 0.2 || duration > 60)
      throw new AvatarMediaError(400, "Use an avatar clip up to 60 seconds and 8 megapixels, with one visible face.");
    const portrait = video.height > video.width;
    const width = portrait ? 480 : 854, height = portrait ? 854 : 480;
    const output = path.join(temporary, "source.mp4"), thumbnail = path.join(temporary, "portrait.jpg");
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", input, "-map", "0:v:0", "-an",
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-r", "25", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { timeout: 120000, maxBuffer: 1024 * 1024 });
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", output, "-frames:v", "1", "-threads", "1", thumbnail], { timeout: 30000 });
    await fs.mkdir(destination, { recursive: true });
    await fs.copyFile(output, path.join(destination, `${hash}.mp4`));
    await fs.copyFile(thumbnail, path.join(destination, `${hash}.jpg`));
    return { file: `${hash}.mp4`, thumbnail: `${hash}.jpg`, duration, aspectRatio: portrait ? "9:16" : "16:9" };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

export async function speechDuration(file: string) {
  const metadata = await probeMedia(file);
  const seconds = Number(metadata.streams.find(s => s.codec_type === "audio")?.duration || metadata.format.duration);
  if (!metadata.streams.some(s => s.codec_type === "audio") || !Number.isFinite(seconds) || seconds < 0.2 || seconds > 60)
    throw new AvatarMediaError(400, "Use a speech track between 0.2 and 60 seconds.");
  return seconds;
}

export async function finishLipSyncVideo(raw: string, audio: string, destination: string, seconds: number, aspectRatio: string) {
  const metadata = await probeMedia(raw), video = metadata.streams.find(s => s.codec_type === "video");
  if (!video?.width || !video.height || !Number.isFinite(Number(metadata.format.duration)) || Number(metadata.format.duration) + 0.1 < seconds || video.width * video.height > 8388608)
    throw new AvatarMediaError(502, "The lip-sync worker returned incomplete or invalid video.");
  const [width, height] = aspectRatio === "9:16" ? [480, 854] : [854, 480];
  const temporary = destination + ".export.mp4";
  try {
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", raw, "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0", "-t", String(seconds),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-r", "25", "-c:v", "libx264", "-preset", "fast", "-threads", "2", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", "24000", "-ac", "1", "-movflags", "+faststart", temporary], { timeout: 180000, maxBuffer: 1024 * 1024 });
    const exported = await probeMedia(temporary);
    if (Math.abs(Number(exported.format.duration) - seconds) > 0.2)
      throw new AvatarMediaError(502, "The exported video did not match the speech duration.");
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }); }
}
