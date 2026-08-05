import type { ReactNode } from "react";
import LinkModule from "next/link.js";

const Link = LinkModule.default;

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Health Compass home">
      <span className="brand-mark" aria-hidden="true">HC</span>
      <span>Health Compass</span>
    </Link>
  );
}

export function PageShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <main className="site-shell">
      <header className="site-header"><Brand /></header>
      <section className={narrow ? "content content-narrow" : "content"}>{children}</section>
    </main>
  );
}

export function LoadingCard({ label = "Restoring your assessment…" }: { label?: string }) {
  return (
    <div className="card loading-card" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function SessionFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="card centered" aria-labelledby="session-failure-title">
      <p className="eyebrow">Connection interrupted</p>
      <h1 id="session-failure-title">We couldn’t restore your assessment</h1>
      <p className="error-banner" role="alert">{message}</p>
      <button className="primary-button" type="button" onClick={retry}>Retry</button>
    </section>
  );
}
