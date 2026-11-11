import React, { useEffect, useRef, useState } from "react";
import { PrebuiltVoiceName } from "../types/studio";
import { useStudioStore } from "../store/useStudioStore";
import { API_BASE_URL, readApiJson } from "../utils/api";
import { buildLipSyncPrompt } from "../utils/lipSync";
import { estimateDurationSeconds } from "../utils/studioLogic";
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
  Film,
} from "lucide-react";

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

interface UsageSummary {
  providerBilling?: { enabled: boolean; fresh: boolean; snapshot: { dayBilledUsd: number | null; monthBilledUsd: number | null; checkedAt: number } | null };
  budgetBasis?: string;
  todaySpendUsd: number;
  dailyCapUsd: number;
  monthSpendUsd: number;
  monthlyCapUsd: number;
  cacheHitsCount: number;
  savedByCacheUsd: number;
  engineBreakdown: { provider: string; costUsd: number }[];
  jobs: {
    id: string;
    provider: string;
    status: string;
    est_cost_usd: number;
    actual_cost_usd: number | null;
    local_media_url: string | null;
  }[];
}

const EMPTY_AVATAR: SamplePreset = {
  id: "custom",
  name: "Your avatar",
  role: "Upload your first avatar",
  frameUrl: "",
  lookDescription: "",
  voiceStyle: "Clear, natural presenter delivery",
  recommendedVoice: "lucy",
  backdropGradient: "from-slate-900 via-indigo-950/60 to-slate-950",
};

const VOICE_CHOICES: {
  name: PrebuiltVoiceName;
  label: string;
  tagline: string;
}[] = [
  { name: "lucy", label: "Lucy", tagline: "Chatterbox preset" },
  { name: "brian", label: "Brian", tagline: "Chatterbox preset" },
  { name: "chloe", label: "Chloe", tagline: "Chatterbox preset" },
  { name: "aaron", label: "Aaron", tagline: "Chatterbox preset" },
  { name: "laura", label: "Laura", tagline: "Chatterbox preset" },
  ...[
    "abigail",
    "anaya",
    "andy",
    "archer",
    "dylan",
    "emmanuel",
    "ethan",
    "evelyn",
    "gavin",
    "gordon",
    "ivan",
    "madison",
    "marisol",
    "meera",
    "walter",
  ].map((name) => ({
    name: name as PrebuiltVoiceName,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    tagline: "Chatterbox preset",
  })),
];

export interface GeneratedClipItem {
  id: string;
  scriptText: string;
  videoUrl?: string;
  audioUrl?: string;
  frameUrl: string;
  aspectRatio: "16:9" | "9:16";
  createdAt: string;
}

type RunpodEndpointCheck = {
  status: "ready" | "unavailable" | "not_configured";
  error?: string;
};

