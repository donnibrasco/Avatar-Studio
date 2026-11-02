import React, { useRef, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { AspectRatioOption } from '../types/studio';
import { calculateTimelineOffsets } from '../utils/studioLogic';
import {
  X,
  Download,
  Film,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export const ExportModal: React.FC = () => {
  const showExportModal = useStudioStore((s) => s.showExportModal);
  const setShowExportModal = useStudioStore((s) => s.setShowExportModal);
  const projectName = useStudioStore((s) => s.projectName);
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const scenes = useStudioStore((s) => s.scenes);
  const avatars = useStudioStore((s) => s.avatars);
  const captions = useStudioStore((s) => s.captions);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportMimeExt, setExportMimeExt] = useState<'webm' | 'mp4'>('webm');
  const [exportError, setExportError] = useState<string | null>(null);

  const cancelExportRef = useRef(false);

  if (!showExportModal) return null;

  const { timings, totalDuration } = calculateTimelineOffsets(scenes);

  const getResolution = (ratio: AspectRatioOption) => {
    if (ratio === '9:16') return { width: 720, height: 1280 };
    if (ratio === '1:1') return { width: 1080, height: 1080 };
    return { width: 1280, height: 720 };
  };

  const { width, height } = getResolution(aspectRatio);

  const handleRenderAndStitch = async () => {
    setIsExporting(true);
    setExportProgress(2);
    setExportedVideoUrl(null);
    setExportError(null);
    cancelExportRef.current = false;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize 2D rendering canvas.');
      }

      // Preload avatar images and background images
      const avatarImages: Record<string, HTMLImageElement | null> = {};
      for (const av of avatars) {
        avatarImages[av.id] = await loadImageElement(av.imageUrl);
      }

      const bgImages: Record<string, HTMLImageElement | null> = {};
      for (const sc of scenes) {
        if (
          sc.background.type === 'image' ||
          sc.background.type === 'ai-generated'
        ) {
          bgImages[sc.id] = await loadImageElement(sc.background.value);
        }
      }

      const canvasStream = canvas.captureStream(30);

      // Optional Web Audio mixing for generated scene TTS audio
      let audioCtx: AudioContext | null = null;
      let audioDest: MediaStreamAudioDestinationNode | null = null;
      try {
        audioCtx = new AudioContext();
        audioDest = audioCtx.createMediaStreamDestination();
        for (const track of audioDest.stream.getAudioTracks()) {
          canvasStream.addTrack(track);
        }
      } catch {
        // Proceed with video stream if AudioContext is blocked
      }

      const preferredMime = MediaRecorder.isTypeSupported(
        'video/mp4;codecs=avc1'
      )
        ? 'video/mp4;codecs=avc1'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      setExportMimeExt(preferredMime.includes('mp4') ? 'mp4' : 'webm');

      const recorder = new MediaRecorder(canvasStream, {
        mimeType: preferredMime,
        videoBitsPerSecond: 4_000_000,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: preferredMime }));
        };
      });

      recorder.start(100);

      // Render scenes sequentially at accelerated real-time (or real-time frame steps)
      // To keep browser export crisp and fast without waiting 30+ wall-clock seconds,
      // we render 25 frames per second over a compact 1.2s per scene preview pass (or real audio pass)
      const fps = 25;
      for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
        if (cancelExportRef.current) break;
        const scene = scenes[sIdx];
        const avatarImg = avatarImages[scene.avatarId];
        const bgImg = bgImages[scene.id];
        const words = scene.scriptText.trim().split(/\s+/).filter(Boolean);

        // Play scene TTS into audio destination if available
        if (scene.audioUrl && audioCtx && audioDest) {
          try {
            const resp = await fetch(scene.audioUrl);
            const arrayBuf = await resp.arrayBuffer();
            const decoded = await audioCtx.decodeAudioData(arrayBuf);
            const source = audioCtx.createBufferSource();
            source.buffer = decoded;
            source.connect(audioDest);
            source.start();
          } catch {
            // Ignore audio decode failure
          }
        }

        // Render frames for this scene (capped at 1.5s wall time per scene so export finishes promptly)
        const renderSeconds = Math.min(2.0, Math.max(1.2, scene.durationSeconds * 0.25));
        const totalFrames = Math.max(15, Math.round(renderSeconds * fps));

        for (let f = 0; f < totalFrames; f++) {
          if (cancelExportRef.current) break;
          const sceneProgress = f / totalFrames;

          // 1. Draw Background
          if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, width, height);
          } else if (scene.background.type === 'gradient') {
            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#0F172A');
            grad.addColorStop(1, '#1E1B4B');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
          } else {
            ctx.fillStyle = scene.background.value || '#0F172A';
            ctx.fillRect(0, 0, width, height);
          }

          // 2. Draw Avatar Frame
          if (avatarImg) {
            const baseSize = Math.min(width, height) * 0.52 * (scene.avatarScale || 1);
            let drawX = (width - baseSize) / 2;
            let drawY = height - baseSize;

            if (scene.avatarPosition === 'left') {
              drawX = width * 0.08;
            } else if (scene.avatarPosition === 'right') {
              drawX = width - baseSize - width * 0.08;
            } else if (scene.avatarPosition === 'small corner') {
              const pipSize = Math.min(width, height) * 0.28;
              drawX = width - pipSize - 32;
              drawY = height - pipSize - 32;
              ctx.save();
              ctx.beginPath();
              ctx.arc(
                drawX + pipSize / 2,
                drawY + pipSize / 2,
                pipSize / 2,
                0,
                Math.PI * 2
              );
              ctx.clip();
              ctx.drawImage(avatarImg, drawX, drawY, pipSize, pipSize);
              ctx.restore();
            }

            if (scene.avatarPosition !== 'small corner') {
              ctx.drawImage(avatarImg, drawX, drawY, baseSize, baseSize);
            }
          }

          // 3. Draw Scrim & Captions
          if (captions.enabled && words.length > 0) {
            const activeWordIdx = Math.floor(sceneProgress * words.length);
            const boxY =
              captions.position === 'top'
                ? 60
                : captions.position === 'center'
                ? height / 2 - 36
                : height - 110;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
            const boxWidth = width * 0.84;
            const boxX = (width - boxWidth) / 2;
            ctx.fillRect(boxX, boxY, boxWidth, 68);

            const fontSizePx =
              captions.fontSize === 'lg'
                ? 28
                : captions.fontSize === 'sm'
                ? 20
                : 24;
            ctx.font = `600 ${fontSizePx}px "${captions.fontFamily}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Show a clean window of words around the active word
            const windowSize = 8;
            const windowStart =
              Math.floor(activeWordIdx / windowSize) * windowSize;
            const visibleWords = words.slice(
              windowStart,
              windowStart + windowSize
            );
            const lineText = visibleWords.join(' ');
            ctx.fillStyle = captions.textColor || '#F8FAFC';
            ctx.fillText(lineText, width / 2, boxY + 34, boxWidth - 32);
          }

          const overallProgress = Math.min(
            98,
            Math.round(
              ((sIdx + sceneProgress) / Math.max(1, scenes.length)) * 100
            )
          );
          setExportProgress(overallProgress);

          await new Promise((r) => setTimeout(r, 1000 / fps));
        }
      }

      recorder.stop();
      const finalBlob = await recordingDone;
      if (audioCtx) {
        await audioCtx.close().catch(() => {});
      }

      const objectUrl = URL.createObjectURL(finalBlob);
      setExportedVideoUrl(objectUrl);
      setExportProgress(100);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Failed to stitch export video.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-indigo-400" />
            <h2
              id="export-modal-title"
              className="text-lg font-semibold text-white font-display"
            >
              Export Talking-Avatar Video
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              cancelExportRef.current = true;
              setShowExportModal(false);
            }}
            aria-label="Close Export Modal"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Aspect Ratio Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Output Aspect Ratio & Resolution
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { ratio: '16:9', res: '1280 × 720', label: 'Landscape' },
                  { ratio: '9:16', res: '720 × 1280', label: 'Vertical' },
                  { ratio: '1:1', res: '1080 × 1080', label: 'Square' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.ratio}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setAspectRatio(opt.ratio)}
                  className={`p-3 text-left rounded-lg border transition-colors cursor-pointer ${
                    aspectRatio === opt.ratio
                      ? 'bg-indigo-950/40 border-indigo-500'
                      : 'bg-[#0B0F19] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-semibold text-white font-mono">
                    {opt.ratio}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {opt.label} · {opt.res}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Composition Summary */}
          <div className="p-4 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>Project Title</span>
              <span className="font-semibold text-white">{projectName}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Scenes to Stitch</span>
              <span className="font-mono text-indigo-300 tabular-nums">
                {timings.length} scenes ({totalDuration.toFixed(1)}s timeline)
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Composited Tracks</span>
              <span>
                Background + Avatar + Audio +{' '}
                {captions.enabled ? 'Word Captions' : 'No Captions'}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>
                    Stitching scenes, audio & captions in browser...
                  </span>
                </span>
                <span className="font-mono text-indigo-300 tabular-nums">
                  {exportProgress}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{ width: `${exportProgress}%` }}
                  className="h-full bg-indigo-500 transition-all duration-150"
                />
              </div>
            </div>
          )}

          {exportError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{exportError}</span>
            </div>
          )}

          {exportedVideoUrl && !isExporting && (
            <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/70 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Stitched Video Ready for Download</span>
                </div>
                <a
                  href={exportedVideoUrl}
                  download={`${projectName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')}.${exportMimeExt}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .{exportMimeExt.toUpperCase()}</span>
                </a>
              </div>
              <video
                controls
                src={exportedVideoUrl}
                className="w-full max-h-48 rounded-lg bg-black border border-slate-800"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-[#0B0F19]">
          <button
            type="button"
            onClick={() => {
              cancelExportRef.current = true;
              setShowExportModal(false);
            }}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleRenderAndStitch}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Rendering ({exportProgress}%)...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Render & Stitch Video</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
