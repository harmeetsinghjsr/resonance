import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  const voices = await db.voice.findMany({
    where: { variant: "SYSTEM" },
    select: { id: true, name: true, r2ObjectKey: true },
  });

  console.log(`\n${voices.length} SYSTEM voices in DB (bucket: ${process.env.R2_BUCKET_NAME})\n`);

  const all = new Set<string>();
  let token: string | undefined;
  do {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME!,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    (res.Contents ?? []).forEach((o) => o.Key && all.add(o.Key));
    token = res.NextContinuationToken;
  } while (token);

  console.log(`R2 bucket contains ${all.size} objects.\n`);

  let present = 0;
  let missing = 0;
  for (const v of voices) {
    const ok = v.r2ObjectKey ? all.has(v.r2ObjectKey) : false;
    if (ok) present++;
    else {
      missing++;
      console.log(`  MISSING  ${v.name}  ->  ${v.r2ObjectKey}`);
    }
  }

  console.log(`\n${present} present, ${missing} missing.`);
  if (all.size && voices.length && missing === voices.length) {
    const sample = [...all].slice(0, 10);
    console.log(`\nBucket sample keys (first 10):`);
    sample.forEach((k) => console.log(`  ${k}`));
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
