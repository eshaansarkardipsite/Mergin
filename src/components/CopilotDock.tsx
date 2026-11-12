import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatMoney } from '../lib/format';
import { useCopilotChat } from '../context/CopilotChatContext';
import { InlineAlert } from '../context/AppContext';
import { Icon, Spinner } from './ui';

export function CopilotDock() {
  const { messages, asking, error, ask } = useCopilotChat();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, asking, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Visiting the full page takes over the conversation; collapse the dock behind it.
  useEffect(() => {
    if (location.pathname === '/app/copilot') setOpen(false);
  }, [location.pathname]);

  // The full page is the expanded version of this chat; don't duplicate it there.
  if (location.pathname === '/app/copilot') return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = question.trim();
    if (prompt.length < 3) return;
    setQuestion('');
    void ask(prompt);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-ink-solid text-on-primary shadow-xl transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-solid"
        aria-label={messages.length > 0 ? 'Open Copilot chat, conversation in progress' : 'Open Copilot chat'}
        title="Ask Copilot"
      >
        <Icon name="forum" className="text-[24px]" />
        {messages.length > 0 ? (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-surface-raised ring-2 ring-ink-solid" />
        ) : null}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Copilot chat"
      className="fade-in fixed bottom-4 right-4 z-[70] flex h-[min(540px,calc(100vh-6rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stroke-line bg-surface-raised shadow-2xl"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-stroke-line px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-solid text-on-primary">
          <Icon name="forum" className="text-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-label-md font-semibold text-ink-solid">Copilot</span>
          <span className="block text-caption-micro text-ink-muted">Grounded in the local ledger</span>
        </span>
        <Link
          to="/app/copilot"
          className="icon-btn h-8 w-8"
          aria-label="Open the full Copilot page"
          title="Open full page"
          onClick={() => setOpen(false)}
        >
          <Icon name="open_in_full" className="text-[17px]" />
        </Link>
        <button
          type="button"
          className="icon-btn h-8 w-8"
          aria-label="Minimize Copilot chat"
          title="Minimize"
          onClick={() => setOpen(false)}
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </header>

      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container">
              <Icon name="forum" className="text-[20px]" />
            </div>
            <p className="mt-3 text-label-md font-medium text-ink-solid">Ask about the ledger</p>
            <p className="mt-1 text-caption-micro leading-relaxed text-ink-slate">
              Try an overdue invoice, spending, budget, or cash-flow question. Answers are calculated before any model explains
              them.
            </p>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-ink-solid px-3 py-2 text-label-md text-on-primary">
                {message.text}
              </div>
            </div>
          ) : message.answer ? (
            <div key={message.id} className="rounded-xl border border-stroke-line bg-surface-canvas p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-label-md font-semibold leading-snug text-ink-solid">{message.answer.directAnswer}</p>
                {message.answer.amountMinor != null ? (
                  <span className="shrink-0 rounded bg-ink-solid px-2 py-0.5 text-caption-micro tabular-nums text-on-primary">
                    {formatMoney(message.answer.amountMinor)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-caption-micro leading-relaxed text-ink-slate">{message.answer.explanation}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-caption-micro text-ink-muted">
                <span>{message.answer.period}</span>
                {message.answer.evidence.length > 0 ? (
                  <Link to="/app/copilot" className="underline-offset-2 hover:text-ink-solid hover:underline">
                    View evidence
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null,
        )}

        {asking ? (
          <div className="flex items-center gap-2 text-caption-micro text-ink-slate">
            <Spinner className="h-3.5 w-3.5" />
            Calculating from ledger records…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="shrink-0 px-3 pb-2">
          <InlineAlert tone="error">{error}</InlineAlert>
        </div>
      ) : null}

      <form onSubmit={submit} className="shrink-0 border-t border-stroke-line bg-surface-raised p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="input h-10 min-w-0 flex-1"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about cash, budgets, or spend"
            aria-label="Ask Copilot a question"
            maxLength={500}
            disabled={asking}
          />
          <button
            type="submit"
            className="btn btn-primary h-10 shrink-0 px-3"
            disabled={asking || question.trim().length < 3}
            aria-label="Send question"
          >
            {asking ? <Spinner className="h-4 w-4" /> : <Icon name="arrow_upward" className="text-[17px]" />}
          </button>
        </div>
        <p className="mt-1.5 text-caption-micro text-ink-muted">Calculated facts only; the model cannot move money or change records.</p>
      </form>
    </section>
  );
}
