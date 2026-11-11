import { installPipeline } from "./server/pipeline";
import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { installAccess } from "./server/access";

dotenv.config();

const PORT = Number(process.env.PORT || 3003);

function getElevenLabsApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ElevenLabs is not configured. Add ELEVENLABS_API_KEY to the server .env file.",
    );
  }
  return apiKey;
}

async function getElevenLabsError(
  response: globalThis.Response,
): Promise<string> {
  const responseText = await response.text();
  let message = responseText;
  try {
    const body = JSON.parse(responseText) as {
      detail?: string | { message?: string };
      message?: string;
    };
    message =
      typeof body.detail === "string"
        ? body.detail
        : body.detail?.message || body.message || responseText;
  } catch {
    // Keep the provider's plain-text response.
  }
  return `ElevenLabs request failed (${response.status}): ${message.slice(0, 400)}`;
}

async function startServer() {
  const app = express();
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  // Support direct /videolab requests and Nginx configurations that strip the prefix.
  app.use((req, _res, next) => {
    if (req.url.startsWith("/videolab/"))
      req.url = req.url.slice("/videolab".length);
    next();
  });
  installAccess(app);
  app.use(express.json({ limit: "30mb" }));
  app.use("/api", (req, res, next) => {
    if (!req.path.startsWith("/media/")) res.setHeader("Cache-Control", "no-store");
    const workerOutput = req.method === "PUT" && /^\/veo\/output\/[\w-]+$/.test(req.path);
    if (!workerOutput && ["POST", "PATCH", "PUT"].includes(req.method) &&
        (!req.body || typeof req.body !== "object" || Array.isArray(req.body))) {
      res.status(400).json({ error: "Send a JSON object as the request body." });
      return;
    }
    next();
  });
  installPipeline(app);

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
    });
  });

  app.post("/api/voice/clone", async (req: Request, res: Response) => {
    try {
      const { name, mimeType, audioBase64, consent } = req.body as {
        name?: string;
        mimeType?: string;
        audioBase64?: string;
        consent?: boolean;
      };

      if (consent !== true) {
        res.status(400).json({
          error:
            "Confirm that you own this voice or have its owner’s permission.",
        });
        return;
      }
      if (!name?.trim() || name.trim().length > 80) {
        res
          .status(400)
          .json({ error: "Enter a voice name (up to 80 characters)." });
        return;
      }
      if (!audioBase64 || !mimeType) {
        res.status(400).json({ error: "Upload an audio sample to clone." });
        return;
      }

      const extensions: Record<string, string> = {
        "audio/aac": "aac",
        "audio/flac": "flac",
        "audio/mp4": "m4a",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/webm": "webm",
        "audio/x-wav": "wav",
      };
      const extension = extensions[mimeType.toLowerCase()];
      if (!extension) {
        res.status(415).json({
          error:
            "Use an MP3, WAV, M4A, AAC, OGG, WebM, or FLAC audio recording.",
        });
        return;
      }
      if (
        audioBase64.length > 28_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)
      ) {
        res.status(413).json({
          error:
            "Audio sample must be a valid base64 recording no larger than 20 MB.",
        });
        return;
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      if (!audioBuffer.length || audioBuffer.length > 20 * 1024 * 1024) {
        res.status(413).json({
          error: "Audio sample must be no larger than 20 MB.",
        });
        return;
      }

      const apiKey = getElevenLabsApiKey();
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append(
        "files",
        new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
        `voice-sample.${extension}`,
      );

      const providerResponse = await fetch(
        "https://api.elevenlabs.io/v1/voices/add",
        {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: formData,
        },
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
          error:
            "ElevenLabs did not return a voice ID for the uploaded sample.",
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
          : "Could not create the ElevenLabs voice clone.";
      res.status(message.includes("ELEVENLABS_API_KEY") ? 503 : 502).json({
        error: message,
      });
    }
  });

  app.delete("/api/voice/:voiceId", async (req: Request, res: Response) => {
    try {
      const { voiceId } = req.params;
      if (!/^[A-Za-z0-9_-]+$/.test(voiceId)) {
        res.status(400).json({ error: "Invalid voice ID." });
        return;
      }
      const providerResponse = await fetch(
        `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
        {
          method: "DELETE",
          headers: { "xi-api-key": getElevenLabsApiKey() },
        },
      );
      if (!providerResponse.ok) {
        res.status(providerResponse.status).json({
          error: await getElevenLabsError(providerResponse),
        });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not delete the ElevenLabs voice clone.";
      res.status(message.includes("ELEVENLABS_API_KEY") ? 503 : 502).json({
        error: message,
      });
    }
  });

  // API misses must never reach the SPA's HTML fallback.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found. Check the request URL and server version." });
  });
  app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = Number(err.status) || 500;
    res.status(status).json({
      error: status === 413
        ? "The uploaded request is too large. Use a smaller file."
        : status === 400
          ? "The request body is not valid JSON."
          : "The server could not process the request.",
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const host = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
  app.listen(PORT, host, () => {
    console.log(`AvatarStudio server listening on http://${host}:${PORT}`);
  });
}

startServer();
