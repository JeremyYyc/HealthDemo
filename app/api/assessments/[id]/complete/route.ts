import { createAssessmentCompletionPostRoute } from "../../../../../src/api/routes/assessment-completion.js";
import {
  appBaseUrl,
  getAssessmentCompletionService,
} from "../../../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";

export const POST = createAssessmentCompletionPostRoute({ appBaseUrl, getService: getAssessmentCompletionService });
