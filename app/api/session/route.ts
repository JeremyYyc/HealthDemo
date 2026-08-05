import { createSessionGetRoute } from "../../../src/api/routes/session.js";
import { getSessionService } from "../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";

export const GET = createSessionGetRoute({ getService: getSessionService });
