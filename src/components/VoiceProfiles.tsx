import React, { useRef, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { PrebuiltVoiceName, VoiceProfile, VoiceTone } from '../types/studio';
import { buildTtsStylePrompt } from '../utils/studioLogic';
import {
  Volume2,
  Play,
  Square,
  Plus,
  Trash2,
  Check,
  Loader2,
  Info,
  MicOff,
  AlertCircle,
  Film,
} from 'lucide-react';

const PREBUILT_VOICES: {
  name: PrebuiltVoiceName;
  summary: string;
  sampleLine: string;
}[] = [
  {
    name: 'Kore',
    summary: 'Balanced, clear broadcast register suited for keynotes and briefings',
    sampleLine:
      'Welcome to AvatarStudio. Let us walk through our third-quarter engineering milestones.',
  },
  {
    name: 'Puck',
    summary: 'Dynamic, articulate presenter tone for product demos and walkthroughs',
    sampleLine:
      'Here is how you can turn any written script into a multi-scene avatar broadcast.',
  },
  {
    name: 'Zephyr',
    summary: 'Smooth, inviting cadence ideal for onboarding and educational guides',
    sampleLine:
      'In this module, we will configure your scene framing and live word-by-word captions.',
  },
  {
    name: 'Charon',
    summary: 'Deep, composed studio baritone for documentary and executive updates',
    sampleLine:
      'Across every global region, autonomous workflows reduced deployment latency by forty percent.',
  },
  {
    name: 'Fenrir',
    summary: 'Direct, resonant delivery for technical deep-dives and announcements',
    sampleLine:
      'Every scene prompt locks your presenter look description for consistent visual identity.',
  },
];

const TONE_OPTIONS: { value: VoiceTone; label: string }[] = [
  { value: 'warm', label: 'Warm' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'calm', label: 'Calm' },
  { value: 'authoritative', label: 'Authoritative' },
];

export const VoiceProfiles: React.FC = () => {
  const voices = useStudioStore((s) => s.voices);
  const defaultVoiceId = useStudioStore((s) => s.defaultVoiceId);
  const addVoiceProfile = useStudioStore((s) => s.addVoiceProfile);
  const updateVoiceProfile = useStudioStore((s) => s.updateVoiceProfile);
  const deleteVoiceProfile = useStudioStore((s) => s.deleteVoiceProfile);
  const setDefaultVoiceId = useStudioStore((s) => s.setDefaultVoiceId);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const updateScene = useStudioStore((s) => s.updateScene);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  // Builder form state
  const [profileName, setProfileName] = useState('Custom Broadcast Style');
  const [selectedPrebuilt, setSelectedPrebuilt] =
    useState<PrebuiltVoiceName>('Kore');
  const [pace, setPace] = useState<number>(1.0);
  const [tone, setTone] = useState<VoiceTone>('warm');
  const [accentNotes, setAccentNotes] = useState(
    'General American broadcast English, clear articulation'
  );
  const [previewText, setPreviewText] = useState(
    PREBUILT_VOICES[0].sampleLine
  );

  // Playback state
  const [loadingVoiceKey, setLoadingVoiceKey] = useState<string | null>(null);
  const [playingVoiceKey, setPlayingVoiceKey] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingVoiceKey(null);
  };

  const playTtsPreview = async (params: {
    key: string;
    voiceName: PrebuiltVoiceName;
    paceVal: number;
    toneVal: VoiceTone;
    accentVal: string;
    textToSpeak: string;
    cachedAudioUrl?: string;
    profileIdToCache?: string;
  }) => {
    if (playingVoiceKey === params.key) {
      stopPlayback();
      return;
    }

    stopPlayback();
    setTtsError(null);

    if (params.cachedAudioUrl) {
      const audio = new Audio(params.cachedAudioUrl);
      audio.playbackRate = params.paceVal;
      audioRef.current = audio;
      setPlayingVoiceKey(params.key);
      audio.onended = () => setPlayingVoiceKey(null);
      audio.onerror = () => setPlayingVoiceKey(null);
      await audio.play();
      return;
    }

    setLoadingVoiceKey(params.key);
    try {
      const stylePrompt = buildTtsStylePrompt({
        tone: params.toneVal,
        pace: params.paceVal,
        accentNotes: params.accentVal,
      });

      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: params.textToSpeak,
          voiceName: params.voiceName,
          stylePrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.audioUrl) {
        throw new Error(data.error || 'Failed to generate Gemini TTS preview.');
      }

      if (params.profileIdToCache) {
        updateVoiceProfile(params.profileIdToCache, {
          sampleAudioUrl: data.audioUrl,
        });
      }

      const audio = new Audio(data.audioUrl);
      audio.playbackRate = params.paceVal;
      audioRef.current = audio;
      setPlayingVoiceKey(params.key);
      audio.onended = () => setPlayingVoiceKey(null);
      audio.onerror = () => setPlayingVoiceKey(null);
      await audio.play();
    } catch (err) {
      setTtsError(
        err instanceof Error
          ? err.message
          : 'Could not synthesize Gemini TTS preview.'
      );
    } finally {
      setLoadingVoiceKey(null);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;
    addVoiceProfile({
      name: profileName.trim(),
      prebuiltVoice: selectedPrebuilt,
      pace,
      tone,
      accentNotes: accentNotes.trim(),
    });
    setProfileName('New Studio Voice Style');
  };

  const applyVoiceToCurrentScene = (voiceId: string) => {
    setDefaultVoiceId(voiceId);
    if (selectedSceneId) {
      updateScene(selectedSceneId, { voiceProfileId: voiceId });
    }
    setActiveTab('timeline');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header + Transparency Note */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight">
            Voice Profiles
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Configure reusable voiceover profiles powered by Gemini TTS prebuilt
            voices with customizable pace, emotional tone, and accent/diction
            notes.
          </p>
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#111827] border border-slate-800 max-w-md text-xs text-slate-300">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-white">Voice Style Disclosure:</strong>{' '}
            These profiles direct Gemini TTS prebuilt voices using pace, tone,
            and diction prompts rather than cloning personal voice recordings.
          </p>
        </div>
      </div>

      {ttsError && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{ttsError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTtsError(null)}
            className="text-rose-300 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Cols: Saved Voice Profiles + Disabled Voice Clone Slot */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white font-display">
              Saved Voice Profiles ({voices.length})
            </h2>
            <span className="text-xs text-slate-400">
              Click Preview to hear real Gemini TTS synthesis
            </span>
          </div>

          <div className="space-y-3">
            {voices.map((profile: VoiceProfile) => {
              const isDefault = profile.id === defaultVoiceId;
              const playKey = `profile-${profile.id}`;
              const isLoading = loadingVoiceKey === playKey;
              const isPlaying = playingVoiceKey === playKey;

              return (
                <div
                  key={profile.id}
                  className={`p-5 rounded-xl bg-[#111827] border transition-colors ${
                    isDefault
                      ? 'border-indigo-500/80'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-semibold text-white font-display">
                          {profile.name}
                        </h3>
                        <span className="text-xs text-slate-400">
                          · {profile.prebuiltVoice}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Tone: <span className="text-slate-200 capitalize">{profile.tone}</span>{' '}
                        · Pace:{' '}
                        <span className="font-mono text-indigo-300 tabular-nums">
                          {profile.pace.toFixed(2)}x
                        </span>{' '}
                        · {profile.accentNotes || 'Standard broadcast diction'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          playTtsPreview({
                            key: playKey,
                            voiceName: profile.prebuiltVoice,
                            paceVal: profile.pace,
                            toneVal: profile.tone,
                            accentVal: profile.accentNotes,
                            textToSpeak:
                              PREBUILT_VOICES.find(
                                (v) => v.name === profile.prebuiltVoice
                              )?.sampleLine || previewText,
                            cachedAudioUrl: profile.sampleAudioUrl,
                            profileIdToCache: profile.id,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-[#0B0F19] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                            <span>Synthesizing...</span>
                          </>
                        ) : isPlaying ? (
                          <>
                            <Square className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            <span>Stop Preview</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Preview Voice</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => applyVoiceToCurrentScene(profile.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/50 hover:bg-indigo-600 border border-indigo-800/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Use in Scene</span>
                      </button>

                      <button
                        type="button"
                        disabled={voices.length <= 1}
                        onClick={() => deleteVoiceProfile(profile.id)}
                        aria-label={`Delete voice profile ${profile.name}`}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Placeholder "Upload voice sample" slot — disabled & labeled "Coming soon" */}
          <div
            aria-disabled="true"
            className="p-5 rounded-xl bg-[#0B0F19] border border-dashed border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-75"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500">
                <MicOff className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-300 font-display">
                    Upload Voice Sample (Instant Voice Cloning)
                  </h3>
                  <span className="text-xs font-mono text-amber-400 whitespace-nowrap shrink-0">
                    · Coming soon
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-lg">
                  Custom acoustic voice cloning from uploaded audio samples is
                  not yet enabled. Use the Gemini TTS Voice Style Builder on the
                  right to craft expressive voice profiles.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="px-4 py-2 text-xs font-medium text-slate-500 bg-slate-900 border border-slate-800 rounded-lg cursor-not-allowed whitespace-nowrap shrink-0"
            >
              Upload Voice Sample — Coming soon
            </button>
          </div>
        </div>

        {/* Right 5 Cols: Create / Customize Voice Style Profile */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-5 p-6 rounded-xl bg-[#111827] border border-slate-800 space-y-5"
        >
          <div>
            <h2 className="text-base font-semibold text-white font-display">
              Create Voice Style Profile
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Combine a Gemini 3.8 TTS prebuilt voice with custom pace, tone,
              and accent notes.
            </p>
          </div>

          {/* Profile Name */}
          <div>
            <label
              htmlFor="voice-profile-name"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Profile Name
            </label>
            <input
              id="voice-profile-name"
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g., Founder Keynote (Warm)"
              className="w-full px-3.5 py-2 text-sm bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Prebuilt Voice Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Gemini TTS Prebuilt Voice
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PREBUILT_VOICES.map((voice) => {
                const isSelected = selectedPrebuilt === voice.name;
                const previewKey = `builder-${voice.name}`;
                const isLoading = loadingVoiceKey === previewKey;
                const isPlaying = playingVoiceKey === previewKey;

                return (
                  <div
                    key={voice.name}
                    onClick={() => {
                      setSelectedPrebuilt(voice.name);
                      setPreviewText(voice.sampleLine);
                    }}
                    className={`p-3 rounded-lg border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950/30 border-indigo-500'
                        : 'bg-[#0B0F19] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="text-xs font-semibold text-white">
                          {voice.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {voice.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        playTtsPreview({
                          key: previewKey,
                          voiceName: voice.name,
                          paceVal: pace,
                          toneVal: tone,
                          accentVal: accentNotes,
                          textToSpeak: voice.sampleLine,
                        });
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md shrink-0 cursor-pointer"
                    >
                      {isLoading
                        ? 'Loading...'
                        : isPlaying
                        ? 'Stop'
                        : 'Sample'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tone Control */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Delivery Tone
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    tone === t.value
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-[#0B0F19] text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pace Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="voice-pace-slider" className="font-medium text-slate-300">
                Speaking Pace
              </label>
              <span className="font-mono text-indigo-300 tabular-nums">
                {pace.toFixed(2)}x
              </span>
            </div>
            <input
              id="voice-pace-slider"
              type="range"
              min={0.8}
              max={1.25}
              step={0.05}
              value={pace}
              onChange={(e) => setPace(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-0.5">
              <span>0.80x (Measured)</span>
              <span>1.00x (Natural)</span>
              <span>1.25x (Brisk)</span>
            </div>
          </div>

          {/* Language / Accent Notes */}
          <div>
            <label
              htmlFor="voice-accent-notes"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Language & Accent / Style Notes
            </label>
            <input
              id="voice-accent-notes"
              type="text"
              value={accentNotes}
              onChange={(e) => setAccentNotes(e.target.value)}
              placeholder="e.g., Mid-Atlantic broadcast accent, crisp studio diction"
              className="w-full px-3.5 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Save Button */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Save Reusable Voice Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
