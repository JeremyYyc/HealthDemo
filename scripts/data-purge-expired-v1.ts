import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { DATA_PURGE_VERSION, DataPurgeUsageError, parseDataPurgeArguments } from "../src/domain/data-purge.js";
import { DataPurgeService } from "../src/services/data-purge-service.js";

const connectionString = process.env.DATABASE_URL;

async function main() {
  const options = parseDataPurgeArguments(process.argv.slice(2));
  if (!connectionString) throw new DataPurgeUsageError("DATABASE_URL is required");
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, schema ? { schema } : undefined) });
  try {
    console.info(JSON.stringify(await new DataPurgeService(prisma).purge(options.mode, options.calculationTime)));
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  const usageError = error instanceof DataPurgeUsageError;
  console.error(JSON.stringify({ version: DATA_PURGE_VERSION, outcome: "FAILED", error: usageError ? error.message : "Purge transaction failed" }));
  process.exitCode = usageError ? 2 : 1;
}
