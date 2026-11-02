import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateDurationSeconds,
  splitScriptIntoScenes,
  buildVeoPrompt,
  buildTtsStylePrompt,
  calculateTimelineOffsets,
  splitSceneAtMidpoint,
} from './studioLogic';
import { SceneItem } from '../types/studio';

test('estimateDurationSeconds returns 5-8s clamped duration for standard scene text', () => {
  const text =
    'Welcome to AvatarStudio, where your team can produce studio-quality talking avatar videos in minutes.';
  const duration = estimateDurationSeconds(text, 1.0, true);
  assert.ok(duration >= 5.0 && duration <= 8.0, `Expected 5-8s, got ${duration}`);
});

test('splitScriptIntoScenes splits multi-sentence script into 5-8s scenes on sentence boundaries', () => {
  const script = [
    'Welcome to our Q4 product keynote where we introduce autonomous workflow orchestration for modern product teams.',
    'Over the past quarter, engineering velocity increased by forty percent while deployment incidents dropped significantly across regions.',
    'Let us walk through the three core capabilities available in your workspace starting today.',
  ].join(' ');

  const scenes = splitScriptIntoScenes(script, 1.0);
  assert.equal(scenes.length, 3);
  for (const scene of scenes) {
    assert.ok(
      scene.estimatedDuration >= 5.0 && scene.estimatedDuration <= 8.0,
      `Scene duration ${scene.estimatedDuration} should be between 5 and 8 seconds`
    );
    assert.ok(scene.scriptText.length > 15);
  }
});

test('buildVeoPrompt includes avatar look description, framing, emotion/gesture, and spoken line', () => {
  const prompt = buildVeoPrompt({
    avatarName: 'Elena Vance',
    lookDescription: 'Woman in early 30s with dark chestnut hair and charcoal blazer',
    outfitVariant: 'Executive slate studio backdrop',
    emotionGesture: 'explaining with hand gestures',
    position: 'center',
    scriptText: 'Here is how our unified timeline works.',
  });

  assert.ok(prompt.includes('Woman in early 30s with dark chestnut hair and charcoal blazer'));
  assert.ok(prompt.includes('medium close-up'));
  assert.ok(prompt.includes('facing camera, natural head movement'));
  assert.ok(prompt.includes('explaining with natural conversational hand gestures'));
  assert.ok(prompt.includes('"Here is how our unified timeline works."'));
});

test('buildTtsStylePrompt formats tone, pace, and accent notes cleanly', () => {
  const style = buildTtsStylePrompt({
    tone: 'authoritative',
    pace: 1.15,
    accentNotes: 'General American broadcast English',
  });
  assert.ok(style.includes('Authoritative'));
  assert.ok(style.includes('brisk, dynamic pace'));
  assert.ok(style.includes('General American broadcast English'));
});

test('calculateTimelineOffsets computes sequential start and end times', () => {
  const mockScenes: SceneItem[] = [
    {
      id: 's1',
      scriptText: 'Scene one text.',
      avatarId: 'a1',
      voiceProfileId: 'v1',
      background: { type: 'solid', value: '#0F172A' },
      avatarPosition: 'center',
      avatarScale: 1,
      emotionGesture: 'neutral',
      durationSeconds: 5.5,
      trimStart: 0,
      veoStatus: 'idle',
      veoProgress: 0,
    },
    {
      id: 's2',
      scriptText: 'Scene two text.',
      avatarId: 'a1',
      voiceProfileId: 'v1',
      background: { type: 'solid', value: '#1E293B' },
      avatarPosition: 'left',
      avatarScale: 1,
      emotionGesture: 'smiling',
      durationSeconds: 6.5,
      trimStart: 0,
      veoStatus: 'idle',
      veoProgress: 0,
    },
  ];

  const { timings, totalDuration } = calculateTimelineOffsets(mockScenes);
  assert.equal(totalDuration, 12.0);
  assert.equal(timings[0].startTime, 0);
  assert.equal(timings[0].endTime, 5.5);
  assert.equal(timings[1].startTime, 5.5);
  assert.equal(timings[1].endTime, 12.0);
});

test('splitSceneAtMidpoint divides a scene into two balanced halves', () => {
  const original: SceneItem = {
    id: 's1',
    scriptText: 'First half of the sentence and now the second half of the sentence.',
    avatarId: 'a1',
    voiceProfileId: 'v1',
    background: { type: 'solid', value: '#0F172A' },
    avatarPosition: 'center',
    avatarScale: 1,
    emotionGesture: 'smiling',
    durationSeconds: 7.0,
    trimStart: 0,
    veoStatus: 'completed',
    veoProgress: 100,
  };

  const [partA, partB] = splitSceneAtMidpoint(original, 's1-a', 's1-b');
  assert.equal(partA.id, 's1-a');
  assert.equal(partB.id, 's1-b');
  assert.equal(partA.durationSeconds, 3.5);
  assert.equal(partB.durationSeconds, 3.5);
  assert.ok(partA.scriptText.includes('First half'));
  assert.ok(partB.scriptText.includes('second half'));
  assert.equal(partA.veoStatus, 'idle');
});
