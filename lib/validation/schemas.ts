import { z } from "zod";

/**
 * Shared Zod email field: trims whitespace and lowercases before validation.
 * Use this everywhere an email is accepted from user input.
 */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Invalid email address format");

/**
 * Registration schema — basic structure validation.
 * Full email validation (disposable check + MX) happens in the route handler
 * after this schema passes, because it requires an async DNS call.
 */
export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters")
    .regex(/^[a-zA-Z0-9\s\-'.]+$/, "Name contains invalid characters"),
  email: emailField,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be under 128 characters"),
});

/**
 * Login schema — normalizes email, validates format only.
 * No MX check on login to avoid latency.
 */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
