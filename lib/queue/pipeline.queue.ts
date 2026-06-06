import { Queue, QueueOptions } from "bullmq";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// Use connection URL string — BullMQ will handle the Redis client internally
// This avoids ioredis version conflicts between bullmq's bundled ioredis and ours
const redisConnection = { url: redisUrl };

const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
};

export const pipelineQueue = new Queue("pipeline", queueOptions);

export interface PipelineJobData {
  runId: string;
  seedDomain: string;
  userId: string;
  orgId: string;
}

// Export connection config for worker to reuse
export { redisConnection };
