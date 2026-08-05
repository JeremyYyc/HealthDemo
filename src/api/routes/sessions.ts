import { z } from "zod";
import { ApiError } from "../errors.js";
import { apiSuccess } from "../http.js";
import { createJsonWriteRoute, type JsonWriteHandler } from "../write-guard.js";
import type { SessionService } from "../../services/session-service.js";

const entrySchema = z.object({ ageRange: z.enum(["18_29", "30_39", "40_49", "50_100"]) }).strict();

export function createSessionsPostRoute(options: {
  appBaseUrl: string;
  getService: () => SessionService;
}) {
  const handler: JsonWriteHandler = async (request, context) => {
    const parsed = entrySchema.safeParse(context.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          reason: issue.message,
        })),
      });
    }
    const result = await options.getService().enter(request, parsed.data.ageRange);
    return apiSuccess(result.data, {
      status: result.status,
      ...(result.cookie ? { headers: { "set-cookie": result.cookie } } : {}),
    });
  };
  return createJsonWriteRoute(handler, { appBaseUrl: options.appBaseUrl });
}
