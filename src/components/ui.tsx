import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

export function Logo({
  variant = 'full',
  className = '',
  height = 24,
}: {
  variant?: 'full' | 'mark' | 'white';
  className?: string;
  height?: number;
}) {
  const src =
    variant === 'mark' ? '/brand/mergin-mark.png' : variant === 'white' ? '/brand/mergin-logo-white.png' : '/brand/mergin-logo.png';
  return (
    <img
      src={src}
      alt="MERGIN"
      height={height}
      style={{ height, width: 'auto' }}
      className={`select-none object-contain ${className}`}
      draggable={false}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${compact ? '' : 'pb-1'}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-caption-micro uppercase tracking-wider text-ink-slate">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-headline-lg-mobile tracking-tight text-ink-solid md:text-headline-lg">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-body-md leading-relaxed text-ink-slate">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function DotLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption-micro uppercase tracking-wider text-ink-slate">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  aside,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: string;
  aside?: ReactNode;
  tone?: 'default' | 'emphasis';
}) {
  return (
    <div
      className={`card flex flex-col justify-between p-5 transition-shadow hover:shadow-sm ${
        tone === 'emphasis' ? 'border-ink-solid/20' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-label-sm uppercase tracking-wider text-ink-slate">{label}</span>
          {aside ? <div className="mt-1">{aside}</div> : null}
        </div>
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-ink-solid">
            <Icon name={icon} className="text-[20px]" />
          </div>
        ) : null}
      </div>
      <div className="mt-4">
        <div className="text-[28px] font-semibold leading-9 tracking-tight tabular-nums text-ink-solid">{value}</div>
        {hint ? <div className="mt-1.5 text-caption-micro text-ink-muted">{hint}</div> : null}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, { className: string; icon?: string }> = {
  paid: { className: 'bg-ink-solid text-on-primary', icon: 'check' },
  overdue: { className: 'bg-ink-solid text-on-primary', icon: 'priority_high' },
  open: { className: 'bg-ink-solid text-on-primary', icon: 'circle' },
  attention: { className: 'bg-ink-solid text-on-primary', icon: 'priority_high' },
  sent: { className: 'border border-stroke-line bg-surface-container-low text-ink-graphite' },
  partial: { className: 'border border-ink-solid/40 bg-surface-container-low text-ink-solid' },
  pending: { className: 'border border-stroke-line bg-surface-container-low text-ink-graphite', icon: 'schedule' },
  draft: { className: 'bg-surface-container text-ink-slate' },
  cancelled: { className: 'border border-dashed border-stroke-line text-ink-muted' },
  refunded: { className: 'border border-dashed border-stroke-line text-ink-muted', icon: 'undo' },
  dismissed: { className: 'border border-dashed border-stroke-line text-ink-muted' },
  kept: { className: 'border border-stroke-line bg-surface-container-low text-ink-graphite', icon: 'check' },
  remind: { className: 'border border-stroke-line bg-surface-container-low text-ink-graphite', icon: 'notifications' },
  'follow-up': { className: 'border border-stroke-line bg-surface-container-low text-ink-graphite', icon: 'schedule' },
  info: { className: 'border border-stroke-line text-ink-slate' },
  settled: { className: 'bg-surface-container text-ink-graphite' },
  failed: { className: 'bg-ink-solid text-on-primary' },
  under: { className: 'bg-surface-container text-ink-graphite' },
  near: { className: 'bg-ink-solid text-on-primary' },
  over: { className: 'bg-ink-solid text-on-primary', icon: 'priority_high' },
  processed: { className: 'bg-surface-container text-ink-graphite' },
  ignored: { className: 'border border-stroke-line text-ink-slate' },
  live: { className: 'bg-ink-solid text-on-primary' },
  deterministic: { className: 'border border-stroke-line text-ink-graphite' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] ?? { className: 'border border-stroke-line text-ink-slate' };
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-caption-micro font-medium uppercase tracking-wider ${style.className}`}
    >
      {style.icon ? <Icon name={style.icon} className="text-[12px]" /> : null}
      {label ?? status.replaceAll('-', ' ')}
    </span>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container text-ink-slate">
        <Icon name={icon} className="text-[24px]" />
      </div>
      <h3 className="mt-4 text-headline-sm text-ink-solid">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-body-md text-ink-slate">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="card p-6" role="status" aria-label={label}>
      <div className="skeleton h-5 w-40" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container">
        <Icon name="error" className="text-[24px]" />
      </div>
      <h3 className="mt-4 text-headline-sm">Could not load this view</h3>
      <p className="mt-1 max-w-sm text-body-md text-ink-slate">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary mt-5" onClick={onRetry}>
          <Icon name="refresh" className="text-[18px]" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  padded = true,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="flex flex-col gap-2 border-b border-stroke-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-headline-sm text-ink-solid">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-caption-micro text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center px-0 sm:items-center sm:px-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink-solid/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fade-in relative flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-2xl border border-stroke-line bg-surface-raised shadow-xl sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stroke-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-headline-sm text-ink-solid">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-caption-micro text-ink-muted">{description}</p> : null}
          </div>
          <button type="button" className="icon-btn -mr-1.5 shrink-0" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-stroke-line px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-surface-container p-1 scroll-thin">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-label-md transition-all ${
            value === option.value
              ? 'bg-surface-raised text-ink-solid shadow-xs'
              : 'text-ink-slate hover:text-ink-solid'
          }`}
          aria-pressed={value === option.value}
        >
          {option.label}
          {typeof option.count === 'number' ? (
            <span className="ml-1.5 text-caption-micro text-ink-muted">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  tone = 'solid',
}: {
  value: number;
  label?: string;
  tone?: 'solid' | 'soft';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-container"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${
          tone === 'soft' ? 'bg-ink-slate' : 'bg-ink-solid'
        }`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="input pl-9"
      />
    </div>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Icon name={copied ? 'check' : 'content_copy'} className="text-[15px]" />
      {copied ? 'Copied' : label}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabledReason,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
        checked ? 'border-ink-solid bg-ink-solid' : 'border-stroke-line bg-surface-container'
      } ${disabledReason ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-surface-raised shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const href = location.pathname === to ? '#' : to;
  return (
    <a href={href} className="inline-flex items-center gap-1 text-label-md text-ink-slate transition-colors hover:text-ink-solid">
      <Icon name="arrow_back" className="text-[16px]" />
      {label}
    </a>
  );
}
