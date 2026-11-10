# Studio avatar worker (MuseTalk 1.5)

Avatar Studio can use a photo or an uploaded avatar video with new speech. The
`runpod-musetalk` engine prepares the face, lip-syncs it, uploads the silent result
to the app, and exports it with the original selected voice. Output is 480p,
25 fps, landscape or portrait, with speech between 0.2 and 60 seconds. A photo
gets mouth animation; new body gestures are not generated. A video retains its
existing motion, repeating forwards then backwards when the speech is longer.

**Status: authored and locally checked; container build, actual model inference,
GPU memory/quality, and Runpod end-to-end rendering are unverified.** No MuseTalk
endpoint was created. The app keeps `MUSETALK_GENERATION_ENABLED=false` by default.
The next external requirement is a Linux Docker builder and registry destination,
or a Runpod GitHub build connection. Docker is not installed on this workspace host.

## Build and publish

For Runpod GitHub builds with repository-root context, use the root
`Dockerfile.musetalk` and its matching `Dockerfile.musetalk.dockerignore`.
They copy only the worker files from `ops/musetalk`. The root-level
`musetalk-runpod-source.zip` is an alternative standalone build context: extract
it and build its `Dockerfile` with `.` as context. Neither route includes `.env`
or user media.

The initial GitHub image build must be started through Runpod's console
integration after source publication. The current MCP endpoint-create schema
requires a built image, and its build tools inspect existing builds. Once the
initial build starts, MCP can inspect its progress and configure the endpoint.

For the standalone Docker build below, the context is this directory. Its allowlist excludes
account keys, user media and the app's private `.env`. The image uses Python 3.10,
PyTorch 2.0.1 / CUDA 11.8 and MMCV 2.0.1, matching upstream's MMLab dependencies.
The NVIDIA Ubuntu base avoids replacing a newer Runpod PyTorch installation.

```bash
docker build --platform linux/amd64 -t YOUR_REGISTRY/avatar-studio-musetalk:v1 ops/musetalk
docker push YOUR_REGISTRY/avatar-studio-musetalk:v1
```

Use a registry you control and deploy the pushed digest, not a floating `latest`.
Alternatively, connect this repository in Runpod's Serverless GitHub builder,
select branch `deploy/musetalk-first-video`, Dockerfile `Dockerfile.musetalk`,
and repository-root context. Name the Queue endpoint `avatar-studio-musetalk`.
Use the worker settings below and choose the RTX A5000 or compatible Ampere/Ada
GPU explicitly, excluding Blackwell. Building from source does not establish
GPU compatibility.

Models are baked so worker replacement does not repeat model downloads during a
paid job. Code is pinned to `0a89dec45a0192b824e3cf4daf96c239440c5ed8`.
`download_models.py` records pinned Hugging Face revisions for MuseTalk V1.5,
SD-VAE, Whisper tiny and DWPose. Face parsing, ResNet18 and S3FD come from the
upstream download locations; their actual SHA-256 hashes are recorded at
`/opt/MuseTalk/models/build-manifest.json` in the image. Their upstream URLs are
not immutable. SyncNet and the V1.0 model are not needed for inference.

The baked models use several GB; final image size and build time must be measured
by the builder. No Model Store or paid persistent volume is needed for this fixed,
multi-repository model set. Runtime model loading is offline. Do not mount over
`/opt/MuseTalk` or `/opt/worker`.

## Runpod settings

Suggested first validation configuration; hardware fit and throughput need a real test:

| Setting | Value |
| --- | --- |
| Endpoint type | Queue-based Serverless |
| Image | The successfully built Linux amd64 image digest |
| GPU | One 24 GB Ampere/Ada GPU, excluding Blackwell for this CUDA 11.8 stack |
| Host memory | At least 32 GB suggested for long source clips |
| CUDA host floor | 12.8 (newer host driver runs the CUDA 11.8 image) |
| Minimum / maximum workers | 0 / 1 |
| Handler concurrency | 1 |
| Idle timeout | 5 seconds initially |
| Execution timeout | 600000 ms; align with the app's job setting |
| Container disk | 30 GB suggested; check measured image and scratch needs |
| Network volume / public ports | None |
| Worker environment | `STUDIO_BASE_URL=https://office.creativeprocess.io/videolab` |

