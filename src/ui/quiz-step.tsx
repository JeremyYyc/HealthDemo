"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation.js";
import LinkModule from "next/link.js";
import { apiRequest, ClientApiError, STEP_NAMES, stepPath, type SessionView, type StepName, type StepSlug } from "./session.js";

const Link = LinkModule.default;

type SaveResult = {
  nextStep: StepName | "COMPLETE";
  version: number;
  invalidatedSteps: StepName[];
  replayed: boolean;
};

const COPY: Record<StepSlug, { title: string; help: string }> = {
  "age-range": { title: "What is your age range?", help: "Choose the range that contains your current age." },
  sex: { title: "What is your sex for this calculation?", help: "Used only for this demonstration’s metabolic estimate." },
  goal: { title: "What is your main goal?", help: "This shapes your target direction and estimated timeline." },
  age: { title: "How old are you?", help: "Enter a whole-number age between 18 and 100." },
  height: { title: "What is your height?", help: "Use metric or imperial — we securely save centimetres." },
  "current-weight": { title: "What is your current weight?", help: "Use kilograms or pounds. You can switch without losing the value." },
  "target-weight": { title: "What is your target weight?", help: "We’ll check that it fits your goal and a general reference range." },
  activity: { title: "How active are you?", help: "Choose the description closest to a typical week." },
};

const OPTIONS: Partial<Record<StepSlug, readonly [string, string][]>> = {
  "age-range": [["18_29", "18–29"], ["30_39", "30–39"], ["40_49", "40–49"], ["50_100", "50+"]],
  sex: [["FEMALE", "Female"], ["MALE", "Male"]],
  goal: [["LOSE_WEIGHT", "Lose weight"], ["MAINTAIN_WEIGHT", "Maintain weight"], ["GAIN_WEIGHT", "Gain weight"]],
  activity: [
    ["SEDENTARY", "Little or no exercise"], ["LIGHT", "Exercise 1–3 days/week"],
    ["MODERATE", "Exercise 3–5 days/week"], ["ACTIVE", "Exercise 6–7 days/week"],
    ["VERY_ACTIVE", "Very intense exercise or physical job"],
  ],
};

const FIELD_BY_STEP: Record<StepSlug, string> = {
  "age-range": "ageRange", sex: "sex", goal: "goal", age: "age", height: "heightCm",
  "current-weight": "weightKg", "target-weight": "targetWeightKg", activity: "activityLevel",
};

function roundOne(value: number) { return Math.round(value * 10) / 10; }
function metricFromDisplay(step: StepSlug, value: string, unit: "metric" | "imperial", inches: string): number {
  if (step === "height" && unit === "imperial") return roundOne((Number(value) * 12 + Number(inches)) * 2.54);
  if ((step === "current-weight" || step === "target-weight") && unit === "imperial") return roundOne(Number(value) * 0.45359237);
  return Number(value);
}

