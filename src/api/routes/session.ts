import { apiSuccess, handleApiRequest } from "../http.js";
import type { SessionService } from "../../services/session-service.js";

export function createSessionGetRoute(options: { getService: () => SessionService }) {
  return (request: Request) =>
    handleApiRequest(request, async () => apiSuccess(await options.getService().restore(request)));
}