The worker only downloads cached media from that HTTPS origin, refuses redirects,
and sends its output to that origin's job-specific upload URL. The app proxy must
allow `PUT /videolab/api/veo/output/:id`, preserve `Authorization` and allow 50 MB
bodies, with an upload timeout of at least 120 seconds. Photo/video uploads to the
app require a 30 MB JSON limit. Verify these through the public proxy before a
paid render. Worker start/health alone does not validate either media access or CUDA.

After creating and reading back the endpoint, configure the app server:

```dotenv
RUNPOD_MUSETALK_ENDPOINT=THE_NEW_ENDPOINT_ID
MUSETALK_GENERATION_ENABLED=false
MUSETALK_MAX_JOB_SECONDS=600
MUSETALK_HOURLY_USD=THE_ACTUAL_FLEX_WORKER_RATE
```

The hourly value must come from a fresh Runpod rate read. The `.env.example` rate
is a placeholder for reservations, not a quote. At runtime the app reserves
`rate * 600 / 3600` and reconciles terminal jobs using Runpod's `executionTime`.
Missing runtime data and user cancellation retain the reservation. This app ledger
does not include all startup/idle/storage charges; use Runpod billing for the total.
No monthly render cost or quality claim is established until a representative test.

An optional private `MUSETALK_CALLBACK_SECRET` signs output uploads; otherwise the
app uses its Runpod API key. Neither secret is sent to the worker or browser. The
worker gets a derived token authorizing only its own job. Keep the signing secret
stable across app restarts and do not rotate it while a render is active.

## Validate one real render

Start the app and prepare a request using a sharp photo or a short source video,
and a real WAV/MP3 voice recording. Preparation does not call the GPU:

```bash
node --import tsx ops/musetalk/smoke-test.ts --prepare \
  --source /absolute/path/avatar.mp4 --audio /absolute/path/speech.wav \
  --script 'The words actually spoken in this recording.'
```

Use `--aspect 9:16` for portrait delivery. Review
`data/musetalk-validation/review.json`. Once the paid validation is authorized,
enable `MUSETALK_GENERATION_ENABLED=true` in the server environment, restart the
app, and submit exactly once:

```bash
APPROVE_PAID_GENERATION=yes node --import tsx ops/musetalk/smoke-test.ts --submit
```

The script stores its app job ID before polling. Resume an interrupted test with:

```bash
node --import tsx ops/musetalk/smoke-test.ts --status
```

If submission has an unknown outcome it refuses another submission. Review the
app ledger and Runpod jobs to recover the existing ID. Do not remove state to retry.
Review `output.mp4` for face identity, mouth artifacts, speech timing, original
voice and movement; record GPU, image digest, peak memory, queue/startup/execution
times, provider job ID and observed Runpod charges. Then test repeat speech on the
same source, a failed input followed by a valid one, cancellation and a cold worker
replacement before enabling general use. For a fresh validation source, use a new
`--directory data/musetalk-validation-2` instead of overwriting a submitted request.

## Local verification and recovery

```bash
npm run lint
node --import tsx --test server/*.test.ts src/utils/*.test.ts
python3 -B -m unittest discover -s ops/musetalk -p 'test_*.py' -v
npm run build
```

Node tests use real CPU-generated media and mocked Runpod responses to verify
video upload/normalization, simultaneous-request deduplication, authenticated
output delivery, original voice export, restart recovery, failed-job retry,
cancellation and uncertain-submission quarantine. Python tests check the worker's
URL contract, real audio conversion and adapter cleanup with fake transport and
inference. These are not GPU/model tests.

Models load once per warm process. One source's prepared frames, face masks and
CPU latents are cached in memory, then evicted on a source change. Replacement
workers rebuild this cache; no persistent user-face cache or file deserialization
is used. Per-job scratch is removed on success and failure. Completed provider
uploads live on the app disk across worker replacement and are deleted after
export. Failed/cancelled jobs discard received intermediates. Unknown submissions
retain both their reservation and any upload for operator reconciliation. A worker
error is reported as failure; the worker never retries inference or submissions.

Sources: [MuseTalk](https://github.com/TMElyralab/MuseTalk),
[Runpod custom workers](https://docs.runpod.io/serverless/workers/handler-functions),
[queue operations](https://docs.runpod.io/serverless/endpoints/operation-reference),
[GitHub builds](https://docs.runpod.io/serverless/workers/github-integration).
