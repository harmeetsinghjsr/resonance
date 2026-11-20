// Captures one reference clip per SYSTEM voice from a running Chatterbox
// endpoint into scripts/system-voices/<Name>.wav, the layout that
// scripts/seed-system-voices.ts uploads from.
//
// Use this when the voice rows exist in the database but the audio is missing
// from your own R2 bucket, so /api/voices/[voiceId] can serve previews again.
//
//   node scripts/capture-system-voice-audio.mjs
//
// Env (falls back to the shared public endpoint):
//   CHATTERBOX_API_URL, CHATTERBOX_API_KEY
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL =
  process.env.CHATTERBOX_API_URL ??
  "https://ankurpathak795--chatterbox-tts-chatterbox-serve.modal.run";
const API_KEY = process.env.CHATTERBOX_API_KEY ?? "super-secret-key";

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "system-voices",
);

// Long, phonetically varied, punctuation-rich: the model clones better from
// speech that actually sounds like narration than from a bare sentence.
const REFERENCE_TEXT =
  "When the evening light settles over the quiet valley, every familiar sound " +
  "returns to its place, and the long day finally begins to feel like it is over. " +
  "There is a particular kind of calm in that moment, one that is easy to miss " +
  "and hard to forget.";

// name -> source voice id. These ids are the r2ObjectKey suffixes on the
// existing SYSTEM rows; change them only if the database rows change.
const VOICES = [
  ["Aaron", "cmql70hiz0000psihogkgk4f0"],
  ["Abigail", "cmql70kt80001psihm3floiaj"],
  ["Anaya", "cmql70lm20002psihtd6fh8ii"],
  ["Andy", "cmql70ml10003psihp449kyba"],
  ["Archer", "cmql70p4m0004psih4x1g7g97"],
  ["Brian", "cmql70px10005psihpvc6aeii"],
  ["Chloe", "cmql70qq30006psihnvdbk0ww"],
  ["Dylan", "cmql70rl10007psih89cpcn8k"],
  ["Emmanuel", "cmql70ssh0008psihx0o7k0g5"],
  ["Ethan", "cmql70tud0009psihp4dtoc0u"],
  ["Evelyn", "cmql70uuf000apsih6hwpkxcl"],
  ["Gavin", "cmql70vqz000bpsihfqvvtqyb"],
  ["Gordon", "cmql70wm3000cpsihhxek8j8u"],
  ["Ivan", "cmql70xi9000dpsihy632ruka"],
  ["Laura", "cmql70yef000epsihmtqoxjp3"],
  ["Lucy", "cmql70zb3000fpsihxfyowmmr"],
  ["Madison", "cmql7108l000gpsihjywux2r0"],
  ["Marisol", "cmql7133p000hpsihh6vqfw6u"],
  ["Meera", "cmql713w2000ipsih3h9airdb"],
  ["Walter", "cmql714sx000jpsih8u776q7x"],
];

await fs.mkdir(OUT_DIR, { recursive: true });

let ok = 0;
const failed = [];

for (const [name, id] of VOICES) {
  try {
    const res = await fetch(`${BASE_URL}/generate`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        prompt: REFERENCE_TEXT,
        voice_key: `voices/system/${id}`,
        temperature: 0.8,
        top_p: 0.95,
        top_k: 1000,
        repetition_penalty: 1.2,
        norm_loudness: true,
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 4096) {
      throw new Error(`response too small to be audio (${buffer.length} bytes)`);
    }

    await fs.writeFile(path.join(OUT_DIR, `${name}.wav`), buffer);
    ok += 1;
    console.log(`ok   ${name.padEnd(9)} ${(buffer.length / 1024).toFixed(0)} KB`);
  } catch (error) {
    failed.push(name);
    console.log(`FAIL ${name.padEnd(9)} ${error.message}`);
  }
}

console.log(`\n${ok}/${VOICES.length} captured into ${OUT_DIR}`);
if (failed.length) {
  console.log(`failed: ${failed.join(", ")} — re-run to retry just those.`);
  process.exitCode = 1;
}
