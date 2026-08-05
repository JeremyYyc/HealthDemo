import { apiSuccess } from "../http.js";
import { createJsonWriteRoute, type JsonWriteHandler } from "../write-guard.js";
import { parseDemoPayment } from "../../domain/demo-payment.js";
import type { DemoPaymentService } from "../../services/demo-payment-service.js";

export function createDemoPaymentPostRoute(options: { appBaseUrl: string; getService: () => DemoPaymentService }) {
  const handler: JsonWriteHandler = async (request, context) => {
    const submission = parseDemoPayment(context.body);
    return apiSuccess(await options.getService().pay(request, submission, context.requestId));
  };
  return createJsonWriteRoute(handler, { appBaseUrl: options.appBaseUrl });
}
