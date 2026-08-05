import { createDemoPaymentPostRoute } from "../../../src/api/routes/demo-payment.js";
import { appBaseUrl, getDemoPaymentService } from "../../../src/api/routes/session-runtime.js";

export const runtime = "nodejs";
export const POST = createDemoPaymentPostRoute({ appBaseUrl, getService: getDemoPaymentService });
