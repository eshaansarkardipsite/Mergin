import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Logo } from './ui';

const STEPS = ['Business profile', 'PayPal Sandbox', 'Dashboard'];

export function OnboardingShell({
  step,
  eyebrow,
  title,
  description,
  children,
  width = 'max-w-5xl',
}: {
  step: 1 | 2 | 3;
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-canvas">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-5 md:px-8">
        <Link to="/app" aria-label="MERGIN overview">
          <Logo height={22} />
        </Link>
        <Link to="/app" className="btn btn-sm btn-ghost">
          Skip setup
          <Icon name="arrow_forward" className="text-[15px]" />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-center px-4 py-6 md:px-8">
        <div className={`w-full ${width} py-2`}>
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-surface-container px-4 py-2 sm:gap-3">
              {STEPS.map((label, index) => {
                const number = index + 1;
                const active = number === step;
                const done = number < step;
                return (
                  <div key={label} className="flex items-center gap-2">
                    {index > 0 ? <div className="hidden h-px w-5 bg-outline-variant sm:block" /> : null}
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-caption-micro font-semibold ${
                        active || done ? 'bg-ink-solid text-on-primary' : 'bg-surface-raised text-ink-slate'
                      }`}
                    >
                      {done ? <Icon name="check" className="text-[12px]" /> : number}
                    </span>
                    <span
                      className={`text-label-sm ${
                        active ? 'font-semibold text-ink-solid' : done ? 'text-ink-slate' : 'text-ink-muted'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            {eyebrow ? (
              <span className="mb-1 text-caption-micro uppercase tracking-widest text-ink-slate">{eyebrow}</span>
            ) : null}
            <h1 className="text-headline-lg-mobile tracking-tight text-ink-solid md:text-headline-lg">{title}</h1>
            <p className="mt-1.5 max-w-xl text-body-md leading-relaxed text-ink-slate">{description}</p>
          </div>
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-5 text-caption-micro text-ink-slate sm:flex-row md:px-8">
        <span>© 2026 MERGIN. Demonstration build.</span>
        <span>Setup changes are saved to the local demo database.</span>
      </footer>
    </div>
  );
}

export function OnboardingStepperFooter({
  backTo,
  backLabel,
  next,
}: {
  backTo?: string;
  backLabel?: string;
  next: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-stroke-line pt-5 sm:flex-row sm:items-center">
      {backTo ? (
        <Link to={backTo} className="btn btn-ghost self-start">
          <Icon name="arrow_back" className="text-[17px]" />
          {backLabel ?? 'Back'}
        </Link>
      ) : (
        <span />
      )}
      {next}
    </div>
  );
}
