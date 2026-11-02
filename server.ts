import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing in the server environment. Please verify your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ClassifiedError {
  status: number;
  code: 'QUOTA_EXCEEDED' | 'SAFETY_BLOCKED' | 'INVALID_KEY' | 'GENERATION_FAILED';
  message: string;
  retryable: boolean;
}

function classifyGeminiError(err: unknown): ClassifiedError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit')
  ) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'Model rate limit or quota reached. Please wait 30–60 seconds before generating again, or check your billing tier.',
      retryable: true,
    };
  }

  if (
    lower.includes('safety') ||
    lower.includes('blocked') ||
    lower.includes('recitation') ||
    lower.includes('policy') ||
    lower.includes('prohibited')
  ) {
    return {
      status: 422,
      code: 'SAFETY_BLOCKED',
      message:
        'Generation was blocked by Google AI safety filters. Try rephrasing the prompt or script.',
      retryable: false,
    };
  }

  if (lower.includes('api_key') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      code: 'INVALID_KEY',
      message:
        'API key permission error. Ensure a valid paid Gemini API key is configured for video and audio models.',
      retryable: false,
    };
  }

  return {
    status: 500,
    code: 'GENERATION_FAILED',
    message: raw.length < 280 ? raw : 'Generation request failed. Please try again.',
    retryable: true,
  };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyGeminiError(err);
      if (!classified.retryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 1200 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

function resolveImageSourceToBase64(imageUrl: string): {
  mimeType: string;
  base64Data: string;
} | null {
  if (!imageUrl) return null;

  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      return {
        mimeType: match[1],
        base64Data: match[2],
      };
    }
  }

  if (imageUrl.startsWith('/src/') || imageUrl.startsWith('src/')) {
    const relativePath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
    const diskPath = path.resolve(process.cwd(), relativePath);
    if (fs.existsSync(diskPath)) {
      const buffer = fs.readFileSync(diskPath);
      const ext = path.extname(diskPath).toLowerCase();
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      return {
        mimeType,
        base64Data: buffer.toString('base64'),
      };
    }
  }

  if (imageUrl.startsWith('/videolab/assets/')) {
    const relativePath = imageUrl.slice('/videolab/'.length);
    const assetsPath = path.resolve(process.cwd(), 'dist/assets');
    const diskPath = path.resolve(process.cwd(), 'dist', relativePath);
    if (
      diskPath.startsWith(`${assetsPath}${path.sep}`) &&
      fs.existsSync(diskPath)
    ) {
      const buffer = fs.readFileSync(diskPath);
      const ext = path.extname(diskPath).toLowerCase();
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      return {
        mimeType,
        base64Data: buffer.toString('base64'),
      };
    }
  }

  return null;
}

function getElevenLabsApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'ElevenLabs is not configured. Add ELEVENLABS_API_KEY to the server .env file.'
    );
  }
  return apiKey;
}

