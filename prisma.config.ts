import { defineConfig } from "prisma/config";

// Prisma 7 config — standard PostgreSQL connection via DATABASE_URL env var
// For production, ensure DATABASE_URL includes pooling config: ?connection_limit=10&pool_timeout=20
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
