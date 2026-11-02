import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import {
  AspectRatioOption,
  AvatarPosition,
  BackgroundType,
  EmotionGesture,
} from '../types/studio';
import {
  buildTtsStylePrompt,
  buildVeoPrompt,
  calculateTimelineOffsets,
} from '../utils/studioLogic';
import {
  Play,
  Pause,
  SkipBack,
  Scissors,
  Copy,
  Trash2,
  Plus,
  Undo2,
  Redo2,
  Sparkles,
  Volume2,
  Video,
  Subtitles,
  Layers,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Upload,
  Wand2,
  GripVertical,
  FolderPlus,
  Minus,
} from 'lucide-react';

const SOLID_BG_SWATCHES = [
  '#0F172A',
  '#111827',
  '#1E1B4B',
  '#064E3B',
  '#31102F',
  '#1E293B',
];

const GRADIENT_BG_PRESETS = [
  {
    label: 'Midnight Indigo',
    value: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
  },
  {
    label: 'Emerald Slate',
    value: 'linear-gradient(135deg, #064E3B 0%, #0F172A 100%)',
  },
  {
    label: 'Carbon Studio',
    value: 'linear-gradient(135deg, #111827 0%, #334155 100%)',
  },
  {
    label: 'Executive Plum',
    value: 'linear-gradient(135deg, #1E1B4B 0%, #3B0764 100%)',
  },
];

