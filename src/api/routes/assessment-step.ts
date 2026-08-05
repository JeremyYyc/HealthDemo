import { ApiError } from "../errors.js";
import { apiSuccess } from "../http.js";
import { createJsonWriteRoute, type JsonWriteHandler } from "../write-guard.js";
import { parseStepSubmission } from "../../domain/assessment-steps.js";
import type { AssessmentStepService } from "../../services/assessment-step-service.js";

export interface AssessmentStepRouteContext {
  params: Promise<{ id: string; step: string }>;
}

export function createAssessmentStepPatchRoute(options: {
  appBaseUrl: string;
  getService: () => AssessmentStepService;
}) {
  const handler: JsonWriteHandler<AssessmentStepRouteContext> = async (request, context, routeContext) => {
    if (!routeContext) throw new ApiError("INTERNAL_ERROR");
    const { id, step } = await routeContext.params;
    const submission = parseStepSubmission(step, context.body);
    return apiSuccess(await options.getService().save(request, id, submission));
  };
  return createJsonWriteRoute(handler, { appBaseUrl: options.appBaseUrl });
}
