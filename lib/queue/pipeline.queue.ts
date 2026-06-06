import { Queue, QueueOptions } from "bullmq";
import { getRedisClient } from "../redis/connection";

const queueOptions: QueueOptions = {
  connection: getRedisClient() as any,
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

