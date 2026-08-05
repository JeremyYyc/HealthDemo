"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation.js";
import { LoadingCard, PageShell } from "../../src/ui/shell.js";
import { apiRequest, guardPath, stepPath, type AssessmentView } from "../../src/ui/session.js";
import { useSession } from "../../src/ui/use-session.js";

export default function ResultPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  useEffect(() => {
    if (!session) return;
    const destination = guardPath(session, "result");
    if (destination) router.replace(destination);
  }, [router, session]);
  async function startNew() {
    const assessment = await apiRequest<AssessmentView & { created: boolean }>("/api/assessments", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    router.push(stepPath(assessment.nextStep));
  }
  if (loading || !session || session.assessment.status !== "COMPLETED") return <PageShell narrow><LoadingCard label="Loading your summary…" /></PageShell>;
  return <PageShell><section className="result-hero"><p className="eyebrow">Assessment complete</p><h1>Your free health summary is ready.</h1><p className="lede">You’ve created a consistent baseline. Your detailed metrics will appear here through the protected result API.</p><p className="disclaimer">This assessment is a general wellness estimate for demonstration purposes. It is not medical advice, diagnosis, or a substitute for professional care.</p><div className="result-actions"><button className="primary-button" type="button">Unlock the full report</button><button className="secondary-button" type="button" onClick={() => void startNew()}>Start a new assessment</button></div></section><section className="locked-grid" aria-label="Locked report sections"><article><span>Locked</span><h2>Daily calorie target</h2></article><article><span>Locked</span><h2>Goal timeline</h2></article><article><span>Locked</span><h2>Progress forecast</h2></article></section></PageShell>;
}
