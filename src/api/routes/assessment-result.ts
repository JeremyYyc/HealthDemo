import { apiSuccess, handleApiRequest, type SafeLogger } from "../http.js";
import type { AssessmentResultService } from "../../services/assessment-result-service.js";

export interface AssessmentResultRouteContext {
  params: Promise<{ id: string }>;
}

export function createAssessmentResultGetRoute(options: {
  getService: () => AssessmentResultService;
  logger?: SafeLogger;
}) {
  return (request: Request, routeContext?: AssessmentResultRouteContext) =>
    handleApiRequest(
      request,
      async () => {
        if (!routeContext) throw new Error("Missing route context");
        const { id } = await routeContext.params;
        return apiSuccess(await options.getService().get(request, id));
      },
      options.logger ? { logger: options.logger } : {},
    );
}
