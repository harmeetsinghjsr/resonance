# Meet Resonance

**An AI-powered voice cloning and text-to-speech generation platform for teams.**

Resonance lets organizations generate natural-sounding speech from text using cloned or built-in voices, self-hosting the underlying voice model instead of relying on paid third-party APIs like ElevenLabs.

**[Live Demo](https://sarcastic-resonance.vercel.app/)**

---

## Overview

Users sign in, select an organization, choose from 20 built-in system voices, enter text, and tune generation parameters (temperature, top-p, top-k, repetition penalty). The backend sends the request to a self-hosted **Chatterbox TTS** model running on serverless GPU infrastructure, stores the generated audio in **Cloudflare R2**, and tracks each generation in PostgreSQL. Users can then play back audio through an interactive waveform player and revisit their generation history at any time.

## Features

- 🎙️ **Text-to-speech generation** with adjustable voice parameters (temperature, top-p, top-k, repetition penalty)
- 🗣️ **20 built-in system voices**, deterministically avatared per voice
- 🌊 **Interactive waveform playback** via WaveSurfer.js, with download support
- 📜 **Generation history** — revisit and replay past generations, with relative timestamps
- 🏢 **Multi-tenant organizations** — auth and data are scoped per organization via Clerk
- 📱 **Responsive design** — dedicated mobile drawers for voice selection, settings, and history
- 🔭 **Full-stack observability** via Sentry (client, server, and edge)

## Architecture

```
Next.js (App Router) ──tRPC──> API layer ──> PostgreSQL (Prisma)
        │                                         │
        │                                    Generation / Voice records
        │
        └──> Chatterbox TTS (self-hosted, Modal GPU) ──> Cloudflare R2 (audio storage)
```

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui (Radix primitives)
- **API layer:** tRPC (type-safe client-server calls), TanStack Query, TanStack Form + Zod validation
- **Database:** PostgreSQL via Prisma ORM
- **Auth & multi-tenancy:** Clerk (organizations, sessions, sign-in/up)
- **Voice model:** Self-hosted [Chatterbox TTS](https://github.com/resemble-ai/chatterbox) on [Modal](https://modal.com) (serverless GPU), served via FastAPI
- **Object storage:** Cloudflare R2 (S3-compatible) for reference and generated audio, accessed via presigned URLs
- **Audio playback:** WaveSurfer.js for interactive waveform rendering
- **Observability:** Sentry across client, server, and edge runtimes

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui |
| API | tRPC, TanStack Query, TanStack Form, Zod |
| Database | PostgreSQL, Prisma |
| Auth | Clerk |
| Voice Model | Chatterbox TTS (self-hosted on Modal, FastAPI) |
| Storage | Cloudflare R2 (AWS S3 SDK) |
| Audio | WaveSurfer.js |
| Monitoring | Sentry |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Seed system voices (uploads to DB + R2)
npx tsx scripts/seed-system-voices.ts

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### System voice audio

`seed-system-voices.ts` uploads one reference clip per voice from
`scripts/system-voices/<Name>.wav` (gitignored) to your R2 bucket, and points each
`Voice.r2ObjectKey` at it. If those objects are missing from the bucket, voice
*previews* fail even though generation still works, because generation resolves
`voice_key` inside the Chatterbox service's own storage.

```bash
# Confirm every SYSTEM voice has audio in your bucket
npx tsx scripts/check-voice-keys.ts

# Rebuild the clips by synthesizing one per voice from a running Chatterbox
# endpoint, then re-run the seed to upload them
node scripts/capture-system-voice-audio.mjs
npx tsx scripts/seed-system-voices.ts
```

### Chatterbox TTS service

The model runs as a separate Python/Modal service, deployed independently:
`modal/chatterbox_app.py`. It serves `POST /generate` with the same contract the
app calls (`x-api-key` header, `audio/wav` response), reading each `voice_key`
from **your** R2 bucket, so voice audio and generation stay in one account. Deploy
instructions and required secrets are in the file's docstring.

## Environment Variables

Key variables (validated via `@t3-oss/env-nextjs` in `src/lib/env.ts`):

- `DATABASE_URL` — PostgreSQL connection string
- Clerk keys (auth)
- Cloudflare R2 credentials (S3-compatible endpoint, access key, secret, bucket)
- Chatterbox TTS API URL and key

## Status

Core pipeline — text input → GPU inference → R2 storage → DB tracking → waveform playback — is fully functional end-to-end, including generation history, a voice browsing page, Polar usage-based billing, and voice cloning (record or upload a short reference clip to create an org-specific voice).

Voice cloning uploads are limited to 4 MB (recordings stop at 40 seconds) because the audio is sent as the request body, and Vercel functions reject bodies over 4.5 MB.

## License

MIT
