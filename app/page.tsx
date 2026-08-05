"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation.js";
import { LoadingCard, PageShell } from "../src/ui/shell.js";
import {
  apiRequest,
  ClientApiError,
  guardPath,
  hasSeenSession,
  rememberSession,
  type SessionView,
} from "../src/ui/session.js";
import { useSession } from "../src/ui/use-session.js";

const AGE_RANGES = [
  ["18_29", "18–29"],
  ["30_39", "30–39"],
  ["40_49", "40–49"],
  ["50_100", "50+"],
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const { session, error, loading } = useSession();
  const [confirmedLoss, setConfirmedLoss] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!session) return;
    const destination = guardPath(session);
    if (destination) router.replace(destination);
  }, [router, session]);

  async function start(ageRange: (typeof AGE_RANGES)[number][0]) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const created = await apiRequest<SessionView>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ageRange }),
      });
      rememberSession();
      router.push(guardPath(created) ?? "/quiz/sex");
    } catch (caught) {
      setSubmitError(caught instanceof ClientApiError ? caught.message : "We could not start your assessment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || session) return <PageShell narrow><LoadingCard /></PageShell>;
  const lost = error?.code === "SESSION_REQUIRED" && hasSeenSession() && !confirmedLoss;

  return (
    <PageShell>
      <div className="welcome-grid">
        <section className="hero-copy">
          <p className="eyebrow">A clearer starting point</p>
          <h1>Understand your health direction, one answer at a time.</h1>
          <p className="lede">A private eight-step wellness estimate with practical, transparent calculations.</p>
          <div className="trust-row" aria-label="Product principles">
            <span>No account</span><span>Private session</span><span>About 2 minutes</span>
          </div>
        </section>
        <section className="card entry-card" aria-labelledby="entry-title">
          {lost ? (
            <>
              <p className="eyebrow">Session unavailable</p>
              <h2 id="entry-title">Your previous progress can’t be restored</h2>
              <p>The session may have expired or its private browser cookie was removed. You can safely begin again.</p>
              <button className="primary-button" type="button" onClick={() => setConfirmedLoss(true)}>Start a new assessment</button>
            </>
          ) : (
            <>
              <p className="eyebrow">Step 1 of 8</p>
              <h2 id="entry-title">What is your age range?</h2>
              <p>This helps us set the right calculation boundaries.</p>
              <div className="option-grid" role="group" aria-label="Age range">
                {AGE_RANGES.map(([value, label]) => (
                  <button className="option-button" disabled={submitting} key={value} onClick={() => void start(value)} type="button">
                    {label}
                  </button>
                ))}
              </div>
              {submitError ? <p className="error-banner" role="alert">{submitError} <button type="button" onClick={() => setSubmitError("")}>Dismiss</button></p> : null}
              <p className="fine-print">By continuing, you agree to this demo’s terms and privacy notice. This is not medical advice.</p>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
