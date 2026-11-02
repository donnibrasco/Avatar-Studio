import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import {
  AspectRatioOption,
  AvatarItem,
  CaptionSettings,
  SceneItem,
  StudioSnapshot,
  VoiceProfile,
  WorkspaceTab,
} from '../types/studio';
import {
  estimateDurationSeconds,
  splitSceneAtMidpoint,
  splitScriptIntoScenes,
} from '../utils/studioLogic';

const indexedDbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await get(name);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value);
    } catch {
      // Ignore IndexedDB quota errors in restricted sandboxes
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name);
    } catch {
      // Ignore
    }
  },
};

export const INITIAL_AVATARS: AvatarItem[] = [
  {
    id: 'avatar-elena',
    name: 'Elena Vance',
    imageUrl: '/src/assets/images/avatar_elena_vance_1792896875897.jpg',
    lookDescription:
      'Confident woman in her early 30s with shoulder-length dark chestnut hair, warm brown eyes, natural skin texture, wearing a tailored charcoal blazer over a crisp white crew-neck top',
    outfitVariant: 'Executive charcoal blazer against dark slate studio backdrop',
    createdAt: 1730000001000,
  },
  {
    id: 'avatar-marcus',
    name: 'Marcus Chen',
    imageUrl: '/src/assets/images/avatar_marcus_chen_1792896876225.jpg',
    lookDescription:
      'East Asian man in his late 30s with neatly styled short black hair and rectangular glasses, wearing a navy merino knit sweater over a crisp white collared shirt, warm expression',
    outfitVariant: 'Navy merino knit over white shirt, studio rim lighting',
    createdAt: 1730000002000,
  },
  {
    id: 'avatar-sofia',
    name: 'Sofia Rossi',
    imageUrl: '/src/assets/images/avatar_sofia_rossi_1792896877384.jpg',
    lookDescription:
      'Woman in her late 20s with wavy auburn hair and warm olive complexion, subtle gold hoop earrings, wearing an emerald green silk blouse, calm articulate expression',
    outfitVariant: 'Emerald silk blouse with warm editorial studio key light',
    createdAt: 1730000003000,
  },
];

export const INITIAL_VOICES: VoiceProfile[] = [
  {
    id: 'voice-kore-exec',
    name: 'Executive Keynote (Kore)',
    prebuiltVoice: 'Kore',
    pace: 1.0,
    tone: 'authoritative',
    accentNotes: 'General American broadcast diction, clear and poised',
  },
  {
    id: 'voice-puck-warm',
    name: 'Product Walkthrough (Puck)',
    prebuiltVoice: 'Puck',
    pace: 1.05,
    tone: 'energetic',
    accentNotes: 'Conversational tech founder delivery, upbeat cadence',
  },
  {
    id: 'voice-zephyr-calm',
    name: 'Guided Onboarding (Zephyr)',
    prebuiltVoice: 'Zephyr',
    pace: 0.95,
    tone: 'warm',
    accentNotes: 'Warm, articulate educator style with gentle inflection',
  },
  {
    id: 'voice-charon-deep',
    name: 'Documentary Narrator (Charon)',
    prebuiltVoice: 'Charon',
    pace: 0.92,
    tone: 'calm',
    accentNotes: 'Deep, measured studio resonance',
  },
];

export const INITIAL_SCRIPT = [
  'Welcome to AvatarStudio, where product teams turn written scripts into consistent talking-avatar broadcasts in minutes.',
  'Each scene automatically inherits your presenter look description, voice profile, and framing so facial identity stays locked across every cut.',
  'Arrange your timeline tracks, customize live word-by-word captions, and export a ready-to-share video in landscape, vertical, or square format.',
].join(' ');

