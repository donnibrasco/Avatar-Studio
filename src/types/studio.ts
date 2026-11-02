export type WorkspaceTab = 'avatars' | 'voices' | 'script' | 'timeline';

export type PrebuiltVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export type VoiceTone = 'warm' | 'energetic' | 'calm' | 'authoritative';

export type EmotionGesture =
  | 'neutral'
  | 'smiling'
  | 'serious'
  | 'explaining with hand gestures';

export type AvatarPosition = 'left' | 'center' | 'right' | 'small corner';

export type BackgroundType = 'solid' | 'gradient' | 'image' | 'ai-generated';

export type AspectRatioOption = '16:9' | '9:16' | '1:1';

export interface AvatarItem {
  id: string;
  name: string;
  imageUrl: string;
  lookDescription: string;
  outfitVariant: string;
  createdAt: number;
}

export interface VoiceProfile {
  id: string;
  name: string;
  prebuiltVoice: PrebuiltVoiceName;
  pace: number; // 0.8 to 1.25
  tone: VoiceTone;
  accentNotes: string;
  sampleAudioUrl?: string;
}

export interface SceneBackground {
  type: BackgroundType;
  value: string; // Hex color, CSS gradient string, or image URL/dataURI
  prompt?: string;
}

export type SceneGenerationStatus =
  | 'idle'
  | 'queued'
  | 'polling'
  | 'completed'
  | 'error';

export interface SceneItem {
  id: string;
  scriptText: string;
  avatarId: string;
  voiceProfileId: string;
  background: SceneBackground;
  avatarPosition: AvatarPosition;
  avatarScale: number; // 0.6 to 1.2
  emotionGesture: EmotionGesture;
  durationSeconds: number; // trimmed or estimated 3s - 15s (default 5-8s)
  trimStart: number;
  // Generated assets
  audioUrl?: string;
  audioGenerating?: boolean;
  videoUrl?: string;
  veoInteractionId?: string;
  veoStatus: SceneGenerationStatus;
  veoProgress: number; // 0 - 100
  veoError?: string;
}

export interface CaptionSettings {
  enabled: boolean;
  fontFamily: 'Plus Jakarta Sans' | 'DM Sans' | 'JetBrains Mono';
  fontSize: 'sm' | 'md' | 'lg';
  textColor: string;
  highlightColor: string;
  backgroundColor: string;
  position: 'bottom' | 'center' | 'top';
  highlightCurrentWord: boolean;
}

export interface StudioSnapshot {
  scenes: SceneItem[];
  fullScript: string;
}
