import {z} from "zod";
import {createEnv} from "@t3-oss/env-nextjs";

export const env = createEnv({
    server: {
        POLAR_ACCESS_TOKEN: z.string().min(1),
        POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
        POLAR_PRODUCT_ID: z.string().min(1),
        DATABASE_URL: z.string().min(1),
        APP_URL: z.string().min(1),
        R2_ACCOUNT_ID: z.string().min(1),
        R2_ACCESS_KEY_ID: z.string().min(1),
        R2_SECRET_ACCESS_KEY: z.string().min(1),
        R2_BUCKET_NAME: z.string().min(1),
        CHATTERBOX_API_URL: z.url(),
        CHATTERBOX_API_KEY: z.string().min(1),
        // Dev-only escape hatch. Leave unset / "true" in production so the
        // Polar paywall stays enforced. Set to "false" in local .env to skip
        // the subscription check while testing.
        BILLING_ENABLED: z.enum(["true", "false"]).default("true"),
    },
    experimental__runtimeEnv: {},
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})