export const INITIAL_SCENES: SceneItem[] = [
  {
    id: 'scene-1',
    scriptText:
      'Welcome to AvatarStudio, where product teams turn written scripts into consistent talking-avatar broadcasts in minutes.',
    avatarId: 'avatar-elena',
    voiceProfileId: 'voice-kore-exec',
    background: {
      type: 'gradient',
      value: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
    },
    avatarPosition: 'center',
    avatarScale: 1.0,
    emotionGesture: 'smiling',
    durationSeconds: 6.5,
    trimStart: 0,
    veoStatus: 'idle',
    veoProgress: 0,
  },
  {
    id: 'scene-2',
    scriptText:
      'Each scene automatically inherits your presenter look description, voice profile, and framing so facial identity stays locked across every cut.',
    avatarId: 'avatar-marcus',
    voiceProfileId: 'voice-puck-warm',
    background: {
      type: 'solid',
      value: '#0F172A',
    },
    avatarPosition: 'right',
    avatarScale: 0.95,
    emotionGesture: 'explaining with hand gestures',
    durationSeconds: 7.5,
    trimStart: 0,
    veoStatus: 'idle',
    veoProgress: 0,
  },
  {
    id: 'scene-3',
    scriptText:
      'Arrange your timeline tracks, customize live word-by-word captions, and export a ready-to-share video in landscape, vertical, or square format.',
    avatarId: 'avatar-sofia',
    voiceProfileId: 'voice-zephyr-calm',
    background: {
      type: 'gradient',
      value: 'linear-gradient(135deg, #064E3B 0%, #0F172A 100%)',
    },
    avatarPosition: 'left',
    avatarScale: 1.0,
    emotionGesture: 'neutral',
    durationSeconds: 7.0,
    trimStart: 0,
    veoStatus: 'idle',
    veoProgress: 0,
  },
];

export const INITIAL_CAPTIONS: CaptionSettings = {
  enabled: true,
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 'md',
  textColor: '#F8FAFC',
  highlightColor: '#818CF8',
  backgroundColor: 'rgba(15, 23, 42, 0.82)',
  position: 'bottom',
  highlightCurrentWord: true,
};

interface StudioState {
  projectName: string;
  activeTab: WorkspaceTab;
  aspectRatio: AspectRatioOption;
  showOnboarding: boolean;
  showExportModal: boolean;

  avatars: AvatarItem[];
  defaultAvatarId: string;

  voices: VoiceProfile[];
  defaultVoiceId: string;

  fullScript: string;
  scenes: SceneItem[];
  selectedSceneId: string;

  captions: CaptionSettings;

  // Undo / Redo history for timeline & script edits
  past: StudioSnapshot[];
  future: StudioSnapshot[];

  // Actions
  setProjectName: (name: string) => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  setAspectRatio: (ratio: AspectRatioOption) => void;
  setShowOnboarding: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;

  // Avatar actions
  addAvatar: (avatar: Omit<AvatarItem, 'id' | 'createdAt'>) => string;
  updateAvatar: (id: string, patch: Partial<AvatarItem>) => void;
  duplicateAvatar: (id: string) => void;
  deleteAvatar: (id: string) => void;
  setDefaultAvatarId: (id: string) => void;

  // Voice actions
  addVoiceProfile: (voice: Omit<VoiceProfile, 'id'>) => string;
  updateVoiceProfile: (id: string, patch: Partial<VoiceProfile>) => void;
  deleteVoiceProfile: (id: string) => void;
  setDefaultVoiceId: (id: string) => void;

  // Script & Scene actions
  setFullScript: (script: string) => void;
  autoSplitScriptToScenes: (scriptOverride?: string) => void;
  selectScene: (id: string) => void;
  addScene: () => void;
  updateScene: (
    id: string,
    patch: Partial<SceneItem>,
    recordHistory?: boolean
  ) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  splitScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  deleteScene: (id: string) => void;
  trimSceneDuration: (id: string, deltaSeconds: number) => void;

  // Captions actions
  updateCaptions: (patch: Partial<CaptionSettings>) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  resetNewProject: (params: {
    projectName: string;
    avatarId: string;
    voiceId: string;
    script: string;
    aspectRatio: AspectRatioOption;
  }) => void;
}

const MAX_HISTORY = 25;

