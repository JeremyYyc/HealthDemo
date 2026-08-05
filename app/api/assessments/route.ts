import { createAssessmentsPostRoute } from "../../../src/api/routes/assessments.js";
import { appBaseUrl, getSessionService } from "../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";

export const POST = createAssessmentsPostRoute({ appBaseUrl, getService: getSessionService });
