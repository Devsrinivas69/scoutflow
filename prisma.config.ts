import { defineConfig } from "prisma/config";

// Prisma 7 config — standard PostgreSQL connection via DATABASE_URL env var
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