export const TimelineEditor: React.FC = () => {
  const projectName = useStudioStore((s) => s.projectName);
  const setProjectName = useStudioStore((s) => s.setProjectName);
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const setShowOnboarding = useStudioStore((s) => s.setShowOnboarding);

  const scenes = useStudioStore((s) => s.scenes);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const selectScene = useStudioStore((s) => s.selectScene);
  const addScene = useStudioStore((s) => s.addScene);
  const updateScene = useStudioStore((s) => s.updateScene);
  const reorderScenes = useStudioStore((s) => s.reorderScenes);
  const splitScene = useStudioStore((s) => s.splitScene);
  const duplicateScene = useStudioStore((s) => s.duplicateScene);
  const deleteScene = useStudioStore((s) => s.deleteScene);
  const trimSceneDuration = useStudioStore((s) => s.trimSceneDuration);

  const avatars = useStudioStore((s) => s.avatars);
  const voices = useStudioStore((s) => s.voices);
  const captions = useStudioStore((s) => s.captions);
  const updateCaptions = useStudioStore((s) => s.updateCaptions);

  const past = useStudioStore((s) => s.past);
  const future = useStudioStore((s) => s.future);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);

  const [inspectorTab, setInspectorTab] = useState<
    'scene' | 'generate' | 'captions'
  >('scene');

  // Playback state across the timeline
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Drag-and-drop scene index
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // AI Background generation state
  const [bgPrompt, setBgPrompt] = useState(
    'Modern architectural broadcast studio with soft warm key light and subtle depth of field'
  );
  const [generatingBg, setGeneratingBg] = useState(false);
  const [inspectorError, setInspectorError] = useState<string | null>(null);

  // Media refs for synchronized preview playback
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const activeAudioSceneIdRef = useRef<string | null>(null);
  const pollTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>(
    {}
  );

  const { timings, totalDuration } = useMemo(
    () => calculateTimelineOffsets(scenes),
    [scenes]
  );

  // Determine which scene corresponds to currentTime when playing, or use selectedSceneId
  const activeTiming = useMemo(() => {
    if (isPlaying) {
      const found = timings.find(
        (t) => currentTime >= t.startTime && currentTime < t.endTime
      );
      if (found) return found;
    }
    return (
      timings.find((t) => t.sceneId === selectedSceneId) ||
      timings[0] || {
        sceneId: '',
        index: 0,
        startTime: 0,
        endTime: 6,
        duration: 6,
      }
    );
  }, [isPlaying, currentTime, timings, selectedSceneId]);

  const currentScene = useMemo(
    () =>
      scenes.find((s) => s.id === activeTiming.sceneId) ||
      scenes.find((s) => s.id === selectedSceneId) ||
      scenes[0],
    [scenes, activeTiming.sceneId, selectedSceneId]
  );

  const selectedScene = useMemo(
    () => scenes.find((s) => s.id === selectedSceneId) || scenes[0],
    [scenes, selectedSceneId]
  );

  const selectedAvatar = useMemo(
    () =>
      avatars.find((a) => a.id === selectedScene?.avatarId) || avatars[0],
    [avatars, selectedScene?.avatarId]
  );

  const previewAvatar = useMemo(
    () =>
      avatars.find((a) => a.id === currentScene?.avatarId) || avatars[0],
    [avatars, currentScene?.avatarId]
  );

  const selectedVoice = useMemo(
    () =>
      voices.find((v) => v.id === selectedScene?.voiceProfileId) || voices[0],
    [voices, selectedScene?.voiceProfileId]
  );

  const constructedVeoPrompt = useMemo(() => {
    if (!selectedScene || !selectedAvatar) return '';
    return buildVeoPrompt({
      avatarName: selectedAvatar.name,
      lookDescription: selectedAvatar.lookDescription,
      outfitVariant: selectedAvatar.outfitVariant,
      emotionGesture: selectedScene.emotionGesture,
      position: selectedScene.avatarPosition,
      scriptText: selectedScene.scriptText,
      backgroundDesc:
        selectedScene.background.prompt ||
        (selectedScene.background.type === 'solid'
          ? `solid ${selectedScene.background.value} studio backdrop`
          : 'clean dark studio backdrop'),
    });
  }, [selectedScene, selectedAvatar]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    const timers = pollTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
  }, []);

  // Playback loop (advances currentTime at 60fps and switches scenes)
  useEffect(() => {
    if (!isPlaying) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (videoPlayerRef.current) {
        videoPlayerRef.current.pause();
      }
      activeAudioSceneIdRef.current = null;
      return;
    }

    let lastTick = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration]);

  // Sync selectedSceneId & trigger scene audio/video when playhead enters a new scene
  useEffect(() => {
    if (!isPlaying || !currentScene) return;
    if (selectedSceneId !== currentScene.id) {
      selectScene(currentScene.id);
    }

    if (activeAudioSceneIdRef.current !== currentScene.id) {
      activeAudioSceneIdRef.current = currentScene.id;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (currentScene.audioUrl) {
        const audio = new Audio(currentScene.audioUrl);
        const voice = voices.find((v) => v.id === currentScene.voiceProfileId);
        audio.playbackRate = voice?.pace || 1.0;
        audioPlayerRef.current = audio;
        audio.play().catch(() => {
          // Ignore autoplay restriction if triggered without gesture
        });
      }
      if (videoPlayerRef.current && currentScene.videoUrl) {
        videoPlayerRef.current.currentTime = 0;
        videoPlayerRef.current.play().catch(() => {});
      }
    }
  }, [
    isPlaying,
    currentScene,
    selectedSceneId,
    selectScene,
    voices,
  ]);

  // Global keyboard shortcuts: Space (Play/Pause), S (Split), Delete/Backspace (Delete Scene)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (selectedSceneId) {
          splitScene(selectedSceneId);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSceneId && scenes.length > 1) {
          e.preventDefault();
          deleteScene(selectedSceneId);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSceneId, scenes.length, splitScene, deleteScene, undo, redo]);

  // Generate Gemini TTS Voiceover for Scene
  const handleGenerateSceneAudio = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const voice =
      voices.find((v) => v.id === scene.voiceProfileId) || voices[0];

    setInspectorError(null);
    updateScene(sceneId, { audioGenerating: true }, false);

    try {
      const stylePrompt = buildTtsStylePrompt({
        tone: voice.tone,
        pace: voice.pace,
        accentNotes: voice.accentNotes,
      });

      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scene.scriptText,
          voiceName: voice.prebuiltVoice,
          stylePrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.audioUrl) {
        throw new Error(data.error || 'Voiceover synthesis failed.');
      }

      updateScene(
        sceneId,
        {
          audioUrl: data.audioUrl,
          audioGenerating: false,
        },
        false
      );
    } catch (err) {
      updateScene(sceneId, { audioGenerating: false }, false);
      setInspectorError(
        err instanceof Error ? err.message : 'Failed to generate scene audio.'
      );
    }
  };

  // Start Asynchronous Veo Clip Generation + Polling
  const handleGenerateVeoClip = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const avatar = avatars.find((a) => a.id === scene.avatarId) || avatars[0];

    setInspectorError(null);

    const veoPrompt = buildVeoPrompt({
      avatarName: avatar.name,
      lookDescription: avatar.lookDescription,
      outfitVariant: avatar.outfitVariant,
      emotionGesture: scene.emotionGesture,
      position: scene.avatarPosition,
      scriptText: scene.scriptText,
      backgroundDesc: scene.background.prompt,
    });

    updateScene(
      sceneId,
      {
        veoStatus: 'queued',
        veoProgress: 12,
        veoError: undefined,
      },
      false
    );

    try {
      const response = await fetch('/api/veo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: veoPrompt,
          avatarImageUrl: avatar.imageUrl,
          aspectRatio,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.interactionId) {
        throw new Error(data.error || 'Could not start Veo video generation.');
      }

      const interactionId: string = data.interactionId;
      updateScene(
        sceneId,
        {
          veoInteractionId: interactionId,
          veoStatus: 'polling',
          veoProgress: 25,
        },
        false
      );

      // Clear any existing poller for this scene
      if (pollTimersRef.current[sceneId]) {
        clearInterval(pollTimersRef.current[sceneId]);
      }

      let pollCount = 0;
      pollTimersRef.current[sceneId] = setInterval(async () => {
        pollCount += 1;
        const simulatedProgress = Math.min(92, 25 + pollCount * 8);

        try {
          const pollRes = await fetch(
            `/api/veo/status/${encodeURIComponent(interactionId)}`
          );
          const pollData = await pollRes.json();

          if (pollData.status === 'completed' && pollData.videoUrl) {
            clearInterval(pollTimersRef.current[sceneId]);
            delete pollTimersRef.current[sceneId];
            updateScene(
              sceneId,
              {
                veoStatus: 'completed',
                veoProgress: 100,
                videoUrl: pollData.videoUrl,
                veoError: undefined,
              },
              false
            );
          } else if (pollData.status === 'failed' || !pollRes.ok) {
            clearInterval(pollTimersRef.current[sceneId]);
            delete pollTimersRef.current[sceneId];
            updateScene(
              sceneId,
              {
                veoStatus: 'error',
                veoProgress: 0,
                veoError:
                  pollData.error ||
                  'Veo generation failed or was blocked by safety filters.',
              },
              false
            );
          } else {
            updateScene(
              sceneId,
              {
                veoStatus: 'polling',
                veoProgress: simulatedProgress,
              },
              false
            );
          }
        } catch {
          // Keep polling on transient network blip up to 35 polls
          if (pollCount > 35) {
            clearInterval(pollTimersRef.current[sceneId]);
            delete pollTimersRef.current[sceneId];
            updateScene(
              sceneId,
              {
                veoStatus: 'error',
                veoProgress: 0,
                veoError: 'Veo polling timed out. Please try regenerating.',
              },
              false
            );
          }
        }
      }, 5000);
    } catch (err) {
      updateScene(
        sceneId,
        {
          veoStatus: 'error',
          veoProgress: 0,
          veoError:
            err instanceof Error ? err.message : 'Veo generation failed.',
        },
        false
      );
    }
  };

  // Generate AI Background Image for Scene
  const handleGenerateAiBackground = async () => {
    if (!selectedScene || !bgPrompt.trim()) return;
    setGeneratingBg(true);
    setInspectorError(null);
    try {
      const response = await fetch('/api/avatars/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookDescription: bgPrompt,
          count: 1,
          aspectRatio:
            aspectRatio === '9:16'
              ? '9:16'
              : aspectRatio === '1:1'
              ? '1:1'
              : '16:9',
          isBackgroundOnly: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.images?.[0]) {
        throw new Error(data.error || 'Could not generate background image.');
      }
      updateScene(selectedScene.id, {
        background: {
          type: 'ai-generated',
          value: data.images[0],
          prompt: bgPrompt.trim(),
        },
      });
    } catch (err) {
      setInspectorError(
        err instanceof Error ? err.message : 'Background generation failed.'
      );
    } finally {
      setGeneratingBg(false);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedScene) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateScene(selectedScene.id, {
          background: {
            type: 'image',
            value: reader.result,
          },
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Compute current word index for live word-by-word caption highlighting
  const sceneWords = useMemo(() => {
    if (!currentScene?.scriptText) return [];
    return currentScene.scriptText.trim().split(/\s+/).filter(Boolean);
  }, [currentScene?.scriptText]);

  const highlightedWordIndex = useMemo(() => {
    if (!sceneWords.length) return -1;
    const elapsedInScene = Math.max(
      0,
      currentTime - (activeTiming?.startTime || 0)
    );
    const progressRatio = Math.min(
      0.999,
      elapsedInScene / Math.max(1, activeTiming?.duration || 6)
    );
    return Math.floor(progressRatio * sceneWords.length);
  }, [sceneWords.length, currentTime, activeTiming]);

  // Avatar position CSS helper inside the preview stage
  const getAvatarStagePositionClasses = (pos: AvatarPosition) => {
    switch (pos) {
      case 'left':
        return 'left-6 bottom-0 items-end justify-start';
      case 'right':
        return 'right-6 bottom-0 items-end justify-end';
      case 'small corner':
        return 'right-5 bottom-5 items-end justify-end';
      case 'center':
      default:
        return 'inset-x-0 bottom-0 items-end justify-center';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden bg-[#0B0F19]">
      {/* Sub-Toolbar: Project Title, New Project Onboarding, Aspect Ratio, Keyboard Shortcuts */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-2.5 bg-[#111827] border-b border-slate-800/90 shrink-0">
        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-64 sm:w-80 px-2.5 py-1 text-sm font-semibold text-white bg-transparent hover:bg-slate-800/60 focus:bg-[#0B0F19] border border-transparent focus:border-slate-700 rounded-md focus:outline-none font-display truncate"
          />

          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#0B0F19] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
            <span>New Project Wizard</span>
          </button>
        </div>

        {/* Aspect Ratio Selector & Shortcut Hints */}
        <div className="flex items-center gap-4">
          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-400">
            <span>Shortcuts:</span>
            <span className="font-mono text-slate-300">Space</span>
            <span>Play/Pause</span>
            <span>·</span>
            <span className="font-mono text-slate-300">S</span>
            <span>Split</span>
            <span>·</span>
            <span className="font-mono text-slate-300">Del</span>
            <span>Delete</span>
          </div>

          <div
            role="group"
            aria-label="Aspect Ratio"
            className="flex items-center gap-1 p-0.5 bg-[#0B0F19] border border-slate-800 rounded-lg"
          >
            {(['16:9', '9:16', '1:1'] as AspectRatioOption[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  aspectRatio === ratio
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upper Workspace: Left/Center Live Preview Canvas + Right Scene Inspector */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Center Stage: Live Composite Video Preview Player (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-between p-5 bg-[#0B0F19] border-b lg:border-b-0 lg:border-r border-slate-800/80 overflow-hidden">
          {/* Top Stage Info Bar */}
          <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2 shrink-0">
            <div>
              <span className="font-semibold text-slate-200">
                Live Composite Preview
              </span>
              <span className="mx-2">·</span>
              <span>
                Scene 0{(activeTiming?.index ?? 0) + 1} of {scenes.length}
              </span>
              <span className="mx-2">·</span>
              <span className="text-indigo-300">{previewAvatar?.name}</span>
            </div>
            <div className="font-mono tabular-nums text-slate-300">
              {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
            </div>
          </div>

          {/* Aspect-Ratio Stage Container */}
          <div className="flex-1 w-full flex items-center justify-center min-h-0 overflow-hidden py-1">
            <div
              data-testid="live-preview-stage"
              style={{
                background:
                  currentScene?.background.type === 'solid' ||
                  currentScene?.background.type === 'gradient'
                    ? currentScene.background.value
                    : '#0F172A',
              }}
              className={`relative overflow-hidden rounded-xl border border-slate-800 shadow-2xl transition-all ${
                aspectRatio === '16:9'
                  ? 'aspect-video w-full max-w-[640px] max-h-full'
                  : aspectRatio === '9:16'
                  ? 'aspect-[9/16] h-full max-h-[380px]'
                  : 'aspect-square h-full max-h-[380px]'
              }`}
            >
              {/* Background Image Layer if image or ai-generated */}
              {(currentScene?.background.type === 'image' ||
                currentScene?.background.type === 'ai-generated') &&
                currentScene.background.value && (
                  <img
                    src={currentScene.background.value}
                    alt="Scene background"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

              {/* Subtle Studio Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20 pointer-events-none" />

              {/* Avatar Video or Reference Frame Layer */}
              {currentScene?.videoUrl ? (
                <video
                  ref={videoPlayerRef}
                  src={currentScene.videoUrl}
                  loop
                  playsInline
                  muted={Boolean(currentScene.audioUrl)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                previewAvatar && (
                  <div
                    className={`absolute flex pointer-events-none transition-all duration-200 ${getAvatarStagePositionClasses(
                      currentScene?.avatarPosition || 'center'
                    )}`}
                  >
                    <div
                      style={{
                        transform: `scale(${
                          currentScene?.avatarScale || 1.0
                        }) ${
                          isPlaying ? 'translateY(-2px)' : 'translateY(0px)'
                        }`,
                        transformOrigin: 'bottom center',
                      }}
                      className={`overflow-hidden transition-transform ${
                        currentScene?.avatarPosition === 'small corner'
                          ? 'w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-indigo-400 shadow-xl'
                          : 'w-44 h-44 sm:w-56 sm:h-56 rounded-t-2xl border-x border-t border-white/15 shadow-2xl'
                      }`}
                    >
                      <img
                        src={previewAvatar.imageUrl}
                        alt={previewAvatar.name}
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-cover ${
                          isPlaying ? 'scale-[1.02]' : 'scale-100'
                        } transition-transform duration-300`}
                      />
                    </div>
                  </div>
                )
              )}

              {/* Top-left Metadata Overlay & Direct Lip-Sync Trigger */}
              <div className="absolute top-3 left-3.5 right-3.5 flex items-center justify-between gap-2 text-[11px] text-slate-200/90 drop-shadow">
                <span className="pointer-events-none truncate">
                  {previewAvatar?.name} · {currentScene?.emotionGesture}
                </span>
                {currentScene?.videoUrl ? (
                  <span className="font-mono text-emerald-300 pointer-events-none shrink-0">
                    Veo Talking Video Active
                  </span>
                ) : currentScene?.veoStatus === 'queued' ||
                  currentScene?.veoStatus === 'polling' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/90 border border-indigo-500/60 font-mono text-indigo-200 shrink-0">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Generating Lip-Sync ({currentScene.veoProgress}%)</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (currentScene) {
                        selectScene(currentScene.id);
                        setInspectorTab('generate');
                        handleGenerateVeoClip(currentScene.id);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-600/95 hover:bg-indigo-500 text-white font-semibold shadow-lg transition-colors cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Static Photo · Click to Generate Lip-Sync Video</span>
                  </button>
                )}
              </div>

              {/* Captions Overlay */}
              {captions.enabled && sceneWords.length > 0 && (
                <div
                  className={`absolute inset-x-4 flex justify-center pointer-events-none ${
                    captions.position === 'top'
                      ? 'top-10'
                      : captions.position === 'center'
                      ? 'top-1/2 -translate-y-1/2'
                      : 'bottom-4'
                  }`}
                >
                  <div
                    style={{
                      fontFamily: captions.fontFamily,
                      backgroundColor: captions.backgroundColor,
                    }}
                    className={`px-4 py-2 rounded-lg max-w-[92%] text-center backdrop-blur-xs border border-white/10 leading-snug ${
                      captions.fontSize === 'sm'
                        ? 'text-xs'
                        : captions.fontSize === 'lg'
                        ? 'text-base font-semibold'
                        : 'text-sm font-medium'
                    }`}
                  >
                    {sceneWords.map((word, wIdx) => {
                      const isCurrent =
                        captions.highlightCurrentWord &&
                        wIdx === highlightedWordIndex;
                      return (
                        <span
                          key={wIdx}
                          style={{
                            color: isCurrent
                              ? captions.highlightColor
                              : captions.textColor,
                          }}
                          className={`inline-block mr-1.5 transition-colors ${
                            isCurrent ? 'font-bold underline decoration-2' : ''
                          }`}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Player Transport & Scrubber Bar */}
          <div className="w-full max-w-2xl flex items-center gap-3 pt-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const nextState = !isPlaying;
                if (nextState && currentTime >= totalDuration - 0.2) {
                  setCurrentTime(0);
                }
                setIsPlaying(nextState);
              }}
              aria-label={isPlaying ? 'Pause Preview' : 'Play Preview'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shrink-0 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(0);
                if (scenes[0]) selectScene(scenes[0].id);
              }}
              aria-label="Restart Preview from Beginning"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <input
              type="range"
              aria-label="Timeline Playhead Scrubber"
              min={0}
              max={Math.max(1, totalDuration)}
              step={0.1}
              value={Math.min(currentTime, totalDuration)}
              onChange={(e) => {
                const nextVal = parseFloat(e.target.value);
                setCurrentTime(nextVal);
                const targetScene = timings.find(
                  (t) => nextVal >= t.startTime && nextVal <= t.endTime
                );
                if (targetScene) {
                  selectScene(targetScene.sceneId);
                }
              }}
              className="flex-1 accent-indigo-500 cursor-pointer"
            />

            <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
              {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Right Panel: Scene Inspector, Veo Generation & Captions Style (5 Columns) */}
        <div className="lg:col-span-5 flex flex-col bg-[#111827] min-h-0 overflow-hidden">
          {/* Inspector Segmented Tabs */}
          <div className="grid grid-cols-3 p-2 gap-1 bg-[#0B0F19] border-b border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setInspectorTab('scene')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                inspectorTab === 'scene'
                  ? 'bg-[#111827] text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scene Setup
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('generate')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                inspectorTab === 'generate'
                  ? 'bg-[#111827] text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Veo & Voice AI
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('captions')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                inspectorTab === 'captions'
                  ? 'bg-[#111827] text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Captions Style
            </button>
          </div>

          {/* Inspector Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {inspectorError && (
              <div className="flex items-start justify-between gap-2.5 p-3 rounded-lg bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{inspectorError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectorError(null)}
                  className="text-rose-300 hover:text-white underline shrink-0 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}

            {selectedScene && inspectorTab === 'scene' && (
              <div className="space-y-4">
                {/* Scene Script Line */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label
                      htmlFor="inspector-scene-script"
                      className="font-medium text-slate-300"
                    >
                      Spoken Line for Scene 0
                      {scenes.findIndex((s) => s.id === selectedScene.id) + 1}
                    </label>
                    <span className="font-mono text-indigo-300 tabular-nums">
                      {selectedScene.durationSeconds.toFixed(1)}s
                    </span>
                  </div>
                  <textarea
                    id="inspector-scene-script"
                    rows={3}
                    value={selectedScene.scriptText}
                    onChange={(e) =>
                      updateScene(selectedScene.id, {
                        scriptText: e.target.value,
                      })
                    }
                    className="w-full p-3 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-slate-100 leading-relaxed focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Avatar & Voice Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="inspector-avatar-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Scene Avatar
                    </label>
                    <select
                      id="inspector-avatar-select"
                      value={selectedScene.avatarId}
                      onChange={(e) =>
                        updateScene(selectedScene.id, {
                          avatarId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {avatars.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="inspector-voice-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Voice Profile
                    </label>
                    <select
                      id="inspector-voice-select"
                      value={selectedScene.voiceProfileId}
                      onChange={(e) =>
                        updateScene(selectedScene.id, {
                          voiceProfileId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name.includes(v.prebuiltVoice)
                            ? v.name
                            : `${v.name} (${v.prebuiltVoice})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Gesture / Emotion & Position */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="inspector-gesture-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Emotion & Gesture (Feeds Veo)
                    </label>
                    <select
                      id="inspector-gesture-select"
                      value={selectedScene.emotionGesture}
                      onChange={(e) =>
                        updateScene(selectedScene.id, {
                          emotionGesture: e.target.value as EmotionGesture,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="neutral">Neutral & Poised</option>
                      <option value="smiling">Warm & Smiling</option>
                      <option value="serious">Serious & Authoritative</option>
                      <option value="explaining with hand gestures">
                        Explaining with Hand Gestures
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="inspector-position-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Avatar Position / Framing
                    </label>
                    <select
                      id="inspector-position-select"
                      value={selectedScene.avatarPosition}
                      onChange={(e) =>
                        updateScene(selectedScene.id, {
                          avatarPosition: e.target.value as AvatarPosition,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="center">Center Stage</option>
                      <option value="left">Left Third</option>
                      <option value="right">Right Third</option>
                      <option value="small corner">Small Corner PiP</option>
                    </select>
                  </div>
                </div>

                {/* Avatar Scale Slider */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label
                      htmlFor="inspector-scale-range"
                      className="font-medium text-slate-300"
                    >
                      Avatar Scale
                    </label>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {Math.round(selectedScene.avatarScale * 100)}%
                    </span>
                  </div>
                  <input
                    id="inspector-scale-range"
                    type="range"
                    min={0.6}
                    max={1.2}
                    step={0.05}
                    value={selectedScene.avatarScale}
                    onChange={(e) =>
                      updateScene(
                        selectedScene.id,
                        { avatarScale: parseFloat(e.target.value) },
                        false
                      )
                    }
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Scene Background Controls */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">
                      Scene Background
                    </span>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'solid', label: 'Solid' },
                          { id: 'gradient', label: 'Gradient' },
                          { id: 'image', label: 'Upload' },
                          { id: 'ai-generated', label: 'AI Studio' },
                        ] as { id: BackgroundType; label: string }[]
                      ).map((bType) => (
                        <button
                          key={bType.id}
                          type="button"
                          onClick={() =>
                            updateScene(selectedScene.id, {
                              background: {
                                ...selectedScene.background,
                                type: bType.id,
                                value:
                                  bType.id === 'solid'
                                    ? '#0F172A'
                                    : bType.id === 'gradient'
                                    ? GRADIENT_BG_PRESETS[0].value
                                    : selectedScene.background.value,
                              },
                            })
                          }
                          className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                            selectedScene.background.type === bType.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-[#0B0F19] text-slate-400 hover:text-white'
                          }`}
                        >
                          {bType.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedScene.background.type === 'solid' && (
                    <div className="flex items-center gap-2">
                      {SOLID_BG_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            updateScene(selectedScene.id, {
                              background: { type: 'solid', value: hex },
                            })
                          }
                          aria-label={`Select background color ${hex}`}
                          style={{ backgroundColor: hex }}
                          className={`w-7 h-7 rounded-md border ${
                            selectedScene.background.value === hex
                              ? 'border-white ring-2 ring-indigo-500'
                              : 'border-slate-700'
                          } cursor-pointer`}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Custom Background Hex Color"
                        value={
                          selectedScene.background.value.startsWith('#')
                            ? selectedScene.background.value
                            : '#0F172A'
                        }
                        onChange={(e) =>
                          updateScene(selectedScene.id, {
                            background: {
                              type: 'solid',
                              value: e.target.value,
                            },
                          })
                        }
                        className="w-8 h-7 bg-transparent cursor-pointer"
                      />
                    </div>
                  )}

                  {selectedScene.background.type === 'gradient' && (
                    <div className="grid grid-cols-2 gap-2">
                      {GRADIENT_BG_PRESETS.map((g) => (
                        <button
                          key={g.label}
                          type="button"
                          onClick={() =>
                            updateScene(selectedScene.id, {
                              background: { type: 'gradient', value: g.value },
                            })
                          }
                          style={{ background: g.value }}
                          className={`p-2 text-left text-xs font-medium text-white rounded-lg border ${
                            selectedScene.background.value === g.value
                              ? 'border-indigo-400'
                              : 'border-slate-800'
                          } cursor-pointer`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedScene.background.type === 'image' && (
                    <label
                      htmlFor="scene-bg-upload"
                      className="flex items-center justify-center gap-2 p-3 bg-[#0B0F19] border border-dashed border-slate-700 hover:border-indigo-500 rounded-lg text-xs text-slate-300 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-indigo-400" />
                      <span>Upload Custom Background Image</span>
                      <input
                        id="scene-bg-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundUpload}
                        className="sr-only"
                      />
                    </label>
                  )}

                  {selectedScene.background.type === 'ai-generated' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        aria-label="AI Background Prompt"
                        value={bgPrompt}
                        onChange={(e) => setBgPrompt(e.target.value)}
                        placeholder="Describe studio background environment..."
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white"
                      />
                      <button
                        type="button"
                        disabled={generatingBg}
                        onClick={handleGenerateAiBackground}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg cursor-pointer"
                      >
                        {generatingBg ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating Background...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>Generate Scene Background (Gemini Image)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedScene && inspectorTab === 'generate' && (
              <div className="space-y-4">
                {/* Cost & Time Transparency Notice */}
                <div className="p-3.5 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Generation Time & Quota Notice</span>
                    </span>
                    <span className="font-mono">~45–90s / clip</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Veo (<span className="font-mono text-slate-300">gemini-omni-1.1-flash</span>)
                    image-to-video synthesis runs asynchronously and consumes
                    paid video generation quota. Generate voiceovers first to
                    verify timing before rendering Veo video clips.
                  </p>
                </div>

                {/* Step 1: Gemini TTS Voiceover Synthesis */}
                <div className="p-4 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-white">
                        1. Scene Voiceover (Gemini TTS)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Voice: {selectedVoice?.name} · Tone:{' '}
                        {selectedVoice?.tone}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(selectedScene.audioGenerating)}
                      onClick={() => handleGenerateSceneAudio(selectedScene.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                    >
                      {selectedScene.audioGenerating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Synthesizing...</span>
                        </>
                      ) : selectedScene.audioUrl ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Regenerate Audio</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Generate Voiceover</span>
                        </>
                      )}
                    </button>
                  </div>

                  {selectedScene.audioUrl && (
                    <audio
                      controls
                      src={selectedScene.audioUrl}
                      className="w-full h-8"
                    />
                  )}
                </div>

                {/* Step 2: Veo Image-to-Video Generation */}
                <div className="p-4 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-white">
                        2. Talking Avatar Video (Veo Image-to-Video)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Uses {selectedAvatar?.name}&apos;s reference frame +
                        look description
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        selectedScene.veoStatus === 'queued' ||
                        selectedScene.veoStatus === 'polling'
                      }
                      onClick={() => handleGenerateVeoClip(selectedScene.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {selectedScene.veoStatus === 'queued' ||
                      selectedScene.veoStatus === 'polling' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>
                            Polling ({selectedScene.veoProgress}%)
                          </span>
                        </>
                      ) : selectedScene.videoUrl ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Regenerate Veo Clip</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate Veo Clip</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Progress Indicator */}
                  {(selectedScene.veoStatus === 'queued' ||
                    selectedScene.veoStatus === 'polling') && (
                    <div className="space-y-1.5">
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${selectedScene.veoProgress}%` }}
                          className="h-full bg-indigo-500 transition-all duration-300"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Asynchronous Veo operation in progress... polling status
                        every 5s
                      </p>
                    </div>
                  )}

                  {selectedScene.veoStatus === 'completed' &&
                    selectedScene.videoUrl && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          Veo talking-avatar video clip generated and composited
                          in player.
                        </span>
                      </div>
                    )}

                  {selectedScene.veoStatus === 'error' &&
                    selectedScene.veoError && (
                      <div className="flex items-start gap-2 p-2.5 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{selectedScene.veoError}</span>
                      </div>
                    )}

                  {/* Constructed Veo Consistency Prompt Preview */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <span className="text-[11px] font-medium text-slate-400">
                      Constructed Veo Prompt (Look + Framing + Gesture + Line):
                    </span>
                    <p className="p-2.5 rounded bg-[#111827] border border-slate-800/90 text-[11px] text-slate-300 font-mono leading-relaxed select-all">
                      {constructedVeoPrompt}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {inspectorTab === 'captions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-lg bg-[#0B0F19] border border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Show Scene Captions
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Auto-generated from each scene&apos;s script text
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Enable Captions"
                    checked={captions.enabled}
                    onChange={(e) =>
                      updateCaptions({ enabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg bg-[#0B0F19] border border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Highlight Current Spoken Word
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Dynamic karaoke word emphasis synchronized to scene timer
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Highlight Current Spoken Word"
                    checked={captions.highlightCurrentWord}
                    onChange={(e) =>
                      updateCaptions({
                        highlightCurrentWord: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="caption-font-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Font Family
                    </label>
                    <select
                      id="caption-font-select"
                      value={captions.fontFamily}
                      onChange={(e) =>
                        updateCaptions({
                          fontFamily: e.target
                            .value as typeof captions.fontFamily,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white"
                    >
                      <option value="Plus Jakarta Sans">
                        Plus Jakarta Sans
                      </option>
                      <option value="DM Sans">DM Sans</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="caption-size-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Font Size
                    </label>
                    <select
                      id="caption-size-select"
                      value={captions.fontSize}
                      onChange={(e) =>
                        updateCaptions({
                          fontSize: e.target.value as 'sm' | 'md' | 'lg',
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white"
                    >
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="caption-position-select"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Vertical Position
                    </label>
                    <select
                      id="caption-position-select"
                      value={captions.position}
                      onChange={(e) =>
                        updateCaptions({
                          position: e.target.value as
                            | 'bottom'
                            | 'center'
                            | 'top',
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-white"
                    >
                      <option value="bottom">Bottom</option>
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="caption-text-color"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Text Color
                    </label>
                    <input
                      id="caption-text-color"
                      type="color"
                      value={captions.textColor}
                      onChange={(e) =>
                        updateCaptions({ textColor: e.target.value })
                      }
                      className="w-full h-8 rounded bg-[#0B0F19] border border-slate-800 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="caption-highlight-color"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Active Word Color
                    </label>
                    <input
                      id="caption-highlight-color"
                      type="color"
                      value={captions.highlightColor}
                      onChange={(e) =>
                        updateCaptions({ highlightColor: e.target.value })
                      }
                      className="w-full h-8 rounded bg-[#0B0F19] border border-slate-800 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Workspace: Multi-Track Horizontal Timeline */}
      <div className="h-[255px] bg-[#0B0F19] border-t border-slate-800 flex flex-col shrink-0">
        {/* Timeline Action Toolbar */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-[#111827] border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={addScene}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Scene</span>
            </button>

            <button
              type="button"
              disabled={!selectedScene}
              onClick={() => selectedScene && splitScene(selectedScene.id)}
              title="Split Scene at Midpoint (Shortcut: S)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-200 hover:text-white bg-[#0B0F19] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5 text-indigo-400" />
              <span>Split (S)</span>
            </button>

            <button
              type="button"
              disabled={!selectedScene}
              onClick={() => selectedScene && duplicateScene(selectedScene.id)}
              title="Duplicate Selected Scene"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-200 hover:text-white bg-[#0B0F19] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Duplicate</span>
            </button>

            <button
              type="button"
              disabled={!selectedScene || scenes.length <= 1}
              onClick={() => selectedScene && deleteScene(selectedScene.id)}
              title="Delete Selected Scene (Shortcut: Del)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-200 hover:text-rose-400 bg-[#0B0F19] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 disabled:pointer-events-none rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            {/* Trim Controls */}
            {selectedScene && (
              <div className="hidden sm:flex items-center gap-1 pl-2 ml-1 border-l border-slate-800">
                <span className="text-slate-400 mr-1">Trim:</span>
                <button
                  type="button"
                  onClick={() => trimSceneDuration(selectedScene.id, -0.5)}
                  aria-label="Trim Scene Duration by -0.5s"
                  className="p-1 text-slate-300 hover:text-white bg-[#0B0F19] border border-slate-800 rounded cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="font-mono text-indigo-300 px-1.5 tabular-nums">
                  {selectedScene.durationSeconds.toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={() => trimSceneDuration(selectedScene.id, 0.5)}
                  aria-label="Extend Scene Duration by +0.5s"
                  className="p-1 text-slate-300 hover:text-white bg-[#0B0F19] border border-slate-800 rounded cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Undo / Redo & Total Timeline Summary */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={past.length === 0}
              onClick={undo}
              aria-label="Undo Timeline Edit"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-slate-300 hover:text-white bg-[#0B0F19] border border-slate-800 disabled:opacity-40 disabled:pointer-events-none rounded-md cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>

            <button
              type="button"
              disabled={future.length === 0}
              onClick={redo}
              aria-label="Redo Timeline Edit"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-slate-300 hover:text-white bg-[#0B0F19] border border-slate-800 disabled:opacity-40 disabled:pointer-events-none rounded-md cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>

            <span className="text-slate-400 font-mono tabular-nums pl-2 border-l border-slate-800">
              {scenes.length} Scenes · {totalDuration.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* 4 Horizontal Synchronized Tracks */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="min-w-[780px] divide-y divide-slate-800/70">
            {/* Track 1: Video (Scenes) */}
            <div className="flex items-stretch min-h-[62px]">
              <div className="w-40 px-3.5 py-2 bg-[#111827] border-r border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-300 shrink-0">
                <Video className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Video (Scenes)</span>
              </div>
              <div className="flex-1 flex items-stretch gap-2 p-2 bg-[#0B0F19]">
                {scenes.map((scene, idx) => {
                  const isSelected = scene.id === selectedSceneId;
                  const av =
                    avatars.find((a) => a.id === scene.avatarId) || avatars[0];
                  const timing = timings[idx];
                  const widthFlex = Math.max(1, scene.durationSeconds);

                  return (
                    <div
                      key={scene.id}
                      draggable
                      onDragStart={() => setDraggedIndex(idx)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverIndex(idx);
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDrop={() => {
                        if (draggedIndex !== null && draggedIndex !== idx) {
                          reorderScenes(draggedIndex, idx);
                        }
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onClick={() => {
                        selectScene(scene.id);
                        if (timing) setCurrentTime(timing.startTime);
                      }}
                      style={{ flex: `${widthFlex} 1 0%` }}
                      className={`group relative rounded-lg p-2 border transition-all cursor-pointer flex items-center gap-2.5 basis-0 overflow-hidden min-w-[140px] ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500'
                          : dragOverIndex === idx
                          ? 'bg-slate-800/80 border-indigo-400 border-dashed'
                          : 'bg-[#111827] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0 cursor-grab" />
                      <img
                        src={av?.imageUrl}
                        alt={av?.name}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded object-cover border border-slate-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 text-xs">
                          <span className="font-semibold text-white truncate">
                            0{idx + 1}. {av?.name}
                          </span>
                          <span className="font-mono text-[11px] text-indigo-300 tabular-nums shrink-0">
                            {scene.durationSeconds.toFixed(1)}s
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                          <span className="truncate">{scene.emotionGesture}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-1">
                            {scene.veoStatus === 'completed'
                              ? 'Veo Ready'
                              : scene.veoStatus === 'polling'
                              ? `${scene.veoProgress}%`
                              : 'Ref'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Track 2: Audio (Voiceover) */}
            <div className="flex items-stretch min-h-[42px]">
              <div className="w-40 px-3.5 py-2 bg-[#111827] border-r border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-300 shrink-0">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Audio (Voiceover)</span>
              </div>
              <div className="flex-1 flex items-stretch gap-2 px-2 py-1.5 bg-[#0B0F19]">
                {scenes.map((scene) => {
                  const voice =
                    voices.find((v) => v.id === scene.voiceProfileId) ||
                    voices[0];
                  return (
                    <div
                      key={`audio-${scene.id}`}
                      onClick={() => {
                        selectScene(scene.id);
                        setInspectorTab('generate');
                      }}
                      style={{ flex: `${Math.max(1, scene.durationSeconds)} 1 0%` }}
                      className={`px-2.5 py-1 rounded border text-[11px] flex items-center justify-between gap-2 basis-0 overflow-hidden min-w-[140px] cursor-pointer ${
                        scene.audioUrl
                          ? 'bg-emerald-950/25 border-emerald-800/60 text-emerald-200'
                          : 'bg-[#111827] border-slate-800/90 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="truncate">
                        {voice?.prebuiltVoice} · {voice?.tone}
                      </span>
                      <span className="font-mono text-[10px] shrink-0">
                        {scene.audioGenerating
                          ? 'Synthesizing...'
                          : scene.audioUrl
                          ? 'WAV Ready'
                          : 'TTS Ready'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Track 3: Captions */}
            <div className="flex items-stretch min-h-[42px]">
              <div className="w-40 px-3.5 py-2 bg-[#111827] border-r border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-300 shrink-0">
                <Subtitles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Captions</span>
              </div>
              <div className="flex-1 flex items-stretch gap-2 px-2 py-1.5 bg-[#0B0F19]">
                {scenes.map((scene) => (
                  <div
                    key={`cap-${scene.id}`}
                    onClick={() => {
                      selectScene(scene.id);
                      setInspectorTab('captions');
                    }}
                    style={{ flex: `${Math.max(1, scene.durationSeconds)} 1 0%` }}
                    className={`px-2.5 py-1 rounded border text-[11px] flex items-center justify-between gap-2 basis-0 overflow-hidden min-w-[140px] cursor-pointer ${
                      captions.enabled
                        ? 'bg-[#111827] border-slate-800 text-slate-300'
                        : 'bg-[#0B0F19] border-slate-900 text-slate-600'
                    }`}
                  >
                    <span className="truncate min-w-0">
                      &ldquo;{scene.scriptText}&rdquo;
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Track 4: Background / Overlay */}
            <div className="flex items-stretch min-h-[42px]">
              <div className="w-40 px-3.5 py-2 bg-[#111827] border-r border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-300 shrink-0">
                <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Background / Frame</span>
              </div>
              <div className="flex-1 flex items-stretch gap-2 px-2 py-1.5 bg-[#0B0F19]">
                {scenes.map((scene) => (
                  <div
                    key={`bg-${scene.id}`}
                    onClick={() => {
                      selectScene(scene.id);
                      setInspectorTab('scene');
                    }}
                    style={{ flex: `${Math.max(1, scene.durationSeconds)} 1 0%` }}
                    className="px-2.5 py-1 rounded bg-[#111827] border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between gap-2 basis-0 overflow-hidden min-w-[140px] cursor-pointer hover:border-slate-700"
                  >
                    <span className="truncate capitalize">
                      {scene.background.type} BG
                    </span>
                    <span className="font-mono text-[10px] text-slate-300 capitalize shrink-0">
                      {scene.avatarPosition}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
