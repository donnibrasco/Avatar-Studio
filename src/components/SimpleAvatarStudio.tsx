import React, { useEffect, useRef, useState } from 'react';
import { PrebuiltVoiceName } from '../types/studio';
import { buildVeoPrompt, estimateDurationSeconds } from '../utils/studioLogic';
import {
  Upload,
  Volume2,
  Sparkles,
  Play,
  Square,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Clock,
  Subtitles,
  SlidersHorizontal,
  Monitor,
  Smartphone,
  Check,
  Film,
} from 'lucide-react';

interface SamplePreset {
  id: string;
  name: string;
  role: string;
  frameUrl: string;
  lookDescription: string;
  voiceStyle: string;
  recommendedVoice: PrebuiltVoiceName;
  backdropGradient: string;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'preset-elena',
    name: 'Elena Vance',
    role: 'Executive Keynote',
    frameUrl: '/src/assets/images/avatar_elena_vance_1792896875897.jpg',
    lookDescription:
      'Confident woman in her early 30s with shoulder-length dark chestnut hair, wearing a tailored charcoal blazer over a white crew-neck top in a dark slate studio',
    voiceStyle:
      'Warm, poised executive broadcast delivery at a natural conversational pace',
    recommendedVoice: 'Kore',
    backdropGradient: 'from-slate-900 via-indigo-950/60 to-slate-950',
  },
  {
    id: 'preset-marcus',
    name: 'Marcus Chen',
    role: 'Product Walkthrough',
    frameUrl: '/src/assets/images/avatar_marcus_chen_1792896876225.jpg',
    lookDescription:
      'East Asian man in his late 30s with short black hair and rectangular glasses, wearing a navy merino sweater over a collared shirt',
    voiceStyle:
      'Energetic, approachable founder delivery with clear articulation',
    recommendedVoice: 'Puck',
    backdropGradient: 'from-slate-900 via-sky-950/50 to-slate-950',
  },
  {
    id: 'preset-sofia',
    name: 'Sofia Rossi',
    role: 'Brand & Onboarding',
    frameUrl: '/src/assets/images/avatar_sofia_rossi_1792896877384.jpg',
    lookDescription:
      'Woman in her late 20s with wavy auburn hair and emerald green silk blouse in soft studio lighting',
    voiceStyle: 'Calm, articulate, welcoming narrator cadence',
    recommendedVoice: 'Zephyr',
    backdropGradient: 'from-slate-900 via-emerald-950/50 to-slate-950',
  },
];

const VOICE_CHOICES: {
  name: PrebuiltVoiceName;
  label: string;
  tagline: string;
}[] = [
  { name: 'Kore', label: 'Kore', tagline: 'Balanced & Executive' },
  { name: 'Puck', label: 'Puck', tagline: 'Upbeat & Conversational' },
  { name: 'Zephyr', label: 'Zephyr', tagline: 'Warm & Articulate' },
  { name: 'Charon', label: 'Charon', tagline: 'Deep & Narrator' },
  { name: 'Fenrir', label: 'Fenrir', tagline: 'Direct & Resonant' },
];

export interface GeneratedClipItem {
  id: string;
  scriptText: string;
  videoUrl?: string;
  audioUrl?: string;
  frameUrl: string;
  aspectRatio: '16:9' | '9:16';
  createdAt: string;
}

