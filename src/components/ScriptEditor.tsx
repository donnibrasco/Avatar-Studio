import React, { useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { splitScriptIntoScenes } from '../utils/studioLogic';
import { API_BASE_URL } from '../utils/api';
import {
  Wand2,
  Scissors,
  ArrowRight,
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
  Clock,
  FileText,
} from 'lucide-react';

export const ScriptEditor: React.FC = () => {
  const fullScript = useStudioStore((s) => s.fullScript);
  const setFullScript = useStudioStore((s) => s.setFullScript);
  const autoSplitScriptToScenes = useStudioStore(
    (s) => s.autoSplitScriptToScenes
  );
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const voices = useStudioStore((s) => s.voices);
  const defaultVoiceId = useStudioStore((s) => s.defaultVoiceId);

  const [topicInput, setTopicInput] = useState(
    'Introducing AvatarStudio: automated multi-scene presenter video workflows for global teams'
  );
  const [showTopicBar, setShowTopicBar] = useState(false);
  const [toneTarget, setToneTarget] = useState('Executive & Persuasive');
  const [aiLoadingAction, setAiLoadingAction] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const defaultVoice =
    voices.find((v) => v.id === defaultVoiceId) || voices[0];
  const splitPreview = splitScriptIntoScenes(
    fullScript,
    defaultVoice?.pace || 1.0
  );
  const totalEstimatedSeconds = splitPreview.reduce(
    (sum, s) => sum + s.estimatedDuration,
    0
  );
  const totalWords = fullScript
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const runAiAssist = async (
    action: 'write_topic' | 'shorten' | 'expand' | 'change_tone' | 'fix_grammar',
    customTone?: string
  ) => {
    setAiLoadingAction(action);
    setAiError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/script/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: fullScript,
          topic: topicInput,
          targetTone: customTone || toneTarget,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.script) {
        throw new Error(
          data.error || 'Gemini script assistant could not complete request.'
        );
      }
      setFullScript(data.script);
      setShowTopicBar(false);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Script rewrite request failed.'
      );
    } finally {
      setAiLoadingAction(null);
    }
  };

  const handleAutoSplitAndSync = (navigateToTimeline: boolean) => {
    autoSplitScriptToScenes(fullScript);
    setSyncSuccess(true);
    setTimeout(() => setSyncSuccess(false), 2500);
    if (navigateToTimeline) {
      setActiveTab('timeline');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight">
            Script Editor & Scene Splitter
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Draft or refine your presenter script with Gemini AI Assist, then
            automatically split sentences into 5–8 second timeline scenes.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleAutoSplitAndSync(false)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white bg-[#111827] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {syncSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Synced {splitPreview.length} Scenes</span>
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4 text-indigo-400" />
                <span>Auto-Split into Scenes (5–8s)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleAutoSplitAndSync(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>Sync & Open Timeline</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {aiError && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{aiError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAiError(null)}
            className="text-rose-300 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2-Column Workspace: Left Script Editor + AI Assist, Right Auto-Split Scene Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Script Editor & AI Assist Menu */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          {/* AI Assist Toolbar */}
          <div className="p-3.5 bg-[#0B0F19] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 mr-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Assist:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={Boolean(aiLoadingAction)}
                onClick={() => setShowTopicBar(!showTopicBar)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  showTopicBar
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-[#111827] text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                Write from Topic
              </button>

              <button
                type="button"
                disabled={Boolean(aiLoadingAction)}
                onClick={() => runAiAssist('shorten')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                {aiLoadingAction === 'shorten' ? 'Shortening...' : 'Shorten'}
              </button>

              <button
                type="button"
                disabled={Boolean(aiLoadingAction)}
                onClick={() => runAiAssist('expand')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                {aiLoadingAction === 'expand' ? 'Expanding...' : 'Expand'}
              </button>

              <select
                aria-label="Change Script Tone"
                value={toneTarget}
                disabled={Boolean(aiLoadingAction)}
                onChange={(e) => {
                  const nextTone = e.target.value;
                  setToneTarget(nextTone);
                  runAiAssist('change_tone', nextTone);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-md focus:outline-none cursor-pointer"
              >
                <option value="Executive & Persuasive">
                  Tone: Executive
                </option>
                <option value="Warm & Conversational">
                  Tone: Warm & Friendly
                </option>
                <option value="Energetic Product Launch">
                  Tone: Energetic Launch
                </option>
                <option value="Calm Educational">
                  Tone: Calm Educator
                </option>
              </select>

              <button
                type="button"
                disabled={Boolean(aiLoadingAction)}
                onClick={() => runAiAssist('fix_grammar')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                {aiLoadingAction === 'fix_grammar'
                  ? 'Polishing...'
                  : 'Fix Grammar'}
              </button>
            </div>
          </div>

          {/* Expandable Write-from-Topic Prompt Bar */}
          {showTopicBar && (
            <div className="p-4 bg-indigo-950/20 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                aria-label="Topic for AI Script Writer"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="Describe your video topic, audience, and key takeaway..."
                className="flex-1 px-3.5 py-2 text-xs bg-[#0B0F19] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={Boolean(aiLoadingAction)}
                onClick={() => runAiAssist('write_topic')}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {aiLoadingAction === 'write_topic' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Drafting...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Generate Script</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Main Script Textarea */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <label
                htmlFor="main-script-editor"
                className="font-medium text-slate-300 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Full Presenter Teleprompter Script</span>
              </label>
              <div className="font-mono tabular-nums space-x-2">
                <span>{totalWords} words</span>
                <span>·</span>
                <span>{splitPreview.length} scenes</span>
                <span>·</span>
                <span className="text-indigo-300">
                  ~{totalEstimatedSeconds.toFixed(1)}s
                </span>
              </div>
            </div>

            <textarea
              id="main-script-editor"
              rows={11}
              value={fullScript}
              onChange={(e) => setFullScript(e.target.value)}
              placeholder="Write or paste your video script here. Sentences will automatically segment into 5–8 second scenes..."
              className="w-full p-4 text-sm bg-[#0B0F19] border border-slate-800 rounded-lg text-slate-100 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
            />
          </div>
        </div>

        {/* Right 5 Columns: Auto-Split Scene Breakdown (5-8s each) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white font-display">
                Auto-Split Scene Breakdown
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Segmented along sentence boundaries targeting 5.0s–8.0s per clip
              </p>
            </div>
            <span className="text-xs font-mono text-indigo-300 tabular-nums whitespace-nowrap shrink-0">
              {splitPreview.length} scenes · {totalEstimatedSeconds.toFixed(1)}s
            </span>
          </div>

          {splitPreview.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#111827] border border-slate-800 text-center space-y-2">
              <p className="text-sm font-medium text-slate-300">
                No script sentences yet
              </p>
              <p className="text-xs text-slate-500">
                Type your script on the left or click &ldquo;Write from
                Topic&rdquo; to generate a multi-scene script.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {splitPreview.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white font-display">
                      Scene 0{idx + 1}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-slate-400 tabular-nums">
                      <span>{item.wordCount} words</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Clock className="w-3 h-3" />
                        {item.estimatedDuration.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    &ldquo;{item.scriptText}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
