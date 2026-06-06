import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // NextAuth
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().min(1, "NEXTAUTH_URL is required"),

  // Ocean.io
  OCEAN_API_KEY: z.string().min(1, "OCEAN_API_KEY is required"),

  // Prospeo
  PROSPEO_API_KEY: z.string().min(1, "PROSPEO_API_KEY is required"),

  // Eazyreach
  EAZYREACH_API_KEY: z.string().min(1, "EAZYREACH_API_KEY is required"),

  // Brevo
  BREVO_API_KEY: z.string().min(1, "BREVO_API_KEY is required"),
  BREVO_SENDER_EMAIL: z.string().min(1, "BREVO_SENDER_EMAIL is required"),
  BREVO_SENDER_NAME: z.string().min(1, "BREVO_SENDER_NAME is required"),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Missing or invalid environment variables:");
    result.error.issues.forEach((err) => {
      console.error(`  → ${err.path.join(".")}: ${err.message}`);
    });
    console.error("\nPlease check your .env file or Railway environment variables.");
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