export function QuizStep({ session, step, stepName, refresh }: {
  session: SessionView; step: StepSlug; stepName: StepName; refresh: (showLoading?: boolean) => Promise<SessionView | null>;
}) {
  const router = useRouter();
  const answer = session.assessment.answers[FIELD_BY_STEP[step]];
  const [value, setValue] = useState(answer === undefined ? "" : String(answer));
  const [inches, setInches] = useState("0");
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [normalizedMetric, setNormalizedMetric] = useState<number | null>(
    typeof answer === "number" && (step === "height" || step === "current-weight" || step === "target-weight")
      ? answer
      : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [retryable, setRetryable] = useState(false);
  const position = STEP_NAMES.indexOf(stepName);
  const copy = COPY[step];
  const options = OPTIONS[step];
  const numeric = !options;
  const field = FIELD_BY_STEP[step];

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => setRetryAfter((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const displayUnit = useMemo(() => {
    if (step === "height") return unit === "metric" ? "cm" : "ft / in";
    if (step === "current-weight" || step === "target-weight") return unit === "metric" ? "kg" : "lb";
    return "";
  }, [step, unit]);

  function switchUnit(next: "metric" | "imperial") {
    if (next === unit) return;
    const number = Number(value);
    if (Number.isFinite(number) && value !== "") {
      if (step === "height") {
        if (next === "imperial") {
          setNormalizedMetric(number);
          const totalInches = number / 2.54;
          const feet = Math.floor(totalInches / 12);
          setValue(String(feet));
          setInches(String(roundOne(totalInches - feet * 12)));
        } else {
          setValue(String(normalizedMetric ?? roundOne((number * 12 + Number(inches || 0)) * 2.54)));
          setInches("0");
        }
      } else if (step === "current-weight" || step === "target-weight") {
        if (next === "imperial") {
          setNormalizedMetric(number);
          setValue(String(roundOne(number / 0.45359237)));
        } else {
          setValue(String(normalizedMetric ?? roundOne(number * 0.45359237)));
        }
      }
    }
    setUnit(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice(""); setRetryable(false);
    const measurement = step === "height" || step === "current-weight" || step === "target-weight";
    const submittedValue = numeric
      ? measurement && normalizedMetric !== null
        ? normalizedMetric
        : metricFromDisplay(step, value, unit, inches)
      : value;
    const body = { [field]: step === "age" ? Number(submittedValue) : submittedValue, version: session.assessment.version };
    try {
      const result = await apiRequest<SaveResult>(`/api/assessments/${session.assessment.id}/steps/${step}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      router.push(stepPath(result.nextStep));
    } catch (caught) {
      const apiError = caught instanceof ClientApiError ? caught : null;
      if (apiError?.code === "VERSION_CONFLICT") {
        const latest = await refresh(false);
        if (latest) {
          const latestValue = latest.assessment.answers[field];
          setNotice("This answer changed in another tab. Review the latest value before saving again.");
          if (latestValue !== undefined) {
            setValue(String(latestValue)); setUnit("metric"); setInches("0");
            if (typeof latestValue === "number" && (step === "height" || step === "current-weight" || step === "target-weight")) {
              setNormalizedMetric(latestValue);
            }
          }
        }
      } else if (apiError?.code === "SESSION_REQUIRED") {
        router.replace("/?lost=1");
      } else if (apiError?.code === "RESOURCE_NOT_FOUND") {
        router.replace("/");
      } else if (apiError?.code === "STEP_PREREQUISITE_MISSING") {
        const latest = await refresh(false);
        if (latest) router.push(stepPath(latest.assessment.nextStep));
      } else if (apiError?.code === "RATE_LIMITED") {
        const seconds = Number.isFinite(apiError.retryAfterSeconds) ? Math.max(1, apiError.retryAfterSeconds ?? 1) : 1;
        setRetryAfter(seconds);
        setError(`Too many requests. You can retry in ${seconds} seconds.`);
      } else {
        setRetryable(apiError === null || apiError.status === 0 || apiError.status >= 500);
        setError(apiError?.details[0]?.reason ?? apiError?.message ?? "Your answer could not be saved. Please retry.");
      }
    } finally { setSaving(false); }
  }

  const previous = position > 0 ? stepPath(STEP_NAMES[position - 1]!) : "/";
  return (
    <div className="quiz-wrap">
      <div className="progress-copy"><span>Step {position + 1} of 8</span><span>{Math.round(((position + 1) / 8) * 100)}%</span></div>
      <div className="progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={8} aria-valuenow={position + 1} aria-label="Assessment progress"><span style={{ width: `${((position + 1) / 8) * 100}%` }} /></div>
      <form className="card quiz-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">Your assessment</p><h1>{copy.title}</h1><p className="question-help">{copy.help}</p>
        {options ? (
          <fieldset className="choice-list"><legend className="sr-only">{copy.title}</legend>{options.map(([key, label]) => (
            <label className="choice" key={key}><input type="radio" name={field} value={key} checked={value === key} onChange={() => setValue(key)} required /><span>{label}</span></label>
          ))}</fieldset>
        ) : (
          <div className="input-block">
            {(step === "height" || step === "current-weight" || step === "target-weight") ? <div className="unit-toggle" aria-label="Unit system"><button type="button" aria-pressed={unit === "metric"} onClick={() => switchUnit("metric")}>Metric</button><button type="button" aria-pressed={unit === "imperial"} onClick={() => switchUnit("imperial")}>Imperial</button></div> : null}
            <label htmlFor="primary-value">{step === "age" ? "Age in years" : step === "height" && unit === "imperial" ? "Feet" : `${copy.title.replace("What is your ", "").replace("?", "")} (${displayUnit})`}</label>
            <div className="measurement-row"><input id="primary-value" inputMode="decimal" type="number" step={step === "age" ? "1" : "0.1"} required value={value} onChange={(event) => {
              const nextValue = event.target.value;
              setValue(nextValue);
              if (step === "height" || step === "current-weight" || step === "target-weight") {
                setNormalizedMetric(nextValue === "" ? null : metricFromDisplay(step, nextValue, unit, inches));
              }
            }} aria-describedby="field-help field-error" />{step === "height" && unit === "imperial" ? <><span>ft</span><label className="sr-only" htmlFor="inches">Inches</label><input id="inches" inputMode="decimal" type="number" min="0" max="11.9" step="0.1" required value={inches} onChange={(event) => {
              const nextInches = event.target.value;
              setInches(nextInches);
              setNormalizedMetric(value === "" || nextInches === "" ? null : metricFromDisplay(step, value, unit, nextInches));
            }} /><span>in</span></> : <span>{displayUnit}</span>}</div>
            <p id="field-help" className="field-help">Values are normalized to one decimal place before saving.</p>
          </div>
        )}
        {error ? <p id="field-error" className="error-banner" role="alert">{error}</p> : null}
        {notice ? <p className="notice-banner" role="status">{notice}</p> : null}
        <div className="form-actions"><Link className="back-link" href={previous}>← Back</Link><button className="primary-button" type="submit" disabled={saving || retryAfter > 0 || value === ""}>{saving ? "Saving…" : retryAfter > 0 ? `Retry in ${retryAfter}s` : retryable ? "Retry" : position === 7 ? "Generate my summary" : "Continue"}</button></div>
      </form>
    </div>
  );
}
