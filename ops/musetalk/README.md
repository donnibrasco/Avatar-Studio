# MuseTalk private studio release

The deployed worker uses a built image containing the MuseTalk 1.5 source,
Python/system dependencies and model weights. It runs directly without package
installation at startup. Image and build provenance are in `image-manifest.json`.
The source branch is `deploy/musetalk-first-video` in `donnibrasco/Avatar-Studio`.

## Validated scope

One private workspace for its owner and trusted team, with one avatar job at a
time. Sign-in protects paid APIs, job details and media. Worker inputs use signed
links valid for one hour; output uploads use a separate job-specific token.
This release does not provide public registration or independent customer tenants.
See [private studio operations](../PRIVATE_STUDIO.md) for access, budgets and recovery.

Actual GPU validations completed:

| Input | Output | Result |
| --- | --- | --- |
| First male photo and existing speech | 10 s, landscape 854×480 | Completed |
| Different male photo and fresh Chatterbox speech | 5.92 s, portrait 480×854 | Completed |
| Five-second moving avatar clip and repeated speech | 59.8 s, portrait 480×854 | Completed on the built image |

The long validation used 1495 frames at 25 fps, took 128007 ms of execution after
29927 ms of queue/startup, and reported peak GPU memory of 7064.7 MiB on an RTX
A5000. All 11 media checks passed, including full decode, duration/frame count,
non-silent preserved audio, changing frames and MP4 fast-start. The final app
suite passed 19 tests; two CPU worker checks, TypeScript and the production build
also passed. Integration tests use mocked provider responses; the three saved
video runs are actual GPU jobs.

Sampled frames show mouth animation and preserved framing. Mouth/beard details
can be softer than the reference. No perceptual lip-sync benchmark or human
listening assessment was performed. The long speech was repeated test audio,
so that job establishes supported duration and resource use, not varied-content
quality. See `production-readiness.json` for the complete local assessment.

## Endpoint and billing

Endpoint `gznh9jnnfgbzhu` is a queue endpoint on one RTX A5000 (24 GB). The catalog
serverless rate read during validation was $0.75/hour. Settings: minimum 0,
maximum 1 worker, five-second idle timeout, 600000 ms execution timeout, 50 GB
container disk, no persistent GPU volume. `mcp-create-endpoint.json` records a
reproducible configuration. Every change must be read back after updating.

`RUNPOD_BILLING_GUARD_ENABLED=true` reads provider account billing every five
minutes and pauses new generation when a read becomes older than ten minutes.
Admission includes reported charges and retained app reservations, which can count
usage conservatively twice. Provider billing can arrive late and other account
workloads can spend independently. App job costs are execution allocations, not
the final provider invoice; startup, idle, storage and fees are separate.
The local cost report is `data/musetalk-test-costs.json`.

## Build and deploy

GitHub Actions builds Linux amd64 from root `Dockerfile.musetalk` and its allowlist
`Dockerfile.musetalk.dockerignore`. It publishes a commit tag and image digest to
GHCR, with provenance and SBOM. Deploy a verified digest and preserve the minimum
0 / maximum 1 worker setting. The standalone `ops/musetalk/Dockerfile` uses this
folder as its context. `musetalk-runpod-source.zip` contains a standalone source
bundle; neither build context includes `.env`, login files or user media.

The NVIDIA base, MuseTalk revision, primary Python dependencies and Hugging Face
model revisions are pinned. The built image records installed requirements and
model hashes. Do not mount over `/opt/MuseTalk` or `/opt/worker`. The old
`install-runtime.sh`/`start-runtime.sh` files describe the initial compatibility
deployment and are not the production startup command.

## Reproduce verification

```bash
npm run lint
node --import tsx --test --test-concurrency=1 server/*.test.ts src/utils/*.test.ts
python3 -B -m unittest discover -s ops/musetalk -p 'test_*.py' -v
npm run build
```

Prepare a new paid validation in a new directory, then submit once. A photo gets
mouth animation; an avatar video retains existing movement, repeated forwards and
backwards if necessary. New body gestures are not generated.

```bash
node --import tsx ops/musetalk/smoke-test.ts --prepare \
  --source /absolute/path/avatar.mp4 --audio /absolute/path/speech.wav \
  --script 'The words in the recording.' --aspect 9:16 \
  --directory data/new-validation --login-file data/private/studio-login.txt
APPROVE_PAID_GENERATION=yes node --import tsx ops/musetalk/smoke-test.ts --submit \
  --directory data/new-validation --login-file data/private/studio-login.txt
```

Resume an interrupted validation with `--status` on that same directory. Never
remove submission state to retry an uncertain request. The app quarantines
ambiguous video and speech submissions, including across restarts.

```bash
python3 -B ops/musetalk/verify-output.py \
  --directory data/musetalk-release-validation \
  --audio data/musetalk-release-validation/stress-speech.wav --aspect 9:16
```

Media checks do not measure perceptual lip-sync. Failed or cancelled jobs retain
cost reservations for review. Use the encrypted backup procedure before moving
application data, and retain a secure off-host copy of the archive and key.
