import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Copies SYSTEM voices from a source database into this project's database,
 * preserving each voice's exact `id` and `r2ObjectKey` so the keys keep
 * pointing at the audio files that already live in the source project's R2
 * bucket (the bucket the shared Chatterbox service reads from).
 *
 * Usage (PowerShell / bash):
 *   SOURCE_DATABASE_URL="<source postgres url>" npx tsx scripts/import-system-voices.ts
 *
 * - SOURCE_DATABASE_URL : the database to read voices FROM (e.g. the one in the env you were given)
 * - DATABASE_URL        : your own database to write voices INTO (read from .env)
 *
 * Read-only against the source. Idempotent: re-running updates existing rows.
 */
async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  if (!sourceUrl) {
    throw new Error("Set SOURCE_DATABASE_URL to the database to copy voices from.");
  }
  if (!targetUrl) {
    throw new Error("DATABASE_URL (your own database) is not set.");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("SOURCE_DATABASE_URL and DATABASE_URL are the same — nothing to copy.");
  }

  const source = new PrismaClient({ adapter: new PrismaPg({ connectionString: sourceUrl }) });
  const target = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl }) });

  const systemVoices = await source.voice.findMany({
    where: { variant: "SYSTEM" },
    select: {
      id: true,
      name: true,
      description: true,
      variant: true,
      category: true,
      language: true,
      r2ObjectKey: true,
    },
  });

  console.log(`Found ${systemVoices.length} SYSTEM voices in the source database.`);

  let written = 0;
  for (const v of systemVoices) {
    await target.voice.upsert({
      where: { id: v.id },
      create: {
        id: v.id,
        name: v.name,
        description: v.description,
        variant: v.variant,
        category: v.category,
        language: v.language,
        r2ObjectKey: v.r2ObjectKey,
        orgId: null,
      },
      update: {
        name: v.name,
        description: v.description,
        category: v.category,
        language: v.language,
        r2ObjectKey: v.r2ObjectKey,
      },
    });
    written += 1;
    console.log(`  ✓ ${v.name ?? v.id}`);
  }

  console.log(`\nDone. Imported/updated ${written} system voices into your database.`);

  await source.$disconnect();
  await target.$disconnect();
}

main().catch((e) => {
  console.error("Import failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
