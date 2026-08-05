import { ApiError } from "../errors.js";
import { apiSuccess } from "../http.js";
import { createJsonWriteRoute, type JsonWriteHandler } from "../write-guard.js";
import { parseCompleteAssessment } from "../../domain/assessment-completion.js";
import type { AssessmentCompletionService } from "../../services/assessment-completion-service.js";

export interface AssessmentCompletionRouteContext {
  params: Promise<{ id: string }>;
}

export function createAssessmentCompletionPostRoute(options: {
  appBaseUrl: string;
  getService: () => AssessmentCompletionService;
}) {
  const handler: JsonWriteHandler<AssessmentCompletionRouteContext> = async (request, context, routeContext) => {
    if (!routeContext) throw new ApiError("INTERNAL_ERROR");
    const { id } = await routeContext.params;
    const { version } = parseCompleteAssessment(context.body);
    return apiSuccess(await options.getService().complete(request, id, version));
  };
  return createJsonWriteRoute(handler, { appBaseUrl: options.appBaseUrl });
}
