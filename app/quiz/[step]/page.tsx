"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation.js";
import { LoadingCard, PageShell } from "../../../src/ui/shell.js";
import { guardPath, hasSeenSession, STEP_NAMES, STEP_SLUG_BY_NAME, type StepSlug } from "../../../src/ui/session.js";
import { useSession } from "../../../src/ui/use-session.js";
import { QuizStep } from "../../../src/ui/quiz-step.js";

export default function QuizPage() {
  const router = useRouter();
  const params = useParams<{ step: string }>();
  const { session, error, loading, refresh } = useSession();
  const slugs = Object.values(STEP_SLUG_BY_NAME);
  const step = slugs.includes(params.step as StepSlug) ? (params.step as StepSlug) : null;

  useEffect(() => {
    if (!step) {
      router.replace("/");
      return;
    }
    if (session) {
      const destination = guardPath(session, step);
      if (destination) router.replace(destination);
    }
  }, [router, session, step]);

  useEffect(() => {
    if (!loading && error?.code === "SESSION_REQUIRED") router.replace(hasSeenSession() ? "/?lost=1" : "/");
  }, [error, loading, router]);

  if (loading || !session || !step) return <PageShell narrow><LoadingCard /></PageShell>;
  const stepName = STEP_NAMES.find((name) => STEP_SLUG_BY_NAME[name] === step)!;
  return (
    <PageShell narrow>
      <QuizStep key={`${session.assessment.id}:${step}`} session={session} step={step} stepName={stepName} refresh={refresh} />
    </PageShell>
  );
}
