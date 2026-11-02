import {
  AvatarPosition,
  EmotionGesture,
  SceneItem,
  VoiceTone,
} from '../types/studio';

/**
 * Estimates speaking duration in seconds based on word count and pace.
 * Standard natural speaking rate is ~2.4 words per second (~144 WPM).
 * Clamps single scene auto-split durations cleanly into realistic bounds.
 */
export function estimateDurationSeconds(
  text: string,
  pace: number = 1.0,
  clampToSceneBounds: boolean = true
): number {
  const cleaned = text.trim();
  if (!cleaned) return clampToSceneBounds ? 5.0 : 0;

  const words = cleaned.split(/\s+/).filter(Boolean).length;
  const safePace = Math.max(0.7, Math.min(1.5, pace || 1.0));
  const rawSeconds = words / (2.35 * safePace);

  if (!clampToSceneBounds) {
    return Math.max(1.5, Number(rawSeconds.toFixed(1)));
  }

  // Target ~5-8 seconds for standard scene chunks, allowing 4.0s-10.0s range
  const clamped = Math.max(5.0, Math.min(8.0, rawSeconds));
  return Number(clamped.toFixed(1));
}

export interface SplitSceneDraft {
  scriptText: string;
  estimatedDuration: number;
  wordCount: number;
}

/**
 * Splits a full script into scenes of ~5-8 seconds each (~12-19 words per scene),
 * respecting sentence boundaries first and clause boundaries when a single sentence is very long.
 */
export function splitScriptIntoScenes(
  scriptText: string,
  pace: number = 1.0
): SplitSceneDraft[] {
  const cleaned = scriptText.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // Split by sentence-ending punctuation while keeping punctuation attached
  const rawSentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Expand any overly long sentence (>22 words) along comma/semicolon/dash boundaries
  const segments: string[] = [];
  for (const sentence of rawSentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= 21) {
      segments.push(sentence);
    } else {
      const clauses = sentence
        .split(/(?<=[,;—–:])\s+/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (clauses.length > 1) {
        let accum = '';
        for (const clause of clauses) {
          const combined = accum ? `${accum} ${clause}` : clause;
          const combinedWords = combined.split(/\s+/).filter(Boolean).length;
          if (combinedWords <= 19) {
            accum = combined;
          } else {
            if (accum) segments.push(accum);
            accum = clause;
          }
        }
        if (accum) segments.push(accum);
      } else {
        // Hard chunk by 16 words if no clause punctuation exists
        for (let i = 0; i < words.length; i += 16) {
          segments.push(words.slice(i, i + 16).join(' '));
        }
      }
    }
  }

  // Group segments into scenes targeting 11 to 19 words (~5-8 seconds)
  const scenes: SplitSceneDraft[] = [];
  let currentText = '';

  const flushCurrent = (textToFlush: string) => {
    const trimmed = textToFlush.trim();
    if (!trimmed) return;
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    const rawDuration = wordCount / (2.35 * Math.max(0.7, Math.min(1.5, pace)));
    const estimatedDuration = Number(
      Math.max(5.0, Math.min(8.0, rawDuration)).toFixed(1)
    );
    scenes.push({
      scriptText: trimmed,
      estimatedDuration,
      wordCount,
    });
  };

  for (const seg of segments) {
    if (!currentText) {
      currentText = seg;
      continue;
    }

    const currentWords = currentText.split(/\s+/).filter(Boolean).length;
    const segWords = seg.split(/\s+/).filter(Boolean).length;

    // If current is short (<11 words) and adding seg keeps us around <=20 words, combine them
    if (currentWords < 11 && currentWords + segWords <= 20) {
      currentText = `${currentText} ${seg}`;
    } else {
      flushCurrent(currentText);
      currentText = seg;
    }
  }

  if (currentText) {
    flushCurrent(currentText);
  }

  return scenes;
}

export interface VeoPromptParams {
  avatarName: string;
  lookDescription: string;
  outfitVariant?: string;
  emotionGesture: EmotionGesture;
  position: AvatarPosition;
  scriptText: string;
  backgroundDesc?: string;
}

/**
 * Builds a consistent Veo image-to-video prompt from:
 * - Avatar's saved look description & outfit variant
 * - Scene emotion/gesture
 * - Framing ("medium close-up, facing camera, natural head movement")
 * - Spoken script line
 */
