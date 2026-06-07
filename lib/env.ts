import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional(),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  OCEAN_API_KEY: z.string().min(1, "OCEAN_API_KEY is required"),
  PROSPEO_API_KEY: z.string().min(1, "PROSPEO_API_KEY is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required").optional(),
  RESEND_API: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email("RESEND_FROM_EMAIL must be a valid email"),
  RESEND_FROM_NAME: z.string().min(1, "RESEND_FROM_NAME is required"),
  RESEND_REPLY_TO: z.string().email("RESEND_REPLY_TO must be a valid email").optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
}).refine(
  (data) => data.RESEND_API_KEY || data.RESEND_API,
  { message: "Either RESEND_API_KEY or RESEND_API must be set" }
);

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  throw new Error("Invalid environment variables");
}

export const env = _env.data;

