/** Shared by the browser and API: the image supplies identity; audio supplies timing. */
export const LIP_SYNC_PROMPT_VERSION = 2;
export function buildLipSyncPrompt(): string {
  return [
    "Use the uploaded image as the exact visual reference for one continuous talking-head shot.",
    "Preserve the same person's facial identity, face shape, skin texture, hair, clothing, framing, lighting, and background throughout.",
    "The provided audio is the sole source of speech and timing: match lip closures, jaw motion, and mouth shapes to its phonemes, words, pauses, and breaths from beginning to end.",
    "Keep the mouth relaxed and still during silence. Use restrained, natural articulation, occasional soft blinks, steady eye contact, and very subtle head micro-movements.",
    "Keep the face and mouth fully visible, sharp, and stable. Maintain the source pose and camera angle with a locked camera and consistent exposure.",
    "Do not redesign, restyle, replace, or add visual elements. No new speech, exaggerated smiles, large gestures, head turns, camera motion, cuts, face morphing, mouth flicker, text, subtitles, music, or sound effects.",
  ].join(" ");
}
