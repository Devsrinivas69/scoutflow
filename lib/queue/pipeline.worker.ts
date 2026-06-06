import { Worker, type Job } from "bullmq";
import { redisConnection, type PipelineJobData } from "./pipeline.queue";
import { runPipeline } from "./pipeline.processor";

export function startWorker() {
  const worker = new Worker<PipelineJobData>(
    "pipeline",
    (job: Job<PipelineJobData>) => runPipeline(job.data),
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job: Job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err: Error) => {
    console.error("[Worker] Worker error:", err);
  });

  console.log("[Worker] Pipeline worker started");
  return worker;
}
