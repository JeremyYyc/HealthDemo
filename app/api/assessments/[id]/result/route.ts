import { createAssessmentResultGetRoute } from "../../../../../src/api/routes/assessment-result.js";
import { getAssessmentResultService } from "../../../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";

export const GET = createAssessmentResultGetRoute({
  getService: getAssessmentResultService,
  logger: (entry) => {
    if (entry.status >= 500) console.error("api_error", entry);
  },
});
