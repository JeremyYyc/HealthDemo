import { createSessionsPostRoute } from "../../../src/api/routes/sessions.js";
import { appBaseUrl, getSessionService } from "../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";

export const POST = createSessionsPostRoute({ appBaseUrl, getService: getSessionService });