export const SimpleAvatarStudio: React.FC = () => {
  // Active Left Panel Section ('create' | 'avatars' | 'voices' | 'history')
  const [activeSection, setActiveSection] = useState<
    "create" | "avatars" | "voices" | "history"
  >("create");

  // Avatar & Uploaded Sample Video state
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [referenceFrameUrl, setReferenceFrameUrl] = useState<string>("");
  const [lookDescription, setLookDescription] = useState<string>("");
  const [voiceStyle, setVoiceStyle] = useState<string>(EMPTY_AVATAR.voiceStyle);
  const [analyzingSample, setAnalyzingSample] = useState<boolean>(false);
  const [showAdvancedTuning, setShowAdvancedTuning] = useState<boolean>(false);

  // Script & Voice state
  const [topicPrompt, setTopicPrompt] = useState<string>("");
  const [spokenScript, setSpokenScript] = useState<string>(
    "Welcome! Turn your ideas into a talking presenter in seconds.",
  );
  const [voiceName, setVoiceName] = useState<PrebuiltVoiceName>("lucy");
  const addAvatar = useStudioStore((state) => state.addAvatar);
  const updateAvatar = useStudioStore((state) => state.updateAvatar);
  const addVoiceProfile = useStudioStore((state) => state.addVoiceProfile);
  const avatarProfiles = useStudioStore((state) => state.avatars);
  const setDefaultAvatarId = useStudioStore(
    (state) => state.setDefaultAvatarId,
  );
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedCustomVoiceProfileId, setSelectedCustomVoiceProfileId] =
    useState<string | null>(null);
  const voiceProfiles = useStudioStore((state) => state.voices);
  const customVoiceProfiles = voiceProfiles.filter(
    (profile) => profile.elevenLabsVoiceId && !profile.requiresVerification,
  );
  const selectedCustomVoice = customVoiceProfiles.find(
    (profile) => profile.id === selectedCustomVoiceProfileId,
  );
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [duration, setDuration] = useState("5s");
  const [engine, setEngine] = useState("runpod-musetalk");
  const [resolution, setResolution] = useState("480p");
  const [ttsProvider, setTtsProvider] = useState("runpod-chatterbox");
  const [voiceReference, setVoiceReference] = useState("");
  const [avatarPrompt, setAvatarPrompt] = useState("");
  const [creatingAvatar, setCreatingAvatar] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [endpointHealth, setEndpointHealth] = useState<{
    musetalk?: RunpodEndpointCheck & { generationEnabled: boolean; hourlyUsd: number; reservationUsd: number; maxJobSeconds: number };
    minimax?: RunpodEndpointCheck & { generationEnabled: boolean; hourlyUsd: number; reservationUsd: number; maxJobSeconds: number };
    infinitetalk: RunpodEndpointCheck;
    pvideo: RunpodEndpointCheck;
  } | null>(null);
  const [checkingEndpoints, setCheckingEndpoints] = useState(false);
  const activeJobId = useStudioStore((state) => state.activeJobId);
  const setActiveJobId = useStudioStore((state) => state.setActiveJobId);
  const [previewKey, setPreviewKey] = useState("");
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const voiceKey = JSON.stringify([
    spokenScript.trim(),
    voiceName,
    selectedCustomVoice?.elevenLabsVoiceId,
    ttsProvider,
    voiceReference,
  ]);
  const voiceReady = previewKey === voiceKey;
  const estimatedCost =
    engine === "runpod-musetalk"
      ? endpointHealth?.musetalk?.reservationUsd ?? 0.10
      : engine === "minimax-h3"
      ? endpointHealth?.minimax?.reservationUsd ?? 0.54
      : engine === "runpod-infinitetalk"
      ? resolution === "480p"
        ? 0.25
        : 0.5
      : (voiceReady && audioDuration ? audioDuration : parseInt(duration)) *
        (engine === "runpod-pvideo"
          ? resolution === "1080p"
            ? 0.04
            : 0.02
          : 0.02);
  const minimaxBlocked = engine === "minimax-h3" &&
    (endpointHealth?.minimax?.status !== "ready" || !endpointHealth.minimax.generationEnabled);
  const musetalkBlocked = engine === "runpod-musetalk" &&
    (endpointHealth?.musetalk?.status !== "ready" || !endpointHealth.musetalk.generationEnabled);
  const renderCostLabel = ["minimax-h3", "runpod-musetalk"].includes(engine)
    ? `Budget reserve $${estimatedCost.toFixed(2)}` : `Est. $${estimatedCost.toFixed(2)}`;

  const [showCaptions, setShowCaptions] = useState<boolean>(true);

  const [writingScript, setWritingScript] = useState<boolean>(false);
  const [enhancingText, setEnhancingText] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<boolean>(false);
  const [playingVoicePreview, setPlayingVoicePreview] =
    useState<boolean>(false);
  const [voiceCloneName, setVoiceCloneName] = useState("My Voice");
  const [voiceCloneFile, setVoiceCloneFile] = useState<File | null>(null);
  const [voiceCloneConsent, setVoiceCloneConsent] = useState(false);
  const [voiceCloneLoading, setVoiceCloneLoading] = useState(false);
  const [voiceCloneMessage, setVoiceCloneMessage] = useState<string | null>(
    null,
  );

  // Generation & Output state
  const [genStage, setGenStage] = useState<
    "idle" | "tts" | "veo" | "completed" | "error"
  >("idle");
  const [genProgress, setGenProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(
    null,
  );
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null,
  );
  const [resultScript, setResultScript] = useState("");
  const [isPlayingResult, setIsPlayingResult] = useState<boolean>(false);
  const [history, setHistory] = useState<GeneratedClipItem[]>([]);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const resultVideoRef = useRef<HTMLVideoElement | null>(null);
  const resultAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadedAvatarIdRef = useRef<string | null>(null);
  const voiceCloneFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const currentPreset = EMPTY_AVATAR;

  const saveUploadedAvatar = (
    imageUrl: string,
    fileName: string,
    description: string,
    sourceVideoUrl?: string,
  ) => {
    const name = fileName.replace(/\.[^/.]+$/, "").trim() || "My Avatar";
    const avatar = {
      name,
      imageUrl,
      sourceVideoUrl,
      lookDescription: description || "User-provided avatar reference",
      outfitVariant: "User-uploaded reference",
    };
    const avatarId = uploadedAvatarIdRef.current || addAvatar(avatar);
    if (uploadedAvatarIdRef.current) updateAvatar(avatarId, avatar);
    uploadedAvatarIdRef.current = avatarId;
    setSelectedAvatarId(avatarId);
    setDefaultAvatarId(avatarId);
  };

  const selectSavedAvatar = (avatarId: string) => {
    const avatar = avatarProfiles.find((item) => item.id === avatarId);
    if (!avatar) return;
    uploadedAvatarIdRef.current = avatar.id;
    setSelectedAvatarId(avatar.id);
    setDefaultAvatarId(avatar.id);
    setUploadedFileName(avatar.name);
    setReferenceFrameUrl(avatar.imageUrl);
    setLookDescription(avatar.lookDescription);
    setUploadedVideoUrl(avatar.sourceVideoUrl || null);
    setErrorMessage(null);
  };

  // Upload a Sample Video (.mp4, .webm, .mov) or Photo
  const handleSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    uploadedAvatarIdRef.current = null;
    setSelectedAvatarId(null);
    setReferenceFrameUrl("");
    setUploadedVideoUrl(null);
    setLookDescription("");
    setVoiceStyle(EMPTY_AVATAR.voiceStyle);
    setUploadedFileName(file.name);

    const objectUrl = URL.createObjectURL(file);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Upload a photo or avatar video of up to 20 MB.");
      if (!file.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read this avatar video."));
          reader.readAsDataURL(file);
        });
        const response = await fetch(`${API_BASE_URL}/avatars/upload-video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
        const result = await readApiJson(response);
        if (!response.ok) throw new Error(result.error || "Avatar video upload failed.");
        setUploadedVideoUrl(result.videoUrl);
        setReferenceFrameUrl(result.imageUrl);
        setAspectRatio(result.aspectRatio);
        saveUploadedAvatar(result.imageUrl, file.name, "Video avatar — original movement preserved", result.videoUrl);
        return;
      }
      const frame = await new Promise<string>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        const capture = (
          source: CanvasImageSource,
          width: number,
          height: number,
        ) => {
          const scale = Math.min(1, 1024 / Math.max(width, height));
          if (Math.min(width, height) < 256) {
            reject(new Error("Use a sharper photo at least 256 pixels on each side, with one clearly visible face."));
            return;
          }
          setAspectRatio(height > width ? "9:16" : "16:9");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Canvas is unavailable"));
            return;
          }
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.95));
        };
        if (file.type.startsWith("image/")) {
          const image = new Image();
          image.onload = () =>
            capture(image, image.naturalWidth, image.naturalHeight);
          image.onerror = () => reject(new Error("Could not read this image"));
          image.src = objectUrl;
        } else {
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.onloadeddata = () => {
            video.currentTime = Math.min(0.1, video.duration / 2 || 0.1);
          };
          video.onseeked = () => {
            capture(video, video.videoWidth, video.videoHeight);
            video.removeAttribute("src");
            video.load();
          };
          video.onerror = () =>
            reject(new Error("Could not extract a frame; try a photo"));
          video.src = objectUrl;
        }
      });
      setUploadedVideoUrl(null);
      setReferenceFrameUrl(frame);
      saveUploadedAvatar(frame, file.name, "User-provided avatar reference");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const analyzeUploadedSample = async (frameDataUrl?: string) => {
    setAnalyzingSample(true);
    try {
      const response = await fetch(`${API_BASE_URL}/sample/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameDataUrl }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      if (response.ok) {
        if (data.lookDescription) {
          setLookDescription(data.lookDescription);
          if (uploadedAvatarIdRef.current) {
            updateAvatar(uploadedAvatarIdRef.current, {
              lookDescription: data.lookDescription,
            });
          }
        }
        if (data.voiceStyle) setVoiceStyle(data.voiceStyle);
        // A photo cannot identify the user’s voice; retain the selected voice.
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Analysis failed",
      );
    } finally {
      setAnalyzingSample(false);
    }
  };

  const handleWriteScriptFromPrompt = async () => {
    if (!topicPrompt.trim() && !spokenScript.trim()) return;
    setWritingScript(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/script/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicPrompt.trim() || undefined,
          text: spokenScript.trim(),
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok || !data.script) {
        throw new Error(data.error || "Could not generate script.");
      }
      setSpokenScript(data.script);
      setTopicPrompt("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Script generation failed.",
      );
    } finally {
      setWritingScript(false);
    }
  };

  const handleEnhanceScript = async () => {
    const text = spokenScript.trim();
    if (!text) {
      setErrorMessage("Enter a script to enhance first.");
      return;
    }
    setEnhancingText(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/llm/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "script", text }),
      });
      const data = await readApiJson(response);
      if (!response.ok || !data.text)
        throw new Error(data.error || "Could not enhance the text.");
      setSpokenScript(data.text);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Text enhancement failed.",
      );
    } finally {
      setEnhancingText(false);
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
      setErrorMessage("Please enter what the avatar should say first.");
      return;
    }

    resultVideoRef.current?.pause();
    resultAudioRef.current?.pause();
    setPreviewingVoice(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: spokenScript.trim(),
          provider: ttsProvider,
          voiceUrl: voiceReference || undefined,
          voiceName,
          elevenLabsVoiceId: selectedCustomVoice?.elevenLabsVoiceId,
        }),
      });
      let data = await readApiJson(response);
      if (!response.ok) {
        throw new Error(data.error || "Voice preview failed.");
      }
      if (data.jobId && !data.audioUrl) {
        for (let attempt = 0; attempt < 180; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          const statusResponse = await fetch(
            `${API_BASE_URL}/veo/status/${encodeURIComponent(data.jobId)}`,
          );
          const status = await readApiJson(statusResponse);
          if (!statusResponse.ok)
            throw new Error(status.error || "Could not check speech status.");
          if (status.status === "failed")
            throw new Error(status.error || "Speech generation failed.");
          if (status.status === "completed" && status.audioUrl) {
            data = status;
            break;
          }
        }
      }
      if (!data.audioUrl) {
        throw new Error(
          "Voice generation is taking longer than expected. It may still be queued; check Runpod status before retrying.",
        );
      }
      const audio = new Audio(data.audioUrl);
      const seconds = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Could not load voice duration. Preview again before rendering.")), 15000);
        audio.onloadedmetadata = () => {
          clearTimeout(timer);
          if (!Number.isFinite(audio.duration) || audio.duration <= 0)
            reject(new Error("The voice preview has an invalid duration."));
          else resolve(audio.duration);
        };
        audio.onerror = () => { clearTimeout(timer); reject(new Error("Could not load the voice preview.")); };
        audio.load();
      });
      setAudioDuration(seconds);
      setGeneratedVideoUrl(null);
      setGeneratedAudioUrl(data.audioUrl);
      setPreviewKey(voiceKey);
      void refreshUsage();
      previewAudioRef.current = audio;
      setPlayingVoicePreview(true);
      audio.onpause = () => setPlayingVoicePreview(false);
      audio.onended = () => setPlayingVoicePreview(false);
      audio.onerror = () => setPlayingVoicePreview(false);
      await audio.play();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not synthesize voice.",
      );
    } finally {
      setPreviewingVoice(false);
    }
  };

  const handleCreateVoiceClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceCloneFile || !voiceCloneConsent || !voiceCloneName.trim()) return;

    setVoiceCloneLoading(true);
    setVoiceCloneMessage(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read the selected audio file."));
        reader.onerror = () =>
          reject(new Error("Could not read the selected audio file."));
        reader.readAsDataURL(voiceCloneFile);
      });
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex < 0)
        throw new Error("The selected audio file is invalid.");

      const response = await fetch(`${API_BASE_URL}/voice/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: voiceCloneName.trim(),
          mimeType: voiceCloneFile.type,
          audioBase64: dataUrl.slice(commaIndex + 1),
          consent: voiceCloneConsent,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok || !data.voiceId) {
        throw new Error(data.error || "Could not clone this voice sample.");
      }

      const profileId = addVoiceProfile({
        name: voiceCloneName.trim(),
        elevenLabsVoiceId: data.voiceId,
        requiresVerification: Boolean(data.requiresVerification),
        pace: 1,
        tone: "warm",
        accentNotes: "Voice cloned from an authorized recording",
      });
      setVoiceCloneName("My Voice");
      setVoiceCloneFile(null);
      setVoiceCloneConsent(false);
      if (voiceCloneFileInputRef.current) {
        voiceCloneFileInputRef.current.value = "";
      }
      if (data.requiresVerification) {
        setVoiceCloneMessage(
          "Voice created, but ElevenLabs requires verification before use. Complete verification in your ElevenLabs account.",
        );
      } else {
        setSelectedCustomVoiceProfileId(profileId);
        setVoiceCloneMessage(
          "Voice added. It is now selected in the voice menu.",
        );
      }
    } catch (err) {
      setVoiceCloneMessage(
        err instanceof Error
          ? err.message
          : "Could not clone this voice sample.",
      );
    } finally {
      setVoiceCloneLoading(false);
    }
  };

  const refreshUsage = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/usage/summary`);
      if (response.ok) setUsage(await readApiJson(response));
    } catch {
      /* Keep the last known summary while offline. */
    }
  };
  const checkVideoEndpoints = async (silent = false) => {
    setCheckingEndpoints(true);
    if (!silent) setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/runpod/health`);
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "Endpoint check failed");
      setEndpointHealth(data);
    } catch (error) {
      if (!silent) setErrorMessage(
        error instanceof Error ? error.message : "Could not check endpoints",
      );
    } finally {
      setCheckingEndpoints(false);
    }
  };
  useEffect(() => {
    void refreshUsage();
  }, []);
  useEffect(() => {
    void checkVideoEndpoints(true);
    const timer = setInterval(() => void checkVideoEndpoints(true), 30000);
    return () => clearInterval(timer);
  }, [engine]);
  useEffect(() => {
    if (!activeJobId) return;
    let stopped = false;
    let busy = false;
    setGenStage("veo");
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(
          `${API_BASE_URL}/veo/status/${encodeURIComponent(activeJobId)}`,
        );
        const data = await readApiJson(response);
        if (stopped) return;
        if (!response.ok)
          throw new Error(data.error || "Could not check render");
        if (data.status === "completed" && data.videoUrl) {
          setGeneratedVideoUrl(data.videoUrl);
          setResultScript(data.source?.script || spokenScript);
          setGenStage("completed");
          setGenProgress(100);
          setActiveJobId(null);
          void refreshUsage();
          setHistory((previous) => [
            {
              id: activeJobId,
              scriptText: data.source?.script || spokenScript,
              videoUrl: data.videoUrl,
              frameUrl: data.source?.image || referenceFrameUrl,
              aspectRatio: data.source?.aspectRatio || aspectRatio,
              createdAt: new Date().toLocaleTimeString(),
            },
            ...previous,
          ]);
        } else if (["failed", "cancelled", "submission_unknown"].includes(data.status)) {
          setGenStage("error");
          setErrorMessage(data.error || "Render failed");
          setActiveJobId(null);
          void refreshUsage();
        } else {
          if (data.provider === "minimax-h3") setGenProgress(Math.max(0, Math.min(99, data.source?.minimax?.progress || 0)));
          else setGenProgress((previous) => Math.min(95, previous + 2));
        }
      } catch (error) {
        if (!stopped)
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Connection interrupted; your render continues on the server",
          );
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeJobId, setActiveJobId]);

  const handleGenerateAvatarVideo = async () => {
    if (!referenceFrameUrl || !voiceReady || !generatedAudioUrl) {
      setErrorMessage("Preview the current script and voice before rendering.");
      return;
    }
    if (engine === "runpod-pvideo" && audioDuration && audioDuration > 10) {
      setErrorMessage("P-Video supports up to 10 seconds of speech. Shorten the script and preview again.");
      return;
    }
    if (engine === "minimax-h3" && audioDuration && audioDuration > 15) {
      setErrorMessage("MiniMax-H3 supports up to 15 seconds of speech. Shorten the script and preview again.");
      return;
    }
    if (engine === "runpod-musetalk" && audioDuration && audioDuration > 60) {
      setErrorMessage("Use up to 60 seconds of speech per avatar clip.");
      return;
    }
    if (musetalkBlocked) {
      setErrorMessage("The avatar worker is not ready yet. Your avatar and speech are saved.");
      return;
    }
    if (minimaxBlocked) {
      setErrorMessage(endpointHealth?.minimax?.generationEnabled ? "MiniMax-H3 is loading or unavailable." : "MiniMax generation is awaiting approval.");
      return;
    }
    previewAudioRef.current?.pause();
    resultAudioRef.current?.pause();
    setErrorMessage(null);
    setGenStage("veo");
    setGenProgress(15);
    try {
      const response = await fetch(`${API_BASE_URL}/veo/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine,
          resolution,
          duration,
          aspectRatio,
          script: spokenScript.trim(),
          audioUrl: generatedAudioUrl,
          audioDuration,
          avatarImageUrl: referenceFrameUrl,
          avatarVideoUrl: engine === "runpod-musetalk" ? uploadedVideoUrl || undefined : undefined,
          prompt: buildLipSyncPrompt(),
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok || !data.jobId)
        throw new Error(data.error || "Could not start render");
      setActiveJobId(data.jobId);
      void refreshUsage();
    } catch (error) {
      setGenStage("error");
      setErrorMessage(error instanceof Error ? error.message : "Render failed");
    }
  };

  const handleCancelMinimax = async () => {
    if (!activeJobId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/veo/cancel/${encodeURIComponent(activeJobId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await readApiJson(response);
      if (!response.ok) throw new Error(result.error || "Could not cancel this render");
      if (result.status === "cancelled") {
        setActiveJobId(null); setGenStage("idle"); setGenProgress(0);
        setErrorMessage("Rendering cancelled. GPU runtime already used is recorded.");
        void refreshUsage();
      }
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Could not cancel this render"); }
  };

  const handleTogglePlayResult = () => {
    if (isPlayingResult) resultVideoRef.current?.pause();
    else {
      previewAudioRef.current?.pause();
      resultAudioRef.current?.pause();
      void resultVideoRef.current?.play();
    }
  };

  const handleGenerateImage = async () => {
    setCreatingAvatar(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/avatars/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: avatarPrompt }),
      });
      const data = await readApiJson(response);
      if (!response.ok)
        throw new Error(data.error || "Avatar generation failed");
      setReferenceFrameUrl(data.imageUrl);
      setUploadedVideoUrl(null);
      uploadedAvatarIdRef.current = null;
      saveUploadedAvatar(data.imageUrl, "Generated avatar", avatarPrompt);
      setUploadedFileName("Generated avatar");
      void refreshUsage();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Avatar generation failed",
      );
    } finally {
      setCreatingAvatar(false);
    }
  };

  const estimatedSecs = estimateDurationSeconds(spokenScript, 1.0, false);
  const estimatedVoiceCost =
    Math.max(1, spokenScript.trim().split(/\s+/).length / 2.5) *
    (selectedCustomVoice ? 0.003 : 0.001);
  const activeVoiceInfo =
    VOICE_CHOICES.find((v) => v.name === voiceName) || VOICE_CHOICES[0];
  const activeVoiceLabel = selectedCustomVoice?.name || activeVoiceInfo.label;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#090D16] text-[#F1F5F9] flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800/80 bg-[#0B0F19] shrink-0">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection("create");
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
              { id: "create", label: "Studio" },
              { id: "avatars", label: "Avatars" },
              { id: "voices", label: "Voices" },
              { id: "history", label: "Videos" },
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
                    ? "text-white border-indigo-400 font-semibold"
                    : "text-slate-400 border-transparent hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className="text-xs rounded-full border border-slate-700 px-3 py-2"
          onClick={() => {
            setShowUsage(!showUsage);
            void refreshUsage();
          }}
        >
          Spend & Usage{" "}
          {usage
            ? `$${usage.todaySpendUsd.toFixed(2)} / $${usage.dailyCapUsd.toFixed(2)}`
            : ""}
        </button>
        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={
              !referenceFrameUrl ||
              !voiceReady ||
              minimaxBlocked ||
              genStage === "tts" ||
              genStage === "veo"
            }
            onClick={handleGenerateAvatarVideo}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            {genStage === "tts" || genStage === "veo" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating ({genProgress}%)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Render ({renderCostLabel})</span>
              </>
            )}
          </button>
        </div>
      </header>

      {showUsage && (
        <section
          aria-label="Spend and usage"
          className="p-4 bg-slate-900 max-h-72 overflow-y-auto border-b border-slate-700"
        >
          <h2 className="font-semibold">Generation budget & usage (UTC)</h2>
          {usage ? (
            <>
              <p>
                App reservations today ${usage.todaySpendUsd.toFixed(4)} / $
                {usage.dailyCapUsd.toFixed(2)} · Month $
                {usage.monthSpendUsd.toFixed(4)} / $
                {usage.monthlyCapUsd.toFixed(2)}
              </p>
              <p>
                {usage.cacheHitsCount} cache hits · $
                {usage.savedByCacheUsd.toFixed(4)} saved
              </p>
              <p className="text-xs text-slate-400">
                Job costs below are execution allocations, not the provider invoice.
                Startup, idle time and storage can add charges. Reservations remain
                in the admission budget until billing is reconciled.
              </p>
              <p className="text-xs text-slate-300">
                Runpod account billing today: {usage.providerBilling?.snapshot?.dayBilledUsd == null ? "not reported yet" : `$${usage.providerBilling.snapshot.dayBilledUsd.toFixed(4)}`}.
                {usage.providerBilling?.enabled && !usage.providerBilling.fresh && " Billing check unavailable; new generation is paused."}
                {usage.providerBilling?.enabled && " Admission also counts reported account charges, so it may reserve the same usage conservatively."}
              </p>
              {usage.engineBreakdown.map((item) => (
                <p key={item.provider} className="text-xs">
                  {item.provider}: ${item.costUsd.toFixed(4)}
                </p>
              ))}
              <ul>
                {usage.jobs.map((job) => (
                  <li key={job.id} className="text-xs py-1">
                    {job.provider} · {job.status} · $
                    {(job.actual_cost_usd ?? job.est_cost_usd).toFixed(4)}{" "}
                    {job.status === "completed" && job.local_media_url && (
                      <a
                        className="text-indigo-300 underline"
                        href={job.local_media_url}
                        download
                      >
                        Download{" "}
                        {job.provider.includes("tts") ||
                        job.provider.includes("chatterbox")
                          ? "audio"
                          : job.provider.includes("zimage")
                            ? "image"
                            : "media"}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Usage is unavailable. Try opening this panel again.</p>
          )}
        </section>
      )}
      {/* HeyGen-Inspired Split Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Panel (5 Cols): HeyGen-Style Avatar & Script Composer */}
        <div className="lg:col-span-5 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-[#0E1320] p-6 space-y-6">
          <div className="space-y-2 text-xs">
            <label className="block">
              Video engine
              <select
                className="block w-full p-2 bg-slate-900 rounded"
                value={engine}
                disabled={genStage === "veo"}
                onChange={(event) => {
                  const value = event.target.value;
                  setEngine(value);
                  setDuration("5s");
                  setResolution(["minimax-h3", "runpod-musetalk"].includes(value) ? "480p" : "720p");
                }}
              >
                <option value="runpod-musetalk">
                  Studio lip-sync · budget
                </option>
                <option value="minimax-h3">
                  MiniMax-H3 · talking avatar
                </option>
                <option value="runpod-infinitetalk">
                  InfiniteTalk · exact audio lip-sync
                </option>
                <option value="runpod-pvideo">
                  Pruna Video · low-cost video
                </option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void checkVideoEndpoints()}
              disabled={checkingEndpoints}
              className="text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-60"
            >
              {checkingEndpoints ? "Checking Runpod endpoints..." : "Check video endpoints"}
            </button>
            {endpointHealth && (
              <div className="space-y-1 text-[11px]" role="status">
                {(
                  [
                    ["Studio lip-sync", endpointHealth.musetalk],
                    ["MiniMax-H3", endpointHealth.minimax],
                    ["InfiniteTalk", endpointHealth.infinitetalk],
                    ["P-Video", endpointHealth.pvideo],
                  ] as const
                ).map(([name, check]) => check && (
                  <p
                    key={name}
                    className={
                      check.status === "ready"
                        ? "text-emerald-400"
                        : "text-amber-300"
                    }
                  >
                    {name}:{" "}
                    {check.status === "ready"
                      ? "ready"
                      : check.error || "endpoint ID not configured"}
                  </p>
                ))}
              </div>
            )}
            {engine === "minimax-h3" && (
              <p className="text-[11px] text-slate-400" role="status">
                {endpointHealth?.minimax?.status === "ready"
                  ? endpointHealth.minimax.generationEnabled ? "MiniMax-H3 is ready." : "MiniMax-H3 is connected. Generation awaits approval."
                  : "MiniMax-H3 is loading or unavailable. Readiness updates automatically."}
                {" "}Speech up to 15 seconds. Your selected voice track is preserved in the {resolution} export.
                {" "}{renderCostLabel} for rendering; final usage follows elapsed GPU time. The running pod also bills while idle.
              </p>
            )}
            {engine === "runpod-musetalk" && (
              <p className="text-[11px] text-slate-400" role="status">
                {endpointHealth?.musetalk?.status === "not_configured" ? "The avatar worker has not been deployed yet." : musetalkBlocked ? "The avatar worker is not ready to render yet." : "Ready for lip-sync."}
                {" "}{uploadedVideoUrl ? "Your video supplies the head and body movement; shorter clips loop forwards and backwards." : "Your photo supplies the appearance; this mode animates the mouth."}
                {" "}Clips up to 60 seconds. Your supplied voice is preserved. {renderCostLabel} per job. Execution estimates exclude startup, idle time and storage; provider billing is the final charge.
              </p>
            )}
            <label className="block">
              Resolution{" "}
              <select
                className="p-2 bg-slate-900 rounded"
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
              >
                {(engine === "runpod-infinitetalk" || engine === "minimax-h3"
                  ? ["480p", "720p"]
                  : engine === "runpod-pvideo"
                    ? ["720p", "1080p"]
                    : engine === "runpod-musetalk" ? ["480p"] : ["720p"]
                ).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Speech provider{" "}
              <select
                value={ttsProvider}
                onChange={(event) => setTtsProvider(event.target.value)}
                className="p-2 bg-slate-900 rounded"
              >
                <option value="runpod-chatterbox">
                  Runpod Chatterbox Turbo
                </option>
              </select>
            </label>
            {ttsProvider === "runpod-chatterbox" && !selectedCustomVoice && (
              <label className="block">
                Optional voice reference (your voice or used with permission)
                <input
                  type="file"
                  accept="audio/wav,audio/mpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 20 * 1024 * 1024) {
                      setErrorMessage("Voice reference must be under 20 MB");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setVoiceReference(String(reader.result));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
            <button
              type="button"
              className="text-indigo-300 underline"
              disabled={!referenceFrameUrl || analyzingSample}
              onClick={() => void analyzeUploadedSample(referenceFrameUrl)}
            >
              Auto-Detect Style
            </button>
            <div className="flex flex-wrap gap-2">
              <input
                aria-label="Avatar image prompt"
                className="bg-slate-900 p-2 rounded min-w-0 flex-1"
                placeholder="Optional: describe a new avatar to generate"
                value={avatarPrompt}
                onChange={(event) => setAvatarPrompt(event.target.value)}
              />
              <button
                type="button"
                disabled={!avatarPrompt.trim() || creatingAvatar}
                onClick={() => void handleGenerateImage()}
              >
                {creatingAvatar ? "Creating…" : "Generate ($0.005)"}
              </button>
            </div>
          </div>
          {/* Section 1: Presenter / Sample Video Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white font-display">
                Create Your First Avatar
              </h2>
              {analyzingSample ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-indigo-400 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Matching look & voice...
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  {uploadedFileName
                    ? "Your avatar is ready"
                    : currentPreset.role}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <label
                htmlFor="sample-video-upload"
                className="group flex items-center gap-3 p-4 rounded-xl border border-dashed border-indigo-500/70 bg-indigo-950/20 hover:bg-indigo-950/40 transition-all text-left cursor-pointer"
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    Upload Your Photo or Video
                  </span>
                  <span className="block text-xs text-slate-400 mt-0.5">
                    Use one front-facing, well-lit face with the mouth visible. Avoid blur and obstructions.
                  </span>
                </span>
                <input
                  id="sample-video-upload"
                  type="file"
                  accept="video/*,image/*"
                  onChange={handleSampleUpload}
                  className="sr-only"
                />
              </label>
            </div>
            {avatarProfiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300">
                  Your saved avatars
                </p>
                <div className="flex flex-wrap gap-2">
                  {avatarProfiles.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => selectSavedAvatar(avatar.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                        selectedAvatarId === avatar.id
                          ? "border-indigo-500 bg-indigo-950/40 text-white"
                          : "border-slate-700 bg-[#090D16] text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      <img
                        src={avatar.imageUrl}
                        alt=""
                        className="w-7 h-7 rounded object-cover"
                      />
                      <span className="max-w-32 truncate">{avatar.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: HeyGen-Style Scene Script Card */}
          <div className="rounded-xl bg-[#090D16] border border-slate-800/90 overflow-hidden flex flex-col">
            {/* Script Card Header: Active Avatar Mini-Lockup + Voice Selector + Test Voice */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800/80 bg-[#111827]/60">
              <div className="flex items-center gap-2.5 min-w-0">
                {referenceFrameUrl ? (
                  <img
                    src={referenceFrameUrl}
                    alt="Active Avatar"
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <div
                    aria-label="No avatar selected"
                    className="w-7 h-7 rounded-full border border-dashed border-slate-700 shrink-0 flex items-center justify-center"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-300" />
                  </div>
                )}
                <span className="text-xs font-semibold text-white truncate">
                  {uploadedFileName || currentPreset.name}
                </span>
                <span className="text-slate-600">·</span>
                <select
                  aria-label="Voice"
                  value={
                    selectedCustomVoice
                      ? `elevenlabs:${selectedCustomVoice.id}`
                      : voiceName
                  }
                  onChange={(e) => {
                    if (e.target.value.startsWith("elevenlabs:")) {
                      setSelectedCustomVoiceProfileId(
                        e.target.value.slice("elevenlabs:".length),
                      );
                    } else {
                      setSelectedCustomVoiceProfileId(null);
                      setVoiceName(e.target.value as PrebuiltVoiceName);
                    }
                  }}
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
                  {customVoiceProfiles.map((profile) => (
                    <option
                      key={profile.id}
                      value={`elevenlabs:${profile.id}`}
                      className="bg-[#0E1320] text-white"
                    >
                      Voice: {profile.name} (your cloned voice)
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
                <span>
                  {playingVoicePreview
                    ? "Stop Voice"
                    : `1. Preview Voice (${estimatedVoiceCost < 0.01 ? "<$0.01" : "Est. $" + estimatedVoiceCost.toFixed(2)})`}
                </span>
              </button>
            </div>

            {/* Spoken Script Textarea */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="spoken-script-textarea"
                  className="text-xs font-medium text-slate-300"
                >
                  Spoken script
                </label>
                <button
                  type="button"
                  disabled={!spokenScript.trim() || enhancingText}
                  onClick={() => void handleEnhanceScript()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-200 hover:text-white bg-indigo-950/60 hover:bg-indigo-600 border border-indigo-800/60 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wand2 className="w-3 h-3" />
                  {enhancingText ? "Enhancing script..." : "Enhance spoken script"}
                </button>
              </div>
              <textarea
                id="spoken-script-textarea"
                maxLength={5000}
                aria-label="Spoken Script"
                rows={4}
                value={spokenScript}
                onChange={(e) => setSpokenScript(e.target.value)}
                placeholder="Type what you want your avatar to say..."
                className="w-full text-sm bg-transparent text-slate-100 placeholder:text-slate-500 leading-relaxed focus:outline-none resize-none"
              />

              {/* AI Prompt Assist Bar inside the Script Card */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <input
                  type="text"
                  aria-label="AI Script Prompt"
                  value={topicPrompt}
                  onChange={(e) => setTopicPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
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
                  {writingScript ? "Writing..." : "AI Write"}
                </button>
              </div>
            </div>

            {/* Card Footer: Estimated Duration + Sample Tuning Toggle */}
            <div className="px-4 py-2.5 bg-[#111827]/40 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono tabular-nums">
                {spokenScript.trim().split(/\s+/).filter(Boolean).length} words
                · ~{estimatedSecs.toFixed(1)}s speech
              </span>

              <button
                type="button"
                onClick={() => setShowAdvancedTuning(!showAdvancedTuning)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>
                  {showAdvancedTuning
                    ? "Hide Sample Match Details"
                    : "Avatar Look & Voice Settings"}
                </span>
              </button>
            </div>
          </div>

          {/* Collapsible Sample Match Tuning Drawer (keeps UI ultra-clean by default) */}
          {(showAdvancedTuning ||
            activeSection === "voices" ||
            activeSection === "avatars") && (
            <div className="p-4 rounded-xl bg-[#090D16] border border-slate-800/90 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">
                  Extracted Sample Characteristics
                </span>
                <span className="text-[11px] text-slate-400">
                  Optional notes from image analysis
                </span>
              </div>
              <div>
                <label
                  htmlFor="sample-look-input"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Appearance notes (your photo remains the visual reference)
                </label>
                <input
                  id="sample-look-input"
                  type="text"
                  value={lookDescription}
                  onChange={(e) => {
                    const description = e.target.value;
                    setLookDescription(description);
                    if (uploadedAvatarIdRef.current) {
                      updateAvatar(uploadedAvatarIdRef.current, {
                        lookDescription: description,
                      });
                    }
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-[#111827] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="sample-voice-style-input"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Delivery notes (for reference; voice preset or recording controls speech)
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

          {activeSection === "voices" && (
            <form
              onSubmit={handleCreateVoiceClone}
              className="p-4 rounded-xl bg-[#090D16] border border-slate-800/90 space-y-3"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Create a voice from your recording
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload 1–3 minutes of clean audio (MP3, WAV, M4A, AAC, OGG,
                  WebM, or FLAC; maximum 20 MB). Requires ELEVENLABS_API_KEY in
                  the server .env file.
                </p>
              </div>
              <label className="block text-xs text-slate-300">
                Voice name
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={voiceCloneName}
                  onChange={(event) => setVoiceCloneName(event.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm bg-[#111827] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </label>
              <label className="block text-xs text-slate-300">
                Audio recording
                <input
                  ref={voiceCloneFileInputRef}
                  type="file"
                  required
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file && file.size > 20 * 1024 * 1024) {
                      setVoiceCloneMessage(
                        "Audio sample must be no larger than 20 MB.",
                      );
                      event.target.value = "";
                      setVoiceCloneFile(null);
                      return;
                    }
                    setVoiceCloneFile(file);
                    setVoiceCloneMessage(null);
                  }}
                  className="mt-1 block w-full text-xs text-slate-300 file:mr-2 file:px-2 file:py-1.5 file:rounded-md file:border file:border-slate-700 file:bg-slate-900 file:text-slate-200"
                />
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={voiceCloneConsent}
                  onChange={(event) =>
                    setVoiceCloneConsent(event.target.checked)
                  }
                  className="mt-0.5 accent-indigo-500"
                />
                <span>
                  I confirm this is my voice or I have explicit permission to
                  create and use this voice clone.
                </span>
              </label>
              <button
                type="submit"
                disabled={
                  voiceCloneLoading || !voiceCloneFile || !voiceCloneConsent
                }
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg cursor-pointer disabled:cursor-not-allowed"
              >
                {voiceCloneLoading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {voiceCloneLoading ? "Creating voice..." : "Create voice clone"}
              </button>
              {voiceCloneMessage && (
                <p role="status" className="text-xs text-slate-300">
                  {voiceCloneMessage}
                </p>
              )}
            </form>
          )}

          {/* Primary Action Button */}
          <div className="space-y-2 pt-1">
            {["minimax-h3", "runpod-musetalk"].includes(engine) && genStage === "veo" && activeJobId && (
              <button type="button" onClick={() => void handleCancelMinimax()} className="text-xs text-amber-300 hover:text-amber-200">
                Cancel render
              </button>
            )}
            <button
              type="button"
              disabled={
                !referenceFrameUrl ||
                !voiceReady ||
                minimaxBlocked ||
                musetalkBlocked ||
                genStage === "tts" ||
                genStage === "veo"
              }
              onClick={handleGenerateAvatarVideo}
              className="w-full py-3.5 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {genStage === "tts" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Step 1/2: Synthesizing Matched Voiceover...</span>
                </>
              ) : genStage === "veo" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    Step 2/2: Rendering Talking Video ({genProgress}
                    %)...
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    2. Render Talking Video ({renderCostLabel})
                  </span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>
                {voiceReady && audioDuration
                  ? `Speech length: ${audioDuration.toFixed(1)}s. The video follows this audio.`
                  : "Preview your voice first; the video follows its exact audio timing."}
              </span>
            </p>
          </div>
        </div>

        {/* Right Stage (7 Cols): HeyGen-Style Canvas Preview & Output */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 bg-[#090D16]">
          {/* Top Floating Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/70">
            <div className="flex items-center gap-2">
              {/* Aspect Ratio Pill Toggle */}
              <div className="inline-flex items-center p-0.5 bg-[#111827] border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAspectRatio("16:9")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    aspectRatio === "16:9"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>16:9 Landscape</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio("9:16")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    aspectRatio === "9:16"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>9:16 Portrait</span>
                </button>
              </div>

              <div className="px-3 py-2 text-xs text-slate-400">
                {voiceReady && audioDuration ? `${audioDuration.toFixed(1)}s speech` : "Length follows voice"}
                {engine === "runpod-pvideo" && " · Framing follows photo"}
              </div>

              {/* Captions Toggle */}
              <button
                type="button"
                onClick={() => setShowCaptions(!showCaptions)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  showCaptions
                    ? "bg-[#111827] text-indigo-300 border-indigo-500/50"
                    : "bg-[#111827] text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" />
                <span>{showCaptions ? "Captions On" : "Captions Off"}</span>
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
                aspectRatio === "9:16"
                  ? "aspect-[9/16] h-[440px]"
                  : "aspect-video w-full max-w-[700px]"
              }`}
            >
              {/* Soft Ambient Studio Backdrop Blur so 1:1 portraits fill 16:9 harmoniously */}
              {!generatedVideoUrl && !uploadedVideoUrl && referenceFrameUrl && (
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
                    previewAudioRef.current?.pause();
                    resultAudioRef.current?.pause();
                  }}
                  onPause={() => setIsPlayingResult(false)}
                  onEnded={() => setIsPlayingResult(false)}
                  className="relative z-10 w-full h-full object-contain"
                />
              ) : uploadedVideoUrl ? (
                <video
                  src={uploadedVideoUrl}
                  controls
                  playsInline
                  className="relative z-10 w-full h-full object-contain"
                />
              ) : referenceFrameUrl ? (
                <img
                  src={referenceFrameUrl}
                  alt={uploadedFileName || currentPreset.name}
                  referrerPolicy="no-referrer"
                  className="relative z-10 h-full object-contain drop-shadow-2xl"
                />
              ) : (
                <div className="relative z-10 px-8 text-center">
                  <Upload className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-white">
                    Upload a photo or video to create your first avatar
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Your avatar will be saved to your library automatically.
                  </p>
                </div>
              )}

              {/* Subtle Top Stage Status Overlay */}
              <div className="absolute top-3.5 left-4 right-4 z-20 flex items-center justify-between text-xs text-slate-200/90 drop-shadow pointer-events-none">
                <span>
                  {uploadedFileName || currentPreset.name} · {activeVoiceLabel}{" "}
                  Voice
                </span>
                <span className="font-mono text-[11px]">
                  {generatedVideoUrl
                    ? "Talking Video Ready"
                    : uploadedVideoUrl
                      ? "Sample Video Loaded"
                      : "Studio Preview"}
                </span>
              </div>

              {/* LiveGeneration Progress Scrim */}
              {(genStage === "tts" || genStage === "veo") && (
                <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  <div className="space-y-1 max-w-sm">
                    <p className="text-sm font-semibold text-white font-display">
                      {genStage === "tts"
                        ? "Step 1/2: Synthesizing selected voiceover..."
                        : `Step 2/2: Rendering Talking Video (${genProgress}%)...`}
                    </p>
                    <p className="text-xs text-slate-300">
                      Animating {uploadedFileName || currentPreset.name}{" "}
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
              {showCaptions && (generatedVideoUrl ? resultScript : spokenScript).trim() && (
                <div className="absolute inset-x-6 bottom-5 z-20 pointer-events-none flex justify-center">
                  <div className="px-4 py-2 rounded-xl bg-black/75 backdrop-blur-xs border border-white/10 text-xs sm:text-sm text-white text-center max-w-[92%] leading-snug shadow-xl">
                    {(generatedVideoUrl ? resultScript : spokenScript).trim()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Stage Bar: Audio Player / Recent Clips */}
          <div className="pt-4 border-t border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {generatedAudioUrl && !generatedVideoUrl ? (
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
                    <span>{isPlayingResult ? "Pause" : "Play Video"}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Film className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Upload a photo or video on the left, enter your script, and
                  click{" "}
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
                      if (clip.videoUrl) { setGeneratedVideoUrl(clip.videoUrl); setResultScript(clip.scriptText); }
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
