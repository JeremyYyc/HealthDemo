import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const globalPrisma = globalThis as typeof globalThis & { healthDemoPrisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const schema = new URL(connectionString).searchParams.get("schema");
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  globalPrisma.healthDemoPrisma ??= createPrismaClient();
  return globalPrisma.healthDemoPrisma;
}