async function getElevenLabsError(response: globalThis.Response): Promise<string> {
  const responseText = await response.text();
  let message = responseText;
  try {
    const body = JSON.parse(responseText) as {
      detail?: string | { message?: string };
      message?: string;
    };
    message =
      typeof body.detail === 'string'
        ? body.detail
        : body.detail?.message || body.message || responseText;
  } catch {
    // Keep the provider's plain-text response.
  }
  return `ElevenLabs request failed (${response.status}): ${message.slice(0, 400)}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post('/api/voice/clone', async (req: Request, res: Response) => {
    try {
      const { name, mimeType, audioBase64, consent } = req.body as {
        name?: string;
        mimeType?: string;
        audioBase64?: string;
        consent?: boolean;
      };

      if (consent !== true) {
        res.status(400).json({
          error: 'Confirm that you own this voice or have its owner’s permission.',
        });
        return;
      }
      if (!name?.trim() || name.trim().length > 80) {
        res.status(400).json({ error: 'Enter a voice name (up to 80 characters).' });
        return;
      }
      if (!audioBase64 || !mimeType) {
        res.status(400).json({ error: 'Upload an audio sample to clone.' });
        return;
      }

      const extensions: Record<string, string> = {
        'audio/aac': 'aac',
        'audio/flac': 'flac',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
        'audio/webm': 'webm',
        'audio/x-wav': 'wav',
      };
      const extension = extensions[mimeType.toLowerCase()];
      if (!extension) {
        res.status(415).json({
          error: 'Use an MP3, WAV, M4A, AAC, OGG, WebM, or FLAC audio recording.',
        });
        return;
      }
      if (
        audioBase64.length > 28_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)
      ) {
        res.status(413).json({
          error: 'Audio sample must be a valid base64 recording no larger than 20 MB.',
        });
        return;
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');
      if (!audioBuffer.length || audioBuffer.length > 20 * 1024 * 1024) {
        res.status(413).json({
          error: 'Audio sample must be no larger than 20 MB.',
        });
        return;
      }

      const apiKey = getElevenLabsApiKey();
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append(
        'files',
        new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
        `voice-sample.${extension}`
      );

      const providerResponse = await fetch(
        'https://api.elevenlabs.io/v1/voices/add',
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
          body: formData,
        }
      );
      if (!providerResponse.ok) {
        res.status(providerResponse.status).json({
          error: await getElevenLabsError(providerResponse),
        });
        return;
      }

      const result = (await providerResponse.json()) as {
        voice_id?: string;
        requires_verification?: boolean;
      };
      if (!result.voice_id) {
        res.status(502).json({
          error: 'ElevenLabs did not return a voice ID for the uploaded sample.',
        });
        return;
      }
      res.json({
        voiceId: result.voice_id,
        requiresVerification: Boolean(result.requires_verification),
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not create the ElevenLabs voice clone.';
      res.status(message.includes('ELEVENLABS_API_KEY') ? 503 : 502).json({
        error: message,
      });
    }
  });

  app.delete('/api/voice/:voiceId', async (req: Request, res: Response) => {
    try {
      const { voiceId } = req.params;
      if (!/^[A-Za-z0-9_-]+$/.test(voiceId)) {
        res.status(400).json({ error: 'Invalid voice ID.' });
        return;
      }
      const providerResponse = await fetch(
        `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
        {
          method: 'DELETE',
          headers: { 'xi-api-key': getElevenLabsApiKey() },
        }
      );
      if (!providerResponse.ok) {
        res.status(providerResponse.status).json({
          error: await getElevenLabsError(providerResponse),
        });
        return;
      }
      res.json({ status: 'ok' });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not delete the ElevenLabs voice clone.';
      res.status(message.includes('ELEVENLABS_API_KEY') ? 503 : 502).json({
        error: message,
      });
    }
  });

  // 1. Analyze Uploaded Sample Video / Frame to extract Look Description + Voice Style
  app.post('/api/sample/analyze', async (req: Request, res: Response) => {
    try {
      const { frameDataUrl, videoDataUrl } = req.body as {
        frameDataUrl?: string;
        videoDataUrl?: string;
      };

      const ai = getGenAIClient();
      const parts: Array<Record<string, unknown>> = [];

      if (frameDataUrl) {
        const resolved = resolveImageSourceToBase64(frameDataUrl);
        if (resolved) {
          parts.push({
            inlineData: {
              mimeType: resolved.mimeType,
              data: resolved.base64Data,
            },
          });
        }
      }

      if (videoDataUrl && videoDataUrl.startsWith('data:video/')) {
        const match = videoDataUrl.match(/^data:(video\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        // Only inline small video clips (< 12MB base64) for fast analysis
        if (match && match[2].length < 16_000_000) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      parts.push({
        text: `Analyze this uploaded presenter sample video/frame so we can recreate their appearance and speaking style in new AI avatar videos.
Return a JSON object with:
- "lookDescription": A concise 1-2 sentence visual description of the person's face, hair, clothing, lighting, and background.
- "voiceStyle": A concise description of their vocal delivery, tone, pace, and accent style (e.g., "Warm, confident conversational presenter with clear broadcast diction").
- "recommendedVoice": One of ["Kore", "Puck", "Zephyr", "Charon", "Fenrir"] that best fits the presenter.`,
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                lookDescription: { type: Type.STRING },
                voiceStyle: { type: Type.STRING },
                recommendedVoice: { type: Type.STRING },
              },
              required: ['lookDescription', 'voiceStyle', 'recommendedVoice'],
            },
          },
        })
      );

      const rawText = (response.text || '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({
        lookDescription:
          parsed.lookDescription ||
          'Professional studio presenter facing the camera with soft diffused lighting',
        voiceStyle:
          parsed.voiceStyle ||
          'Warm, natural conversational presenter delivery',
        recommendedVoice: ['Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir'].includes(
          parsed.recommendedVoice
        )
          ? parsed.recommendedVoice
          : 'Kore',
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  // 2. Write / Refine Spoken Script from a Topic Prompt
  app.post('/api/script/assist', async (req: Request, res: Response) => {
    try {
      const { topic, text } = req.body as {
        topic?: string;
        text?: string;
      };

      const ai = getGenAIClient();
      const prompt = topic
        ? `Write a natural, engaging 1-to-2 sentence spoken script (15 to 25 words max, around 6-8 seconds when spoken aloud) for a talking avatar video based on this prompt: "${topic}". Output ONLY the exact words the avatar will speak aloud—no quotation marks, no stage directions, and no speaker labels.`
        : `Polish this spoken script so it is concise, natural to speak aloud in 6-8 seconds (15 to 25 words max): "${text}". Output ONLY the spoken words.`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            temperature: 0.7,
          },
        })
      );

      const script = (response.text || '').trim().replace(/^["']|["']$/g, '');
      res.json({ script });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  // 3. Gemini TTS Voiceover Synthesis (gemini-3.8-flash-lite-tts)
  app.post('/api/tts/generate', async (req: Request, res: Response) => {
    try {
      const {
        text,
        voiceName = 'Kore',
        stylePrompt = 'Clear, warm presenter',
        elevenLabsVoiceId,
        pace = 1,
      } = req.body as {
        text: string;
        voiceName?: string;
        stylePrompt?: string;
        elevenLabsVoiceId?: string;
        pace?: number;
      };

      if (!text || !text.trim()) {
        res.status(400).json({
          error: 'Script text is required to synthesize speech.',
          code: 'GENERATION_FAILED',
        });
        return;
      }

      if (elevenLabsVoiceId) {
        if (!/^[A-Za-z0-9_-]+$/.test(elevenLabsVoiceId)) {
          res.status(400).json({ error: 'Invalid ElevenLabs voice ID.' });
          return;
        }
        const providerResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenLabsVoiceId)}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': getElevenLabsApiKey(),
            },
            body: JSON.stringify({
              text: text.trim(),
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                speed: Math.max(0.7, Math.min(1.2, pace)),
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
          }
        );
        if (!providerResponse.ok) {
          res.status(providerResponse.status).json({
            error: await getElevenLabsError(providerResponse),
          });
          return;
        }
        const audio = Buffer.from(await providerResponse.arrayBuffer());
        res.json({
          audioUrl: `data:audio/mpeg;base64,${audio.toString('base64')}`,
        });
        return;
      }

      const ai = getGenAIClient();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: text.trim(),
                  speechMetadata: {
                    style: stylePrompt,
                  },
                } as Record<string, unknown>,
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        })
      );

      const parts = response.candidates?.[0]?.content?.parts || [];
      let base64Audio: string | undefined;
      for (const part of parts) {
        if (part.inlineData?.data) {
          base64Audio = part.inlineData.data;
          break;
        }
      }

      if (!base64Audio) {
        res.status(422).json({
          error: 'No audio returned from Gemini TTS.',
          code: 'GENERATION_FAILED',
        });
        return;
      }

      res.json({
        audioUrl: `data:audio/wav;base64,${base64Audio}`,
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      const status =
        err instanceof Error && err.message.includes('ELEVENLABS_API_KEY')
          ? 503
          : classified.status;
      res.status(status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  // 4. Start Asynchronous Veo (gemini-omni-1.1-flash) Talking Avatar Video Generation
  app.post('/api/veo/start', async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        avatarImageUrl,
        aspectRatio = '16:9',
        duration = '5s',
      } = req.body as {
        prompt: string;
        avatarImageUrl?: string;
        aspectRatio?: '16:9' | '9:16';
        duration?: '5s' | '10s';
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({
          error: 'A prompt is required to generate the video.',
          code: 'GENERATION_FAILED',
        });
        return;
      }

      const ai = getGenAIClient();
      const resolvedImage = avatarImageUrl
        ? resolveImageSourceToBase64(avatarImageUrl)
        : null;

      const veoAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';

      const inputPayload = resolvedImage
        ? [
            {
              type: 'image' as const,
              mime_type: resolvedImage.mimeType,
              data: resolvedImage.base64Data,
            },
            {
              type: 'text' as const,
              text: prompt.trim(),
            },
          ]
        : prompt.trim();

      const interaction = await withRetry(() =>
        ai.interactions.create({
          model: 'gemini-omni-1.1-flash',
          input: inputPayload,
          background: true,
          store: true,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: veoAspectRatio,
            duration: duration === '10s' ? '10s' : '5s',
            resolution: '720p',
          },
        } as Parameters<typeof ai.interactions.create>[0])
      );

      res.json({
        interactionId: interaction.id,
        status: interaction.status || 'in_progress',
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  // 5. Poll Veo Interaction Status
  app.get('/api/veo/status/:id', async (req: Request, res: Response) => {
    try {
      const interactionId = req.params.id;
      if (!interactionId) {
        res.status(400).json({ error: 'Interaction ID is required.' });
        return;
      }

      const ai = getGenAIClient();
      const interaction = await withRetry(() =>
        ai.interactions.get(interactionId)
      );

      const status = interaction.status || 'in_progress';

      if (status === 'completed') {
        const videoPart = interaction.output_video;
        if (videoPart?.data) {
          const mime = videoPart.mime_type || 'video/mp4';
          res.json({
            status: 'completed',
            videoUrl: `data:${mime};base64,${videoPart.data}`,
          });
          return;
        }
        if (videoPart?.uri) {
          res.json({
            status: 'completed',
            videoUrl: videoPart.uri,
          });
          return;
        }

        for (const step of interaction.steps || []) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            for (const item of step.content) {
              if (item.type === 'video') {
                if (item.data) {
                  const mime = item.mime_type || 'video/mp4';
                  res.json({
                    status: 'completed',
                    videoUrl: `data:${mime};base64,${item.data}`,
                  });
                  return;
                }
                if (item.uri) {
                  res.json({
                    status: 'completed',
                    videoUrl: item.uri,
                  });
                  return;
                }
              }
            }
          }
        }

        res.status(422).json({
          status: 'failed',
          error:
            'Video operation completed but was filtered by safety checks. Try simplifying the prompt.',
          code: 'SAFETY_BLOCKED',
        });
        return;
      }

      if (status === 'failed' || status === 'cancelled') {
        res.json({
          status: 'failed',
          error:
            'Veo video generation did not complete. Please check your prompt or quota and try again.',
          code: 'GENERATION_FAILED',
        });
        return;
      }

      res.json({
        status: 'in_progress',
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        status: 'failed',
        error: classified.message,
        code: classified.code,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AvatarStudio server listening on http://localhost:${PORT}`);
  });
}

startServer();
