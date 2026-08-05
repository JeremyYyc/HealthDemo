import { createAssessmentStepPatchRoute } from "../../../../../../src/api/routes/assessment-step.js";
import {
  appBaseUrl,
  getAssessmentStepService,
} from "../../../../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";

export const PATCH = createAssessmentStepPatchRoute({ appBaseUrl, getService: getAssessmentStepService });
