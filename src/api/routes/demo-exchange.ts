import { apiSuccess } from "../http.js";
import { createJsonWriteRoute, type JsonWriteHandler } from "../write-guard.js";
import { parseDemoExchange } from "../../domain/demo-exchange.js";
import type { DemoExchangeService } from "../../services/demo-exchange-service.js";

export function createDemoExchangePostRoute(options: { appBaseUrl: string; getService: () => DemoExchangeService }) {
  const handler: JsonWriteHandler = async (request, context) => {
    const { reviewCode } = parseDemoExchange(context.body);
    const result = await options.getService().exchange(request, reviewCode);
    return apiSuccess(result.data, { headers: { "set-cookie": result.cookie } });
  };
  return createJsonWriteRoute(handler, { appBaseUrl: options.appBaseUrl });
}
