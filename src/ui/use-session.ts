"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ClientApiError, rememberSession, type SessionView } from "./session.js";

export function useSession() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const restored = await apiRequest<SessionView>("/api/session");
      rememberSession();
      setSession(restored);
      return restored;
    } catch (caught) {
      const apiError =
        caught instanceof ClientApiError
          ? caught
          : new ClientApiError("UNEXPECTED_ERROR", "Something went wrong.", [], "client", 0);
      setError(apiError);
      setSession(null);
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Session state is deliberately hydrated from the HttpOnly Cookie after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(true);
  }, [refresh]);

  return { session, error, loading, refresh };
}
