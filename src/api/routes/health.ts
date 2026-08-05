import { createHealthRoute, PrismaDatabaseHealthProbe } from "../health.js";
import { getPrismaClient } from "../../database/prisma.js";

const appVersion = process.env.APP_VERSION ?? process.env.npm_package_version ?? "unknown";

export function GET(request: Request): Promise<Response> {
  return createHealthRoute({
    database: {
      check: () => new PrismaDatabaseHealthProbe(getPrismaClient()).check(),
    },
    appVersion,
  })(request);
}
