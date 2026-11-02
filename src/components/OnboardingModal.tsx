import React, { useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { AspectRatioOption } from '../types/studio';
import { splitScriptIntoScenes } from '../utils/studioLogic';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  UserCheck,
  Volume2,
  FileText,
  Film,
} from 'lucide-react';

export const OnboardingModal: React.FC = () => {
  const showOnboarding = useStudioStore((s) => s.showOnboarding);
  const setShowOnboarding = useStudioStore((s) => s.setShowOnboarding);
  const avatars = useStudioStore((s) => s.avatars);
  const voices = useStudioStore((s) => s.voices);
  const defaultAvatarId = useStudioStore((s) => s.defaultAvatarId);
  const defaultVoiceId = useStudioStore((s) => s.defaultVoiceId);
  const fullScript = useStudioStore((s) => s.fullScript);
  const resetNewProject = useStudioStore((s) => s.resetNewProject);

  const [step, setStep] = useState<number>(1);
  const [projectName, setProjectName] = useState<string>(
    'Product Launch Avatar Briefing'
  );
  const [selectedAvatarId, setSelectedAvatarId] =
    useState<string>(defaultAvatarId);
  const [selectedVoiceId, setSelectedVoiceId] =
    useState<string>(defaultVoiceId);
  const [scriptDraft, setScriptDraft] = useState<string>(fullScript);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('16:9');

  if (!showOnboarding) return null;

  const previewScenes = splitScriptIntoScenes(scriptDraft, 1.0);

  const handleFinish = () => {
    resetNewProject({
      projectName,
      avatarId: selectedAvatarId || avatars[0]?.id,
      voiceId: selectedVoiceId || voices[0]?.id,
      script: scriptDraft.trim() || fullScript,
      aspectRatio,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="w-full max-w-3xl bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <p className="text-xs text-slate-400">
              New Project Setup · Step {step} of 4
            </p>
            <h2
              id="onboarding-title"
              className="text-lg font-semibold text-white font-display mt-0.5"
            >
              {step === 1 && '01. Select Your Presenter Avatar'}
              {step === 2 && '02. Choose a Gemini TTS Voice Style'}
              {step === 3 && '03. Write or Paste Your Script'}
              {step === 4 && '04. Review Timeline & Aspect Ratio'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowOnboarding(false)}
            aria-label="Close New Project Wizard"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-[#0B0F19]/60 text-xs">
          {[
            { num: 1, label: 'Avatar', icon: UserCheck },
            { num: 2, label: 'Voice', icon: Volume2 },
            { num: 3, label: 'Script', icon: FileText },
            { num: 4, label: 'Timeline & Export', icon: Film },
          ].map((item) => {
            const Icon = item.icon;
            const active = step === item.num;
            const done = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => setStep(item.num)}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 border-r last:border-r-0 border-slate-800 transition-colors cursor-pointer ${
                  active
                    ? 'text-indigo-300 bg-indigo-950/30 font-semibold'
                    : done
                    ? 'text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 min-h-[320px] max-h-[68vh] overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="wizard-project-name"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Project Title
                </label>
                <input
                  id="wizard-project-name"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name..."
                  className="w-full px-3.5 py-2 text-sm bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <p className="text-xs text-slate-400">
                Choose a default digital presenter. Each avatar stores a
                consistent look description reused in every Veo prompt.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {avatars.map((av) => {
                  const isSelected = selectedAvatarId === av.id;
                  return (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(av.id)}
                      className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-950/30 border-indigo-500'
                          : 'bg-[#0B0F19] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="aspect-square w-full rounded-md overflow-hidden bg-slate-900 mb-2.5">
                        <img
                          src={av.imageUrl}
                          alt={av.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-sm font-semibold text-white truncate">
                        {av.name}
                      </p>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                        {av.lookDescription}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Select a Gemini TTS voice style profile. Profiles combine a
                prebuilt voice with pace, tone, and diction instructions.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {voices.map((v) => {
                  const isSelected = selectedVoiceId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoiceId(v.id)}
                      className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-950/30 border-indigo-500'
                          : 'bg-[#0B0F19] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">
                          {v.name}
                        </span>
                        <span className="text-xs font-mono text-indigo-400 tabular-nums">
                          {v.pace.toFixed(2)}x
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Voice: {v.prebuiltVoice} · Tone: {v.tone}
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-1">
                        {v.accentNotes}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="wizard-script-textarea"
                  className="text-xs font-medium text-slate-300"
                >
                  Presenter Script (Auto-splits into 5–8s scenes by sentence)
                </label>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {previewScenes.length} scenes ·{' '}
                  {previewScenes
                    .reduce((acc, s) => acc + s.estimatedDuration, 0)
                    .toFixed(1)}
                  s total
                </span>
              </div>
              <textarea
                id="wizard-script-textarea"
                rows={6}
                value={scriptDraft}
                onChange={(e) => setScriptDraft(e.target.value)}
                placeholder="Write your presenter script here..."
                className="w-full p-3.5 text-sm bg-[#0B0F19] border border-slate-800 rounded-lg text-slate-100 leading-relaxed focus:outline-none focus:border-indigo-500"
              />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-400">
                  Scene Breakdown Preview:
                </p>
                {previewScenes.map((sc, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs bg-[#0B0F19] border border-slate-800/80 rounded-md"
                  >
                    <span className="text-slate-300 truncate">
                      <strong className="text-indigo-400 font-mono mr-2">
                        0{i + 1}.
                      </strong>
                      {sc.scriptText}
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums shrink-0">
                      {sc.estimatedDuration.toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-slate-300 mb-2">
                  Target Video Aspect Ratio
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      {
                        ratio: '16:9',
                        title: '16:9 Landscape',
                        desc: 'Keynotes, YouTube & Web',
                      },
                      {
                        ratio: '9:16',
                        title: '9:16 Vertical',
                        desc: 'Shorts, Reels & Mobile',
                      },
                      {
                        ratio: '1:1',
                        title: '1:1 Square',
                        desc: 'Feed Posts & Embeds',
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.ratio}
                      type="button"
                      onClick={() => setAspectRatio(opt.ratio)}
                      className={`p-3.5 text-left rounded-lg border transition-colors cursor-pointer ${
                        aspectRatio === opt.ratio
                          ? 'bg-indigo-950/30 border-indigo-500'
                          : 'bg-[#0B0F19] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <p className="text-sm font-semibold text-white font-mono">
                        {opt.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#0B0F19] border border-slate-800 space-y-2 text-xs text-slate-300">
                <p className="font-semibold text-white">
                  Ready to Build Your Timeline
                </p>
                <p className="text-slate-400 leading-relaxed">
                  Clicking <strong className="text-white">Create Project</strong>{' '}
                  populates the 4-track Timeline Editor with{' '}
                  <span className="font-mono text-indigo-300">
                    {previewScenes.length} scenes
                  </span>
                  . From there you can generate per-scene Gemini TTS voiceovers,
                  render talking-avatar Veo clips, customize live word captions,
                  and export a stitched WebM/MP4 video.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#0B0F19]">
          <button
            type="button"
            onClick={() =>
              step > 1 ? setStep(step - 1) : setShowOnboarding(false)
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{step > 1 ? 'Previous' : 'Cancel'}</span>
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
            >
              <span>Next Step</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Create Project</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
