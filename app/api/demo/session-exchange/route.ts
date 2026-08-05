import { createDemoExchangePostRoute } from "../../../../src/api/routes/demo-exchange.js";
import { appBaseUrl, getDemoExchangeService } from "../../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";
export const POST = createDemoExchangePostRoute({ appBaseUrl, getService: getDemoExchangeService });
