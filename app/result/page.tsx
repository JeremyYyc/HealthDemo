"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation.js";
import type { AssessmentResultDto, FullResultDto } from "../../src/domain/assessment-result.js";
import { LoadingCard, PageShell, SessionFailure } from "../../src/ui/shell.js";
import { apiRequest, ClientApiError, guardPath, hasSeenSession, stepPath, type AssessmentView } from "../../src/ui/session.js";
import { useSession } from "../../src/ui/use-session.js";

function categoryLabel(category: AssessmentResultDto["bmiCategory"]): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

function FullReport({ result }: { result: FullResultDto }) {
  return (
    <>
      <section className="metric-grid" aria-label="Full health report">
        <article><span>BMR estimate</span><strong>{result.bmrKcal.toLocaleString()} kcal</strong></article>
        <article><span>Daily energy estimate</span><strong>{result.tdeeKcal.toLocaleString()} kcal</strong></article>
        <article><span>Suggested daily intake</span><strong>{result.recommendedCaloriesKcal.toLocaleString()} kcal</strong></article>
        <article><span>Estimated timeline</span><strong>{result.estimatedWeeks} weeks</strong></article>
        <article><span>Target date</span><strong>{result.targetDate ?? "Maintain your baseline"}</strong></article>
        <article><span>Calculation date</span><strong>{result.calculationDate}</strong></article>
      </section>
      <section className="card forecast-card" aria-labelledby="forecast-title">
        <p className="eyebrow">Progress forecast</p>
        <h2 id="forecast-title">Weekly estimate</h2>
        {result.calorieFloorApplied ? <p className="notice-banner">The demonstration calorie floor was applied.</p> : null}
        <ol className="forecast-list">
          {result.predictionCurve.map((point) => (
            <li key={`${point.week}-${point.date}`}><span>Week {point.week}</span><span>{point.date}</span><strong>{point.weightKg} kg</strong></li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const { session, error: sessionError, loading, refresh } = useSession();
  const [result, setResult] = useState<AssessmentResultDto | null>(null);
  const [resultError, setResultError] = useState<ClientApiError | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [unlockNote, setUnlockNote] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const startingRef = useRef(false);
  const assessmentId = session?.assessment.status === "COMPLETED" ? session.assessment.id : null;

  useEffect(() => {
    if (!session) return;
    const destination = guardPath(session, "result");
    if (destination) router.replace(destination);
  }, [router, session]);
  useEffect(() => {
    if (!loading && sessionError?.code === "SESSION_REQUIRED") {
      router.replace(hasSeenSession() ? "/?lost=1" : "/");
    }
  }, [loading, router, sessionError]);

  const loadResult = useCallback(async () => {
    if (!assessmentId) return;
    setResultLoading(true);
    setResultError(null);
    try {
      setResult(await apiRequest<AssessmentResultDto>(`/api/assessments/${assessmentId}/result`));
    } catch (caught) {
      const apiError = caught instanceof ClientApiError
        ? caught
        : new ClientApiError("UNEXPECTED_ERROR", "The result could not be loaded.", [], "client", 0);
      setResult(null);
      setResultError(apiError);
      if (apiError.code === "SESSION_REQUIRED") router.replace(hasSeenSession() ? "/?lost=1" : "/");
    } finally {
      setResultLoading(false);
    }
  }, [assessmentId, router]);

  useEffect(() => {
    void loadResult();
  }, [loadResult]);

  async function startNew() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError("");
    try {
      const assessment = await apiRequest<AssessmentView & { created: boolean }>("/api/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
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
  if (resultLoading && !result) return <PageShell narrow><LoadingCard label="Loading your protected result…" /></PageShell>;
  if (!result) return <PageShell narrow><SessionFailure message={resultError?.message ?? "The result could not be loaded."} retry={() => void loadResult()} /></PageShell>;

  const full = result.accessLevel === "FULL";
  return (
    <PageShell>
      <section className="result-hero">
        <p className="eyebrow">Assessment complete · {full ? "Full report" : "Free summary"}</p>
        <h1>{full ? "Your full health report is ready." : "Your free health summary is ready."}</h1>
        <div className="bmi-highlight" aria-label={`BMI ${result.bmi}, ${categoryLabel(result.bmiCategory)}`}>
          <span>Estimated BMI</span><strong>{result.bmi}</strong><em>{categoryLabel(result.bmiCategory)}</em>
        </div>
        <p className="lede">{result.summary}</p>
        <p className="disclaimer">{result.disclaimer}</p>
        {startError ? <p className="error-banner" role="alert">{startError}</p> : null}
        {unlockNote ? <p className="notice-banner" role="status">{unlockNote}</p> : null}
        <div className="result-actions">
          {!full ? <button className="primary-button" type="button" onClick={() => setUnlockNote("Demo payment is the next step. Your free result remains available.")}>Demo Unlock full report</button> : null}
          <button className="secondary-button" type="button" disabled={starting} onClick={() => void startNew()}>{starting ? "Starting…" : startError ? "Retry new assessment" : "Start a new assessment"}</button>
        </div>
      </section>
      {full ? <FullReport result={result} /> : (
        <section className="locked-grid" aria-label="Locked report sections">
          {result.unlockableSections.map((section) => <article key={section}><span>Locked</span><h2>{section}</h2></article>)}
        </section>
      )}
    </PageShell>
  );
}