export const SimpleAvatarStudio: React.FC = () => {
  // Active Left Panel Section ('create' | 'avatars' | 'voices' | 'history')
  const [activeSection, setActiveSection] = useState<
    'create' | 'avatars' | 'voices' | 'history'
  >('create');

  // Avatar & Uploaded Sample Video state
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    SAMPLE_PRESETS[0].id
  );
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [referenceFrameUrl, setReferenceFrameUrl] = useState<string>(
    SAMPLE_PRESETS[0].frameUrl
  );
  const [lookDescription, setLookDescription] = useState<string>(
    SAMPLE_PRESETS[0].lookDescription
  );
  const [voiceStyle, setVoiceStyle] = useState<string>(
    SAMPLE_PRESETS[0].voiceStyle
  );
  const [analyzingSample, setAnalyzingSample] = useState<boolean>(false);
  const [showAdvancedTuning, setShowAdvancedTuning] = useState<boolean>(false);

  // Script & Voice state
  const [topicPrompt, setTopicPrompt] = useState<string>('');
  const [spokenScript, setSpokenScript] = useState<string>(
    'Welcome to our product keynote. Today I will show you how our team turns any script and sample video into a lifelike presenter broadcast.'
  );
  const [voiceName, setVoiceName] = useState<PrebuiltVoiceName>('Kore');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'5s' | '10s'>('5s');
  const [showCaptions, setShowCaptions] = useState<boolean>(true);

  const [writingScript, setWritingScript] = useState<boolean>(false);
  const [previewingVoice, setPreviewingVoice] = useState<boolean>(false);
  const [playingVoicePreview, setPlayingVoicePreview] =
    useState<boolean>(false);

  // Generation & Output state
  const [genStage, setGenStage] = useState<
    'idle' | 'tts' | 'veo' | 'completed' | 'error'
  >('idle');
  const [genProgress, setGenProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(
    null
  );
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null
  );
  const [isPlayingResult, setIsPlayingResult] = useState<boolean>(false);
  const [history, setHistory] = useState<GeneratedClipItem[]>([]);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const resultVideoRef = useRef<HTMLVideoElement | null>(null);
  const resultAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const currentPreset =
    SAMPLE_PRESETS.find((p) => p.id === selectedPresetId) || SAMPLE_PRESETS[0];

  const handleSelectPreset = (preset: SamplePreset) => {
    setSelectedPresetId(preset.id);
    setUploadedVideoUrl(null);
    setUploadedFileName(null);
    setReferenceFrameUrl(preset.frameUrl);
    setLookDescription(preset.lookDescription);
    setVoiceStyle(preset.voiceStyle);
    setVoiceName(preset.recommendedVoice);
    setErrorMessage(null);
  };

  // Upload a Sample Video (.mp4, .webm, .mov) or Photo
  const handleSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setUploadedFileName(file.name);
    setSelectedPresetId('custom');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          setUploadedVideoUrl(null);
          setReferenceFrameUrl(reader.result);
          await analyzeUploadedSample(reader.result, undefined);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setUploadedVideoUrl(objectUrl);

    const videoDataUrlPromise = new Promise<string | undefined>((resolve) => {
      if (file.size > 12 * 1024 * 1024) {
        resolve(undefined);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });

    const frameDataUrlPromise = new Promise<string | null>((resolve) => {
      const tempVideo = document.createElement('video');
      tempVideo.src = objectUrl;
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.crossOrigin = 'anonymous';

      const captureFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = tempVideo.videoWidth || 720;
          canvas.height = tempVideo.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
            return;
          }
        } catch {
          // Ignore canvas capture error
        }
        resolve(null);
      };

      tempVideo.onloadeddata = () => {
        tempVideo.currentTime = Math.min(0.5, (tempVideo.duration || 1) * 0.2);
      };
      tempVideo.onseeked = captureFrame;
      tempVideo.onerror = () => resolve(null);
    });

    const [capturedFrame, videoDataUrl] = await Promise.all([
      frameDataUrlPromise,
      videoDataUrlPromise,
    ]);

    if (capturedFrame) {
      setReferenceFrameUrl(capturedFrame);
    }

    await analyzeUploadedSample(
      capturedFrame || referenceFrameUrl,
      videoDataUrl
    );
  };

  const analyzeUploadedSample = async (
    frameDataUrl?: string,
    videoDataUrl?: string
  ) => {
    setAnalyzingSample(true);
    try {
      const response = await fetch('/api/sample/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameDataUrl, videoDataUrl }),
      });
      const data = await response.json();
      if (response.ok) {
        if (data.lookDescription) setLookDescription(data.lookDescription);
        if (data.voiceStyle) setVoiceStyle(data.voiceStyle);
        if (data.recommendedVoice) setVoiceName(data.recommendedVoice);
      }
    } catch {
      // Keep existing look & voice style if analysis fails
    } finally {
      setAnalyzingSample(false);
    }
  };

  const handleWriteScriptFromPrompt = async () => {
    if (!topicPrompt.trim() && !spokenScript.trim()) return;
    setWritingScript(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/script/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicPrompt.trim() || undefined,
          text: spokenScript.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.script) {
        throw new Error(data.error || 'Could not generate script.');
      }
      setSpokenScript(data.script);
      setTopicPrompt('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Script generation failed.'
      );
    } finally {
      setWritingScript(false);
    }
  };

  const handlePreviewVoice = async () => {
    if (playingVoicePreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPlayingVoicePreview(false);
      return;
    }

    if (!spokenScript.trim()) {
      setErrorMessage('Please enter what the avatar should say first.');
      return;
    }

    setPreviewingVoice(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: spokenScript.trim(),
          voiceName,
          stylePrompt: voiceStyle,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.audioUrl) {
        throw new Error(data.error || 'Voice preview failed.');
      }
      setGeneratedAudioUrl(data.audioUrl);
      const audio = new Audio(data.audioUrl);
      previewAudioRef.current = audio;
      setPlayingVoicePreview(true);
      audio.onended = () => setPlayingVoicePreview(false);
      audio.onerror = () => setPlayingVoicePreview(false);
      await audio.play();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not synthesize voice.'
      );
    } finally {
      setPreviewingVoice(false);
    }
  };

  const handleGenerateAvatarVideo = async () => {
    if (!spokenScript.trim()) {
      setErrorMessage('Please enter the script for your avatar to speak.');
      return;
    }

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    setErrorMessage(null);
    setGenStage('tts');
    setGenProgress(12);

    try {
      let ttsUrl = generatedAudioUrl;
      const ttsRes = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: spokenScript.trim(),
          voiceName,
          stylePrompt: voiceStyle,
        }),
      });
      const ttsData = await ttsRes.json();
      if (!ttsRes.ok || !ttsData.audioUrl) {
        throw new Error(
          ttsData.error || 'Failed to synthesize voiceover audio.'
        );
      }
      ttsUrl = ttsData.audioUrl;
      setGeneratedAudioUrl(ttsUrl);

      setGenStage('veo');
      setGenProgress(28);

      const veoPrompt = buildVeoPrompt({
        avatarName: uploadedFileName || currentPreset.name,
        lookDescription,
        emotionGesture: 'smiling',
        position: 'center',
        scriptText: spokenScript.trim(),
      });

      const veoStartRes = await fetch('/api/veo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: veoPrompt,
          avatarImageUrl: referenceFrameUrl,
          aspectRatio,
          duration,
        }),
      });
      const veoStartData = await veoStartRes.json();
      if (!veoStartRes.ok || !veoStartData.interactionId) {
        throw new Error(
          veoStartData.error || 'Could not start Veo video generation.'
        );
      }

      const interactionId: string = veoStartData.interactionId;
      let pollCount = 0;

      pollTimerRef.current = setInterval(async () => {
        pollCount += 1;
        setGenProgress((prev) =>
          Math.min(95, Math.max(prev, 28 + pollCount * 7))
        );

        try {
          const pollRes = await fetch(
            `/api/veo/status/${encodeURIComponent(interactionId)}`
          );
          const pollData = await pollRes.json();

          if (pollData.status === 'completed' && pollData.videoUrl) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;

            setGeneratedVideoUrl(pollData.videoUrl);
            setGenStage('completed');
            setGenProgress(100);

            setHistory((prev) => [
              {
                id: `clip-${Date.now()}`,
                scriptText: spokenScript.trim(),
                videoUrl: pollData.videoUrl,
                audioUrl: ttsUrl || undefined,
                frameUrl: referenceFrameUrl,
                aspectRatio,
                createdAt: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
              ...prev,
            ]);
          } else if (pollData.status === 'failed' || !pollRes.ok) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setGenStage('error');
            setErrorMessage(
              pollData.error ||
                'Veo video generation failed or was filtered. Try a simpler script.'
            );
          }
        } catch {
          if (pollCount > 36) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setGenStage('error');
            setErrorMessage('Video generation timed out. Please try again.');
          }
        }
      }, 5000);
    } catch (err) {
      setGenStage('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Generation failed.'
      );
    }
  };

  const handleTogglePlayResult = () => {
    const videoEl = resultVideoRef.current;
    const audioEl = resultAudioRef.current;

    if (isPlayingResult) {
      videoEl?.pause();
      audioEl?.pause();
      setIsPlayingResult(false);
      return;
    }

    setIsPlayingResult(true);
    if (videoEl) {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    }
    if (audioEl) {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    }
  };

  const estimatedSecs = estimateDurationSeconds(spokenScript, 1.0, false);
  const activeVoiceInfo =
    VOICE_CHOICES.find((v) => v.name === voiceName) || VOICE_CHOICES[0];

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#090D16] text-[#F1F5F9] flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800/80 bg-[#0B0F19] shrink-0">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('create');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          AvatarStudio
        </a>

        {/* Zone 2: 4 Clean Single-Line Nav Links */}
        <nav
          aria-label="Studio Navigation"
          className="flex items-center gap-7 text-sm font-medium"
        >
          {(
            [
              { id: 'create', label: 'Studio' },
              { id: 'avatars', label: 'Avatars' },
              { id: 'voices', label: 'Voices' },
              { id: 'history', label: 'Videos' },
            ] as const
          ).map((tab) => {
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-white border-indigo-400 font-semibold'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={genStage === 'tts' || genStage === 'veo'}
            onClick={handleGenerateAvatarVideo}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            {genStage === 'tts' || genStage === 'veo' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating ({genProgress}%)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Video</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* HeyGen-Inspired Split Workspace */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Panel (5 Cols): HeyGen-Style Avatar & Script Composer */}
        <div className="lg:col-span-5 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-[#0E1320] overflow-y-auto p-6 space-y-6">
          {/* Section 1: Presenter / Sample Video Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white font-display">
                Choose Avatar or Upload Sample Video
              </h2>
              {analyzingSample ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-indigo-400 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Matching look & voice...
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  {uploadedFileName ? 'Custom Sample Active' : currentPreset.role}
                </span>
              )}
            </div>

            {/* 4-Card Strip: Upload Sample + 3 Studio Avatars */}
            <div className="grid grid-cols-4 gap-2.5">
              {/* Upload Sample Card */}
              <label
                htmlFor="sample-video-upload"
                className={`group flex flex-col items-center justify-center p-2.5 rounded-xl border border-dashed transition-all text-center cursor-pointer aspect-[4/5] ${
                  selectedPresetId === 'custom'
                    ? 'bg-indigo-950/30 border-indigo-500 text-white'
                    : 'bg-[#090D16] border-slate-700/80 hover:border-indigo-400 text-slate-300'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-1.5 group-hover:scale-105 transition-transform">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-white leading-tight">
                  {uploadedFileName ? 'Replace Sample' : 'Upload Sample'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Video / Photo
                </span>
                <input
                  id="sample-video-upload"
                  type="file"
                  accept="video/*,image/*"
                  onChange={handleSampleUpload}
                  className="sr-only"
                />
              </label>

              {/* 3 Pre-loaded Studio Presenters */}
              {SAMPLE_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`group relative rounded-xl overflow-hidden border transition-all aspect-[4/5] text-left cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <img
                      src={preset.frameUrl}
                      alt={preset.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-2">
                      <p className="text-[11px] font-semibold text-white truncate">
                        {preset.name}
                      </p>
                      <p className="text-[10px] text-slate-300 truncate">
                        {preset.recommendedVoice}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: HeyGen-Style Scene Script Card */}
          <div className="rounded-xl bg-[#090D16] border border-slate-800/90 overflow-hidden flex flex-col">
            {/* Script Card Header: Active Avatar Mini-Lockup + Voice Selector + Test Voice */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800/80 bg-[#111827]/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={referenceFrameUrl}
                  alt="Active Avatar"
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0"
                />
                <span className="text-xs font-semibold text-white truncate">
                  {uploadedFileName || currentPreset.name}
                </span>
                <span className="text-slate-600">·</span>
                <select
                  aria-label="Gemini TTS Voice"
                  value={voiceName}
                  onChange={(e) =>
                    setVoiceName(e.target.value as PrebuiltVoiceName)
                  }
                  className="text-xs font-medium text-indigo-300 bg-transparent hover:text-indigo-200 focus:outline-none cursor-pointer"
                >
                  {VOICE_CHOICES.map((v) => (
                    <option
                      key={v.name}
                      value={v.name}
                      className="bg-[#0E1320] text-white"
                    >
                      Voice: {v.label} ({v.tagline})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={previewingVoice}
                onClick={handlePreviewVoice}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {previewingVoice ? (
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                ) : playingVoicePreview ? (
                  <Square className="w-3 h-3 text-amber-400 fill-amber-400" />
                ) : (
                  <Volume2 className="w-3 h-3 text-indigo-400" />
                )}
                <span>{playingVoicePreview ? 'Stop Voice' : 'Preview Voice'}</span>
              </button>
            </div>

            {/* Spoken Script Textarea */}
            <div className="p-4 space-y-3">
              <textarea
                id="spoken-script-textarea"
                aria-label="Spoken Script"
                rows={4}
                value={spokenScript}
                onChange={(e) => setSpokenScript(e.target.value)}
                placeholder="Type what you want your avatar to say..."
                className="w-full text-sm bg-transparent text-slate-100 placeholder:text-slate-500 leading-relaxed focus:outline-none resize-none"
              />

              {/* AI Prompt Assist Bar inside the Script Card */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <input
                  type="text"
                  aria-label="AI Script Prompt"
                  value={topicPrompt}
                  onChange={(e) => setTopicPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleWriteScriptFromPrompt();
                    }
                  }}
                  placeholder="Ask AI to write or rewrite script (e.g., 5s product launch intro)..."
                  className="flex-1 min-w-0 text-xs bg-transparent text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={writingScript}
                  onClick={handleWriteScriptFromPrompt}
                  className="px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-600 border border-indigo-800/60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {writingScript ? 'Writing...' : 'AI Write'}
                </button>
              </div>
            </div>

            {/* Card Footer: Estimated Duration + Sample Tuning Toggle */}
            <div className="px-4 py-2.5 bg-[#111827]/40 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono tabular-nums">
                {spokenScript.trim().split(/\s+/).filter(Boolean).length} words ·
                ~{estimatedSecs.toFixed(1)}s speech
              </span>

              <button
                type="button"
                onClick={() => setShowAdvancedTuning(!showAdvancedTuning)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>
                  {showAdvancedTuning
                    ? 'Hide Sample Match Details'
                    : 'Sample Look & Voice Match'}
                </span>
              </button>
            </div>
          </div>

          {/* Collapsible Sample Match Tuning Drawer (keeps UI ultra-clean by default) */}
          {(showAdvancedTuning || activeSection === 'voices' || activeSection === 'avatars') && (
            <div className="p-4 rounded-xl bg-[#090D16] border border-slate-800/90 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">
                  Extracted Sample Characteristics
                </span>
                <span className="text-[11px] text-slate-400">
                  Auto-populated when you upload a video
                </span>
              </div>
              <div>
                <label
                  htmlFor="sample-look-input"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Presenter Appearance (Sent to Veo for Visual Consistency)
                </label>
                <input
                  id="sample-look-input"
                  type="text"
                  value={lookDescription}
                  onChange={(e) => setLookDescription(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#111827] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="sample-voice-style-input"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Matched Voice Style Instruction (Sent to Gemini TTS)
                </label>
                <input
                  id="sample-voice-style-input"
                  type="text"
                  value={voiceStyle}
                  onChange={(e) => setVoiceStyle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#111827] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={genStage === 'tts' || genStage === 'veo'}
              onClick={handleGenerateAvatarVideo}
              className="w-full py-3.5 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {genStage === 'tts' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Step 1/2: Synthesizing Matched Voiceover...</span>
                </>
              ) : genStage === 'veo' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    Step 2/2: Animating Lip-Sync Video with Veo ({genProgress}
                    %)...
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Talking Avatar Video</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>
                Combines Gemini TTS voiceover + Veo lip-sync video (~45–90s)
              </span>
            </p>
          </div>
        </div>

        {/* Right Stage (7 Cols): HeyGen-Style Canvas Preview & Output */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 bg-[#090D16] overflow-y-auto">
          {/* Top Floating Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/70">
            <div className="flex items-center gap-2">
              {/* Aspect Ratio Pill Toggle */}
              <div className="inline-flex items-center p-0.5 bg-[#111827] border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    aspectRatio === '16:9'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>16:9 Landscape</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    aspectRatio === '9:16'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>9:16 Portrait</span>
                </button>
              </div>

              {/* Clip Duration Toggle */}
              <div className="inline-flex items-center p-0.5 bg-[#111827] border border-slate-800 rounded-lg">
                {(['5s', '10s'] as const).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setDuration(dur)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                      duration === dur
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {dur}
                  </button>
                ))}
              </div>

              {/* Captions Toggle */}
              <button
                type="button"
                onClick={() => setShowCaptions(!showCaptions)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  showCaptions
                    ? 'bg-[#111827] text-indigo-300 border-indigo-500/50'
                    : 'bg-[#111827] text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" />
                <span>{showCaptions ? 'Captions On' : 'Captions Off'}</span>
              </button>
            </div>

            {generatedVideoUrl && (
              <a
                href={generatedVideoUrl}
                download={`avatar-studio-${Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download MP4</span>
              </a>
            )}
          </div>

          {errorMessage && (
            <div className="mt-4 flex items-start justify-between gap-3 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-300 hover:text-white underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Center Video Stage */}
          <div className="flex-1 flex flex-col items-center justify-center py-6 min-h-[360px]">
            <div
              className={`relative overflow-hidden rounded-2xl border border-slate-800/90 shadow-2xl bg-gradient-to-b ${
                currentPreset.backdropGradient
              } flex items-center justify-center transition-all ${
                aspectRatio === '9:16'
                  ? 'aspect-[9/16] h-[440px]'
                  : 'aspect-video w-full max-w-[700px]'
              }`}
            >
              {/* Soft Ambient Studio Backdrop Blur so 1:1 portraits fill 16:9 harmoniously */}
              {!generatedVideoUrl && !uploadedVideoUrl && (
                <img
                  src={referenceFrameUrl}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110 pointer-events-none"
                />
              )}

              {generatedVideoUrl ? (
                <video
                  ref={resultVideoRef}
                  src={generatedVideoUrl}
                  controls
                  playsInline
                  onPlay={() => {
                    setIsPlayingResult(true);
                    if (resultAudioRef.current) {
                      resultAudioRef.current.currentTime =
                        resultVideoRef.current?.currentTime || 0;
                      resultAudioRef.current.play().catch(() => {});
                    }
                  }}
                  onPause={() => {
                    setIsPlayingResult(false);
                    resultAudioRef.current?.pause();
                  }}
                  onEnded={() => setIsPlayingResult(false)}
                  className="relative z-10 w-full h-full object-cover"
                />
              ) : uploadedVideoUrl ? (
                <video
                  src={uploadedVideoUrl}
                  controls
                  playsInline
                  className="relative z-10 w-full h-full object-contain"
                />
              ) : (
                <img
                  src={referenceFrameUrl}
                  alt={uploadedFileName || currentPreset.name}
                  referrerPolicy="no-referrer"
                  className="relative z-10 h-full object-contain drop-shadow-2xl"
                />
              )}

              {/* Subtle Top Stage Status Overlay */}
              <div className="absolute top-3.5 left-4 right-4 z-20 flex items-center justify-between text-xs text-slate-200/90 drop-shadow pointer-events-none">
                <span>
                  {uploadedFileName || currentPreset.name} ·{' '}
                  {activeVoiceInfo.label} Voice
                </span>
                <span className="font-mono text-[11px]">
                  {generatedVideoUrl
                    ? 'Veo Lip-Sync Video Ready'
                    : uploadedVideoUrl
                    ? 'Sample Video Loaded'
                    : 'Studio Preview'}
                </span>
              </div>

              {/* LiveGeneration Progress Scrim */}
              {(genStage === 'tts' || genStage === 'veo') && (
                <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  <div className="space-y-1 max-w-sm">
                    <p className="text-sm font-semibold text-white font-display">
                      {genStage === 'tts'
                        ? 'Step 1/2: Synthesizing Gemini TTS Voiceover...'
                        : `Step 2/2: Rendering Lip-Sync Video with Veo (${genProgress}%)...`}
                    </p>
                    <p className="text-xs text-slate-300">
                      Animating {uploadedFileName || currentPreset.name}{' '}
                      speaking your script with natural facial movements.
                    </p>
                  </div>
                  <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${genProgress}%` }}
                      className="h-full bg-indigo-500 transition-all duration-300"
                    />
                  </div>
                </div>
              )}

              {/* Bottom Caption Scrim */}
              {showCaptions && spokenScript.trim() && (
                <div className="absolute inset-x-6 bottom-5 z-20 pointer-events-none flex justify-center">
                  <div className="px-4 py-2 rounded-xl bg-black/75 backdrop-blur-xs border border-white/10 text-xs sm:text-sm text-white text-center max-w-[92%] leading-snug shadow-xl">
                    {spokenScript.trim()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Stage Bar: Audio Player / Recent Clips */}
          <div className="pt-4 border-t border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {generatedAudioUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Voiceover Ready ({voiceName})</span>
                </span>
                <audio
                  ref={resultAudioRef}
                  controls
                  src={generatedAudioUrl}
                  className="h-8 max-w-[220px]"
                />
                {generatedVideoUrl && (
                  <button
                    type="button"
                    onClick={handleTogglePlayResult}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {isPlayingResult ? 'Pause Synced' : 'Play Video + Voice'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Film className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Select an avatar or upload a sample video on the left, enter
                  your script, and click{' '}
                  <strong className="text-slate-200">Generate Video</strong>.
                </span>
              </div>
            )}

            {history.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-xs text-slate-400 shrink-0">
                  Recent ({history.length}):
                </span>
                {history.slice(0, 3).map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => {
                      if (clip.videoUrl) setGeneratedVideoUrl(clip.videoUrl);
                      if (clip.audioUrl) setGeneratedAudioUrl(clip.audioUrl);
                      setSpokenScript(clip.scriptText);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111827] border border-slate-800 hover:border-slate-600 text-xs text-slate-200 shrink-0 cursor-pointer"
                  >
                    <img
                      src={clip.frameUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span className="font-mono text-[11px]">
                      {clip.createdAt}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