export function buildVeoPrompt(params: VeoPromptParams): string {
  const look = params.lookDescription.trim() || `Professional presenter ${params.avatarName}`;
  const outfit = params.outfitVariant?.trim()
    ? ` Outfit & setting detail: ${params.outfitVariant.trim()}.`
    : '';

  const gestureMap: Record<EmotionGesture, string> = {
    neutral:
      'calm, composed neutral expression with natural micro-expressions and steady eye contact',
    smiling:
      'warm, approachable smiling expression with friendly eyes and welcoming demeanor',
    serious:
      'focused, authoritative serious expression with deliberate, measured delivery',
    'explaining with hand gestures':
      'articulate presenter expression, explaining with natural conversational hand gestures',
  };

  const framingMap: Record<AvatarPosition, string> = {
    center:
      'medium close-up, centered in frame, facing camera, natural head movement',
    left: 'medium close-up, positioned slightly left of center, facing camera, natural head movement',
    right:
      'medium close-up, positioned slightly right of center, facing camera, natural head movement',
    'small corner':
      'medium close-up portrait framing, facing camera, natural head movement',
  };

  const bgNote = params.backgroundDesc?.trim()
    ? ` Studio lighting matching ${params.backgroundDesc.trim()}.`
    : ' Soft diffused studio lighting, shallow depth of field.';

  const cleanLine = params.scriptText.replace(/\s+/g, ' ').trim();

  return [
    `Consistent presenter appearance: ${look}.${outfit}`,
    `Framing: ${framingMap[params.position] || framingMap.center}.`,
    `Performance & gesture: ${gestureMap[params.emotionGesture] || gestureMap.neutral}.`,
    `Talking-head broadcast video: the presenter is actively speaking aloud to the camera with realistic mouth articulation, accurate lip-sync, and natural facial movements, saying: "${cleanLine}"${bgNote}`,
  ].join(' ');
}

/**
 * Builds the TTS style instruction string from a VoiceProfile's tone, pace, and accent notes.
 */
export function buildTtsStylePrompt(params: {
  tone: VoiceTone;
  pace: number;
  accentNotes: string;
}): string {
  const paceLabel =
    params.pace < 0.92
      ? 'measured, unhurried pace'
      : params.pace > 1.08
      ? 'brisk, dynamic pace'
      : 'natural conversational pace';

  const toneDescriptions: Record<VoiceTone, string> = {
    warm: 'Warm, empathetic, inviting studio narrator',
    energetic: 'Energetic, upbeat, engaging presenter',
    calm: 'Calm, poised, reassuring voiceover style',
    authoritative: 'Authoritative, clear, executive broadcast delivery',
  };

  const accent = params.accentNotes.trim()
    ? `, ${params.accentNotes.trim()}`
    : '';

  return `${toneDescriptions[params.tone]}, ${paceLabel}${accent}`;
}

export interface TimelineSceneTiming {
  sceneId: string;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Computes cumulative start and end timestamps for each scene on the horizontal timeline.
 */
export function calculateTimelineOffsets(scenes: SceneItem[]): {
  timings: TimelineSceneTiming[];
  totalDuration: number;
} {
  let cursor = 0;
  const timings: TimelineSceneTiming[] = scenes.map((scene, index) => {
    const duration = Math.max(2.0, Number(scene.durationSeconds.toFixed(1)));
    const startTime = Number(cursor.toFixed(1));
    const endTime = Number((cursor + duration).toFixed(1));
    cursor = endTime;
    return {
      sceneId: scene.id,
      index,
      startTime,
      endTime,
      duration,
    };
  });

  return {
    timings,
    totalDuration: Number(cursor.toFixed(1)),
  };
}

/**
 * Splits a scene into two scenes at its sentence or word midpoint.
 */
export function splitSceneAtMidpoint(
  scene: SceneItem,
  newIdA: string,
  newIdB: string
): [SceneItem, SceneItem] {
  const words = scene.scriptText.trim().split(/\s+/).filter(Boolean);
  let firstHalfText = scene.scriptText;
  let secondHalfText = 'Continuing this point with clarity.';

  if (words.length >= 4) {
    const mid = Math.ceil(words.length / 2);
    firstHalfText = words.slice(0, mid).join(' ');
    secondHalfText = words.slice(mid).join(' ');
  }

  const halfDuration = Math.max(
    3.0,
    Number((scene.durationSeconds / 2).toFixed(1))
  );

  const sceneA: SceneItem = {
    ...scene,
    id: newIdA,
    scriptText: firstHalfText,
    durationSeconds: halfDuration,
    veoStatus: 'idle',
    veoProgress: 0,
    videoUrl: undefined,
    audioUrl: undefined,
  };

  const sceneB: SceneItem = {
    ...scene,
    id: newIdB,
    scriptText: secondHalfText,
    durationSeconds: halfDuration,
    veoStatus: 'idle',
    veoProgress: 0,
    videoUrl: undefined,
    audioUrl: undefined,
  };

  return [sceneA, sceneB];
}
