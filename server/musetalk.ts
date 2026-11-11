export const MUSETALK_ENGINE = "runpod-musetalk";
export const MUSETALK_REQUEST_VERSION = 2;
export function musetalkConfiguration() {
  const hourlyUsd = Number(process.env.MUSETALK_HOURLY_USD || 0.58);
  const maxJobSeconds = Number(process.env.MUSETALK_MAX_JOB_SECONDS || 600);
  const startupAllowanceSeconds = Number(process.env.MUSETALK_STARTUP_ALLOWANCE_SECONDS || 0);
  if (!Number.isFinite(hourlyUsd) || hourlyUsd <= 0 || !Number.isFinite(maxJobSeconds) || maxJobSeconds <= 0 || !Number.isFinite(startupAllowanceSeconds) || startupAllowanceSeconds < 0)
    throw new Error("Invalid MuseTalk runtime cost or job time limit");
  return {
    hourlyUsd, maxJobSeconds, startupAllowanceSeconds, reservationUsd: hourlyUsd * (maxJobSeconds + startupAllowanceSeconds) / 3600,
    generationEnabled: process.env.MUSETALK_GENERATION_ENABLED === "true",
    endpointId: process.env.RUNPOD_MUSETALK_ENDPOINT?.trim() || "",
    maxAudioSeconds: 60,
  };
}
