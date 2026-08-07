import { createHealthRoute, PrismaDatabaseHealthProbe } from "../health.js";
import { getPrismaClient } from "../../database/prisma.js";
import { resolveAppVersion } from "../runtime-config.js";

const appVersion = resolveAppVersion();

export function GET(request: Request): Promise<Response> {
  return createHealthRoute({
    database: {
      check: () => new PrismaDatabaseHealthProbe(getPrismaClient()).check(),
    },
    appVersion,
  })(request);
}
