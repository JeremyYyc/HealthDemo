"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation.js";
import { apiRequest, ClientApiError, stepPath } from "../../src/ui/session.js";
import { LoadingCard, PageShell } from "../../src/ui/shell.js";
import { useSession } from "../../src/ui/use-session.js";

export default function GeneratingPage() {
  const router = useRouter();
  const { session, loading, refresh } = useSession();
  const attempted = useRef(false);
  const [error, setError] = useState("");

  async function complete() {
    if (!session || attempted.current) return;
    attempted.current = true; setError("");
    try {
      await apiRequest(`/api/assessments/${session.assessment.id}/complete`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: session.assessment.version }),
      });
      router.replace("/result");
    } catch (caught) {
      const apiError = caught instanceof ClientApiError ? caught : null;
      if (apiError?.code === "VERSION_CONFLICT" || apiError?.code === "ASSESSMENT_INCOMPLETE") {
        const latest = await refresh();
        if (latest) router.replace(stepPath(latest.assessment.nextStep));
        return;
      }
      setError(apiError?.message ?? "We could not generate your summary.");
    }
  }

  useEffect(() => {
    if (!session) return;
    if (session.assessment.status === "COMPLETED") { router.replace("/result"); return; }
    if (session.assessment.nextStep !== "COMPLETE") { router.replace(stepPath(session.assessment.nextStep)); return; }
    void complete();
  });

  if (loading || !error) return <PageShell narrow><LoadingCard label="Calculating your health direction…" /></PageShell>;
  return <PageShell narrow><section className="card centered"><p className="eyebrow">Almost there</p><h1>We couldn’t finish the calculation</h1><p className="error-banner" role="alert">{error}</p><button className="primary-button" type="button" onClick={() => { attempted.current = false; void complete(); }}>Retry</button></section></PageShell>;
}
