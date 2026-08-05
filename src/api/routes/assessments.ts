import { z } from "zod";
import { ApiError } from "../errors.js";
import { apiSuccess } from "../http.js";
import { createJsonWriteRoute, type JsonWriteHandler } from "../write-guard.js";
import type { SessionService } from "../../services/session-service.js";

const emptyObjectSchema = z.object({}).strict();

export function createAssessmentsPostRoute(options: {
  appBaseUrl: string;
  getService: () => SessionService;
}) {
  const handler: JsonWriteHandler = async (request, context) => {
    const parsed = emptyObjectSchema.safeParse(context.body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", {
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          reason: issue.message,
        })),
      });
    }
    const result = await options.getService().createAssessment(request);
    return apiSuccess(result.data, { status: result.status });
  };
  return createJsonWriteRoute(handler, { appBaseUrl: options.appBaseUrl });
}
