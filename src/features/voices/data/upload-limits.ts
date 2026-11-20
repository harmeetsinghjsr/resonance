// Vercel serverless functions reject request bodies larger than 4.5 MB, and
// /api/voices/create receives the raw audio file as the request body. Keep the
// client-side limits safely below that so users get a clear message instead of
// an opaque platform error.
export const MAX_VOICE_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_VOICE_UPLOAD_LABEL = "4MB";

// The recorder captures 44.1 kHz mono 16-bit WAV (~88 KB/s), so 40 seconds is
// ~3.5 MB. Chatterbox only needs a short reference clip anyway.
export const MAX_RECORDING_SECONDS = 40;
