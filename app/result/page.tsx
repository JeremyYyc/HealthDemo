"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation.js";
import { LoadingCard, PageShell, SessionFailure } from "../../src/ui/shell.js";
import { apiRequest, ClientApiError, guardPath, stepPath, type AssessmentView } from "../../src/ui/session.js";
import { useSession } from "../../src/ui/use-session.js";

export default function ResultPage() {
  const router = useRouter();
  const { session, error: sessionError, loading, refresh } = useSession();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const startingRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    const destination = guardPath(session, "result");
    if (destination) router.replace(destination);
  }, [router, session]);
  async function startNew() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true); setStartError("");
    try {
      const assessment = await apiRequest<AssessmentView & { created: boolean }>("/api/assessments", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      router.push(stepPath(assessment.nextStep));
    } catch (caught) {
      setStartError(caught instanceof ClientApiError ? caught.message : "A new assessment could not be started.");
      startingRef.current = false;
      setStarting(false);
    }
  }
  if (loading) return <PageShell narrow><LoadingCard label="Loading your summary…" /></PageShell>;
  if (!session) return <PageShell narrow><SessionFailure message={sessionError?.message ?? "The session could not be restored."} retry={() => void refresh()} /></PageShell>;
  if (session.assessment.status !== "COMPLETED") return <PageShell narrow><LoadingCard label="Returning to your assessment…" /></PageShell>;
  return <PageShell><section className="result-hero"><p className="eyebrow">Assessment complete</p><h1>Your free health summary is ready.</h1><p className="lede">You’ve created a consistent baseline. Your detailed metrics will appear here through the protected result API.</p><p className="disclaimer">This assessment is a general wellness estimate for demonstration purposes. It is not medical advice, diagnosis, or a substitute for professional care.</p>{startError ? <p className="error-banner" role="alert">{startError}</p> : null}<div className="result-actions"><button className="primary-button" type="button">Unlock the full report</button><button className="secondary-button" type="button" disabled={starting} onClick={() => void startNew()}>{starting ? "Starting…" : startError ? "Retry new assessment" : "Start a new assessment"}</button></div></section><section className="locked-grid" aria-label="Locked report sections"><article><span>Locked</span><h2>Daily calorie target</h2></article><article><span>Locked</span><h2>Goal timeline</h2></article><article><span>Locked</span><h2>Progress forecast</h2></article></section></PageShell>;
}
