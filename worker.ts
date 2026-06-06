// worker.ts — Railway Worker Service Entry Point
// This file is the start command for the scoutflow-worker Railway service.
// It runs separately from the Next.js app and processes BullMQ pipeline jobs.

import "dotenv/config";
import "./lib/env"; // Enforce environment validation
import { startWorker } from "./lib/queue/pipeline.worker";

console.log("[ScoutFlow Worker] Starting...");
console.log(`[ScoutFlow Worker] Environment: ${process.env.NODE_ENV ?? "development"}`);
console.log(`[ScoutFlow Worker] Redis: ${process.env.REDIS_URL ?? "redis://localhost:6379"}`);

const worker = startWorker();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[ScoutFlow Worker] SIGTERM received. Shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[ScoutFlow Worker] SIGINT received. Shutting down...");
  await worker.close();
  process.exit(0);
});
