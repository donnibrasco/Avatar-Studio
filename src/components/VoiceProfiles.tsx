import React, { useRef, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { PrebuiltVoiceName, VoiceProfile, VoiceTone } from '../types/studio';
import { buildTtsStylePrompt } from '../utils/studioLogic';
import { API_BASE_URL } from '../utils/api';
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
  const [cloneName, setCloneName] = useState('My Voice');
  const [cloneAudio, setCloneAudio] = useState<File | null>(null);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloningVoice, setCloningVoice] = useState(false);

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
    elevenLabsVoiceId?: string;
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

      const response = await fetch(`${API_BASE_URL}/tts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: params.textToSpeak,
          voiceName: params.voiceName,
          elevenLabsVoiceId: params.elevenLabsVoiceId,
          pace: params.paceVal,
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

  const handleCloneVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneAudio || !cloneConsent || !cloneName.trim()) return;

    setCloningVoice(true);
    setTtsError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Could not read the selected audio file.'));
        reader.onerror = () =>
          reject(new Error('Could not read the selected audio file.'));
        reader.readAsDataURL(cloneAudio);
      });
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex < 0) throw new Error('The selected audio file is invalid.');

      const response = await fetch(`${API_BASE_URL}/voice/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cloneName.trim(),
          mimeType: cloneAudio.type,
          audioBase64: dataUrl.slice(commaIndex + 1),
          consent: cloneConsent,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.voiceId) {
        throw new Error(data.error || 'Could not clone this voice sample.');
      }

      addVoiceProfile({
        name: cloneName.trim(),
        elevenLabsVoiceId: data.voiceId,
        requiresVerification: Boolean(data.requiresVerification),
        pace: 1,
        tone: 'warm',
        accentNotes: 'Voice cloned from an authorized recording',
      });
      setCloneName('My Voice');
      setCloneAudio(null);
      setCloneConsent(false);
      const fileInput = document.getElementById(
        'voice-clone-audio'
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      if (data.requiresVerification) {
        setTtsError(
          'Voice created, but ElevenLabs requires verification before it can be used. Complete verification in your ElevenLabs account.'
        );
      }
    } catch (err) {
      setTtsError(
        err instanceof Error ? err.message : 'Could not clone this voice sample.'
      );
    } finally {
      setCloningVoice(false);
    }
  };

  const handleDeleteProfile = async (profile: VoiceProfile) => {
    if (
      profile.elevenLabsVoiceId &&
      !window.confirm(
        `Delete "${profile.name}" from this app and your ElevenLabs account?`
      )
    ) {
      return;
    }

    if (profile.elevenLabsVoiceId) {
      setTtsError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/voice/${encodeURIComponent(profile.elevenLabsVoiceId)}`,
          { method: 'DELETE' }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Could not delete the cloned voice.');
        }
      } catch (err) {
        setTtsError(
          err instanceof Error ? err.message : 'Could not delete the cloned voice.'
        );
        return;
      }
    }
    deleteVoiceProfile(profile.id);
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
          Configure Google preset voices or enroll an authorized voice sample
          for custom speech generation with ElevenLabs.
          </p>
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#111827] border border-slate-800 max-w-md text-xs text-slate-300">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
          <strong className="text-white">Voice consent:</strong> Only clone
          your own voice or a voice you have explicit permission to use.
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
                Preview uses the provider shown on each profile
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
                          · {profile.elevenLabsVoiceId
                            ? 'ElevenLabs voice clone'
                            : profile.prebuiltVoice}
                          {profile.requiresVerification && ' · verification required'}
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
                        disabled={isLoading || profile.requiresVerification}
                        onClick={() =>
                          playTtsPreview({
                            key: playKey,
                            voiceName: profile.prebuiltVoice || 'Kore',
                            elevenLabsVoiceId: profile.elevenLabsVoiceId,
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
                        disabled={profile.requiresVerification}
                        onClick={() => applyVoiceToCurrentScene(profile.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/50 hover:bg-indigo-600 border border-indigo-800/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Use in Scene</span>
                      </button>

                      <button
                        type="button"
                        disabled={voices.length <= 1}
                        onClick={() => void handleDeleteProfile(profile)}
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

          <form
            onSubmit={handleCloneVoice}
            className="p-5 rounded-xl bg-[#0B0F19] border border-slate-800 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-300">
                <MicOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white font-display">
                  Create a voice clone
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload a clean recording of about 1–3 minutes. MP3, WAV, M4A,
                  AAC, OGG, WebM, or FLAC; maximum 20 MB.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Requires ELEVENLABS_API_KEY in the server .env file.
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-300">
                Voice name
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={cloneName}
                  onChange={(event) => setCloneName(event.target.value)}
                  className="mt-1.5 w-full px-3 py-2 text-sm bg-[#111827] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </label>
              <label className="text-xs text-slate-300">
                Voice recording
                <input
                  id="voice-clone-audio"
                  type="file"
                  required
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file && file.size > 20 * 1024 * 1024) {
                      setTtsError('Audio sample must be no larger than 20 MB.');
                      event.target.value = '';
                      setCloneAudio(null);
                      return;
                    }
                    setCloneAudio(file);
                  }}
                  className="mt-1.5 block w-full text-xs text-slate-300 file:mr-2 file:px-2 file:py-1.5 file:rounded-md file:border file:border-slate-700 file:bg-slate-900 file:text-slate-200"
                />
              </label>
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={cloneConsent}
                onChange={(event) => setCloneConsent(event.target.checked)}
                className="mt-0.5 accent-indigo-500"
              />
              <span>
                I confirm this is my voice or I have explicit permission from
                the voice owner to create and use this clone.
              </span>
            </label>
            <button
              type="submit"
              disabled={cloningVoice || !cloneAudio || !cloneConsent}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              {cloningVoice ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {cloningVoice ? 'Creating voice...' : 'Create voice clone'}
            </button>
          </form>
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
