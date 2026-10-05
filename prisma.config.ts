import "dotenv/config";
import { defineConfig } from "prisma/config";

const isProd = process.env.APP_MODE === "prod" || process.env.NODE_ENV === "production";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: isProd ? process.env.DATABASE_URL : process.env.DIRECT_URL,
  },
});