function pushSnapshot(state: StudioState): StudioSnapshot[] {
  const snap: StudioSnapshot = {
    scenes: state.scenes.map((s) => ({ ...s, background: { ...s.background } })),
    fullScript: state.fullScript,
  };
  return [...state.past.slice(-(MAX_HISTORY - 1)), snap];
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      projectName: 'Q4 Autonomous Workflow Keynote',
      activeTab: 'timeline',
      aspectRatio: '16:9',
      showOnboarding: false,
      showExportModal: false,

      avatars: INITIAL_AVATARS,
      defaultAvatarId: 'avatar-elena',

      voices: INITIAL_VOICES,
      defaultVoiceId: 'voice-kore-exec',

      fullScript: INITIAL_SCRIPT,
      scenes: INITIAL_SCENES,
      selectedSceneId: 'scene-1',

      captions: INITIAL_CAPTIONS,

      past: [],
      future: [],

      setProjectName: (projectName) => set({ projectName }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setAspectRatio: (aspectRatio) => set({ aspectRatio }),
      setShowOnboarding: (showOnboarding) => set({ showOnboarding }),
      setShowExportModal: (showExportModal) => set({ showExportModal }),

      addAvatar: (avatarInput) => {
        const id = `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newAvatar: AvatarItem = {
          ...avatarInput,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({
          avatars: [newAvatar, ...state.avatars],
          defaultAvatarId: id,
        }));
        return id;
      },

      updateAvatar: (id, patch) =>
        set((state) => ({
          avatars: state.avatars.map((a) =>
            a.id === id ? { ...a, ...patch } : a
          ),
        })),

      duplicateAvatar: (id) =>
        set((state) => {
          const target = state.avatars.find((a) => a.id === id);
          if (!target) return state;
          const copy: AvatarItem = {
            ...target,
            id: `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: `${target.name} (Copy)`,
            createdAt: Date.now(),
          };
          return {
            avatars: [copy, ...state.avatars],
          };
        }),

      deleteAvatar: (id) =>
        set((state) => {
          if (state.avatars.length <= 1) return state;
          const remaining = state.avatars.filter((a) => a.id !== id);
          const fallbackId = remaining[0].id;
          return {
            avatars: remaining,
            defaultAvatarId:
              state.defaultAvatarId === id ? fallbackId : state.defaultAvatarId,
            scenes: state.scenes.map((s) =>
              s.avatarId === id ? { ...s, avatarId: fallbackId } : s
            ),
          };
        }),

      setDefaultAvatarId: (defaultAvatarId) => set({ defaultAvatarId }),

      addVoiceProfile: (voiceInput) => {
        const id = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newVoice: VoiceProfile = {
          ...voiceInput,
          id,
        };
        set((state) => ({
          voices: [newVoice, ...state.voices],
          defaultVoiceId: id,
        }));
        return id;
      },

      updateVoiceProfile: (id, patch) =>
        set((state) => ({
          voices: state.voices.map((v) =>
            v.id === id ? { ...v, ...patch } : v
          ),
        })),

      deleteVoiceProfile: (id) =>
        set((state) => {
          if (state.voices.length <= 1) return state;
          const remaining = state.voices.filter((v) => v.id !== id);
          const fallbackId = remaining[0].id;
          return {
            voices: remaining,
            defaultVoiceId:
              state.defaultVoiceId === id ? fallbackId : state.defaultVoiceId,
            scenes: state.scenes.map((s) =>
              s.voiceProfileId === id ? { ...s, voiceProfileId: fallbackId } : s
            ),
          };
        }),

      setDefaultVoiceId: (defaultVoiceId) => set({ defaultVoiceId }),

      setFullScript: (fullScript) => set({ fullScript }),

      autoSplitScriptToScenes: (scriptOverride) =>
        set((state) => {
          const textToSplit =
            typeof scriptOverride === 'string'
              ? scriptOverride
              : state.fullScript;
          const defaultVoice =
            state.voices.find((v) => v.id === state.defaultVoiceId) ||
            state.voices[0];
          const drafts = splitScriptIntoScenes(
            textToSplit,
            defaultVoice?.pace || 1.0
          );
          if (drafts.length === 0) return state;

          const past = pushSnapshot(state);
          const newScenes: SceneItem[] = drafts.map((draft, idx) => {
            const existing = state.scenes[idx];
            return {
              id: existing?.id || `scene-${Date.now()}-${idx}`,
              scriptText: draft.scriptText,
              avatarId: existing?.avatarId || state.defaultAvatarId,
              voiceProfileId: existing?.voiceProfileId || state.defaultVoiceId,
              background: existing?.background || {
                type: 'gradient',
                value: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
              },
              avatarPosition: existing?.avatarPosition || 'center',
              avatarScale: existing?.avatarScale ?? 1.0,
              emotionGesture:
                existing?.emotionGesture ||
                (idx === 0
                  ? 'smiling'
                  : idx % 2 === 1
                  ? 'explaining with hand gestures'
                  : 'neutral'),
              durationSeconds: draft.estimatedDuration,
              trimStart: 0,
              veoStatus: 'idle',
              veoProgress: 0,
            };
          });

          return {
            fullScript: textToSplit,
            scenes: newScenes,
            selectedSceneId: newScenes[0].id,
            past,
            future: [],
          };
        }),

      selectScene: (selectedSceneId) => set({ selectedSceneId }),

      addScene: () =>
        set((state) => {
          const past = pushSnapshot(state);
          const newId = `scene-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 5)}`;
          const newScene: SceneItem = {
            id: newId,
            scriptText:
              'Add your spoken line for this scene here so your presenter delivers it with natural lip sync.',
            avatarId: state.defaultAvatarId,
            voiceProfileId: state.defaultVoiceId,
            background: {
              type: 'solid',
              value: '#0F172A',
            },
            avatarPosition: 'center',
            avatarScale: 1.0,
            emotionGesture: 'neutral',
            durationSeconds: 6.0,
            trimStart: 0,
            veoStatus: 'idle',
            veoProgress: 0,
          };
          const scenes = [...state.scenes, newScene];
          return {
            scenes,
            fullScript: scenes.map((s) => s.scriptText).join(' '),
            selectedSceneId: newId,
            past,
            future: [],
          };
        }),

      updateScene: (id, patch, recordHistory = true) =>
        set((state) => {
          const past = recordHistory ? pushSnapshot(state) : state.past;
          const scenes = state.scenes.map((s) => {
            if (s.id !== id) return s;
            const updated = { ...s, ...patch };
            // If scriptText changed and durationSeconds wasn't explicitly patched, recalculate duration
            if (
              typeof patch.scriptText === 'string' &&
              typeof patch.durationSeconds !== 'number'
            ) {
              updated.durationSeconds = estimateDurationSeconds(
                patch.scriptText,
                1.0,
                true
              );
            }
            return updated;
          });
          return {
            scenes,
            fullScript: scenes.map((s) => s.scriptText).join(' '),
            past,
            future: recordHistory ? [] : state.future,
          };
        }),

      reorderScenes: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.scenes.length ||
            toIndex >= state.scenes.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const past = pushSnapshot(state);
          const next = [...state.scenes];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return {
            scenes: next,
            fullScript: next.map((s) => s.scriptText).join(' '),
            past,
            future: [],
          };
        }),

      splitScene: (id) =>
        set((state) => {
          const idx = state.scenes.findIndex((s) => s.id === id);
          if (idx === -1) return state;
          const past = pushSnapshot(state);
          const target = state.scenes[idx];
          const idA = `scene-${Date.now()}-a`;
          const idB = `scene-${Date.now()}-b`;
          const [sceneA, sceneB] = splitSceneAtMidpoint(target, idA, idB);
          const next = [...state.scenes];
          next.splice(idx, 1, sceneA, sceneB);
          return {
            scenes: next,
            fullScript: next.map((s) => s.scriptText).join(' '),
            selectedSceneId: idA,
            past,
            future: [],
          };
        }),

      duplicateScene: (id) =>
        set((state) => {
          const idx = state.scenes.findIndex((s) => s.id === id);
          if (idx === -1) return state;
          const past = pushSnapshot(state);
          const target = state.scenes[idx];
          const copyId = `scene-${Date.now()}-copy`;
          const copy: SceneItem = {
            ...target,
            id: copyId,
            background: { ...target.background },
          };
          const next = [...state.scenes];
          next.splice(idx + 1, 0, copy);
          return {
            scenes: next,
            fullScript: next.map((s) => s.scriptText).join(' '),
            selectedSceneId: copyId,
            past,
            future: [],
          };
        }),

      deleteScene: (id) =>
        set((state) => {
          if (state.scenes.length <= 1) return state;
          const idx = state.scenes.findIndex((s) => s.id === id);
          if (idx === -1) return state;
          const past = pushSnapshot(state);
          const next = state.scenes.filter((s) => s.id !== id);
          const nextSelected =
            state.selectedSceneId === id
              ? next[Math.max(0, idx - 1)].id
              : state.selectedSceneId;
          return {
            scenes: next,
            fullScript: next.map((s) => s.scriptText).join(' '),
            selectedSceneId: nextSelected,
            past,
            future: [],
          };
        }),

      trimSceneDuration: (id, deltaSeconds) =>
        set((state) => {
          const past = pushSnapshot(state);
          const scenes = state.scenes.map((s) => {
            if (s.id !== id) return s;
            const nextDur = Math.max(
              2.5,
              Math.min(15.0, Number((s.durationSeconds + deltaSeconds).toFixed(1)))
            );
            return { ...s, durationSeconds: nextDur };
          });
          return {
            scenes,
            past,
            future: [],
          };
        }),

      updateCaptions: (patch) =>
        set((state) => ({
          captions: { ...state.captions, ...patch },
        })),

      undo: () =>
        set((state) => {
          if (state.past.length === 0) return state;
          const previous = state.past[state.past.length - 1];
          const currentSnap: StudioSnapshot = {
            scenes: state.scenes.map((s) => ({
              ...s,
              background: { ...s.background },
            })),
            fullScript: state.fullScript,
          };
          return {
            scenes: previous.scenes,
            fullScript: previous.fullScript,
            selectedSceneId:
              previous.scenes.find((s) => s.id === state.selectedSceneId)?.id ||
              previous.scenes[0]?.id ||
              '',
            past: state.past.slice(0, -1),
            future: [currentSnap, ...state.future.slice(0, MAX_HISTORY - 1)],
          };
        }),

      redo: () =>
        set((state) => {
          if (state.future.length === 0) return state;
          const nextSnap = state.future[0];
          const currentSnap: StudioSnapshot = {
            scenes: state.scenes.map((s) => ({
              ...s,
              background: { ...s.background },
            })),
            fullScript: state.fullScript,
          };
          return {
            scenes: nextSnap.scenes,
            fullScript: nextSnap.fullScript,
            selectedSceneId:
              nextSnap.scenes.find((s) => s.id === state.selectedSceneId)?.id ||
              nextSnap.scenes[0]?.id ||
              '',
            past: [...state.past, currentSnap],
            future: state.future.slice(1),
          };
        }),

      resetNewProject: ({
        projectName,
        avatarId,
        voiceId,
        script,
        aspectRatio,
      }) => {
        const state = get();
        const past = pushSnapshot(state);
        const voice =
          state.voices.find((v) => v.id === voiceId) || state.voices[0];
        const drafts = splitScriptIntoScenes(script, voice?.pace || 1.0);
        const scenes: SceneItem[] = (
          drafts.length > 0
            ? drafts
            : [{ scriptText: script, estimatedDuration: 6.0, wordCount: 12 }]
        ).map((d, idx) => ({
          id: `scene-${Date.now()}-${idx}`,
          scriptText: d.scriptText,
          avatarId,
          voiceProfileId: voiceId,
          background: {
            type: 'gradient',
            value: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
          },
          avatarPosition: idx % 2 === 0 ? 'center' : 'right',
          avatarScale: 1.0,
          emotionGesture: idx === 0 ? 'smiling' : 'explaining with hand gestures',
          durationSeconds: d.estimatedDuration,
          trimStart: 0,
          veoStatus: 'idle',
          veoProgress: 0,
        }));

        set({
          projectName: projectName.trim() || 'Untitled Avatar Project',
          defaultAvatarId: avatarId,
          defaultVoiceId: voiceId,
          fullScript: script,
          aspectRatio,
          scenes,
          selectedSceneId: scenes[0].id,
          activeTab: 'timeline',
          showOnboarding: false,
          past,
          future: [],
        });
      },
    }),
    {
      name: 'avatar-studio-indexeddb-v1',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        projectName: state.projectName,
        activeTab: state.activeTab,
        aspectRatio: state.aspectRatio,
        avatars: state.avatars,
        defaultAvatarId: state.defaultAvatarId,
        voices: state.voices,
        defaultVoiceId: state.defaultVoiceId,
        fullScript: state.fullScript,
        scenes: state.scenes,
        selectedSceneId: state.selectedSceneId,
        captions: state.captions,
      }),
    }
  )
);
