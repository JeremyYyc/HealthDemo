import type { PrismaClient } from "../generated/prisma/client.js";
import { ApiError } from "./errors.js";
import { apiSuccess, handleApiRequest, type SafeLogger } from "./http.js";

export interface DatabaseHealthProbe {
  check(): Promise<void>;
}

export class PrismaDatabaseHealthProbe implements DatabaseHealthProbe {
  constructor(private readonly prisma: PrismaClient) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

export function createHealthRoute(options: {
  database: DatabaseHealthProbe;
  appVersion: string;
  createRequestId?: () => string;
  logger?: SafeLogger;
}): (request: Request) => Promise<Response> {
  return (request) =>
    handleApiRequest(
      request,
      async (_healthRequest, context) => {
        try {
          await options.database.check();
        } catch {
          throw new ApiError("SERVICE_UNAVAILABLE");
        }
        return apiSuccess({ status: "ok", database: "reachable", appVersion: options.appVersion });
      },
      {
        ...(options.createRequestId ? { createRequestId: options.createRequestId } : {}),
        ...(options.logger ? { logger: options.logger } : {}),
      },
    );
}
