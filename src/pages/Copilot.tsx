import { useEffect, useRef, useState } from 'react';
import type { CopilotAnswer } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import { formatMoney } from '../lib/format';
import { Icon, PageHeader, Spinner } from '../components/ui';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text?: string;
  answer?: CopilotAnswer;
}

let nextId = 1;

export default function Copilot() {
  const { toast } = useApp();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [liveModel, setLiveModel] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ suggestions: string[]; liveModel: boolean }>('/copilot/suggestions')
      .then((data) => {
        setSuggestions(data.suggestions);
        setLiveModel(data.liveModel);
      })
      .catch(() => {
        // Suggestions are optional; the input still works.
      });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, asking]);

  const ask = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3 || asking) return;
    setError(null);
    setQuestion('');
    setMessages((current) => [...current, { id: (nextId += 1), role: 'user', text: trimmed }]);
    setAsking(true);
    try {
      const data = await api.post<{ answer: CopilotAnswer; question: string }>('/copilot/ask', { question: trimmed });
      setMessages((current) => [...current, { id: (nextId += 1), role: 'assistant', answer: data.answer }]);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, 'error');
    } finally {
      setAsking(false);
    }
  };

  const latest = [...messages].reverse().find((message) => message.answer)?.answer;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Grounded financial reasoning
          </>
        }
        title="Copilot"
        description="Answers are calculated by deterministic TypeScript against the local ledger. When Gemini is configured, it only explains those calculated facts."
        actions={
          <span className={`chip-outline ${liveModel ? 'border-ink-solid' : ''}`}>
            <Icon name={liveModel ? 'auto_awesome' : 'terminal'} className="text-[13px]" />
            {liveModel ? 'Gemini explanation mode' : 'Deterministic mode'}
          </span>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <section className="card flex min-h-[560px] flex-col overflow-hidden lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke-line px-5 py-3">
            <div className="flex items-center gap-2">
              <Icon name="forum" className="text-[18px] text-ink-solid" />
              <span className="text-label-md font-medium text-ink-solid">Workspace questions</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-caption-micro text-ink-slate">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
              Local demo ledger
            </span>
          </div>

          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container">
                  <Icon name="forum" className="text-[24px]" />
                </div>
                <h2 className="mt-4 text-headline-sm text-ink-solid">Ask about the ledger</h2>
                <p className="mt-1 max-w-sm text-body-md leading-relaxed text-ink-slate">
                  Try an overdue invoice question or a spending question. Every answer comes with its calculated amount and the
                  records used.
                </p>
              </div>
            ) : null}

            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="flex flex-col items-end gap-1">
                  <span className="text-caption-micro text-ink-muted">You</span>
                  <div className="max-w-[92%] rounded-xl rounded-tr-sm bg-ink-solid px-4 py-3 text-body-md text-on-primary">
                    {message.text}
                  </div>
                </div>
              ) : message.answer ? (
                <div key={message.id} className="flex flex-col items-start gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-ink-solid text-on-primary">
                      <Icon name="terminal" className="text-[13px]" />
                    </span>
                    <span className="text-label-sm font-medium text-ink-solid">MERGIN Copilot</span>
                    <span className="text-caption-micro text-ink-muted">
                      {message.answer.source === 'gemini' ? `Gemini · ${message.answer.model ?? 'explanation only'}` : 'Deterministic · TypeScript'}
                    </span>
                  </div>
                  <div className="w-full rounded-xl rounded-tl-sm border border-stroke-line bg-surface-canvas p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-body-md font-semibold leading-relaxed text-ink-solid">{message.answer.directAnswer}</p>
                      {message.answer.amountMinor != null ? (
                        <span className="shrink-0 rounded-lg bg-ink-solid px-2.5 py-1 text-label-md tabular-nums text-on-primary">
                          {formatMoney(message.answer.amountMinor)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-body-md leading-relaxed text-ink-graphite">{message.answer.explanation}</p>
                    {message.answer.evidence.length > 0 ? (
                      <div className="mt-3 border-t border-stroke-line pt-3">
                        <p className="text-caption-micro uppercase tracking-wider text-ink-muted">Evidence</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {message.answer.evidence.map((item) => (
                            <li key={`${item.label}-${item.href}`}>
                              <a
                                href={item.href}
                                className="flex items-start justify-between gap-3 rounded-lg p-1.5 text-label-sm transition-colors hover:bg-surface-hover"
                              >
                                <span className="min-w-0">
                                  <span className="block text-ink-graphite">{item.label}</span>
                                  <span className="block text-caption-micro text-ink-muted">{item.detail}</span>
                                </span>
                                {item.amountMinor != null ? (
                                  <span className="shrink-0 tabular-nums text-ink-solid">{formatMoney(item.amountMinor)}</span>
                                ) : (
                                  <Icon name="chevron_right" className="mt-0.5 shrink-0 text-[15px] text-ink-muted" />
                                )}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="mt-3 rounded-lg bg-surface-raised p-2.5 text-caption-micro leading-relaxed text-ink-slate">
                      <span className="font-medium text-ink-solid">Next step: </span>
                      {message.answer.nextStep}
                    </p>
                    <p className="mt-2 text-caption-micro text-ink-muted">Calculated for {message.answer.period}</p>
                  </div>
                </div>
              ) : null,
            )}

            {asking ? (
              <div className="flex items-center gap-2.5 text-label-sm text-ink-slate">
                <Spinner className="h-4 w-4" />
                Calculating from ledger records…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {error ? (
            <div className="border-t border-stroke-line px-5 py-3">
              <InlineAlert tone="error">{error}</InlineAlert>
            </div>
          ) : null}

          <div className="border-t border-stroke-line bg-surface-raised p-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask(question);
              }}
              className="flex flex-col gap-2"
            >
              <div className="relative flex items-center">
                <Icon name="help" className="pointer-events-none absolute left-3 text-[18px] text-ink-muted" />
                <input
                  className="input h-12 pl-10 pr-28"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about cash flow, receivables, budgets, or spend"
                  aria-label="Ask Copilot a question"
                  maxLength={500}
                  disabled={asking}
                />
                <button
                  type="submit"
                  className="btn btn-primary absolute right-1.5 h-9 px-3"
                  disabled={asking || question.trim().length < 3}
                >
                  {asking ? <Spinner className="h-4 w-4" /> : <Icon name="auto_awesome" className="text-[15px]" />}
                  Ask
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-caption-micro text-ink-muted">
                <span>{liveModel ? 'Gemini explains calculated facts; it never invents amounts.' : 'No model key configured. Answers are generated locally.'}</span>
                <span className="hidden font-mono sm:inline">Enter ↵</span>
              </div>
            </form>
          </div>
        </section>

        <aside className="flex flex-col gap-5 lg:col-span-5">
          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="text-headline-sm text-ink-solid">Suggested questions</h2>
              <Icon name="lightbulb" className="text-[19px] text-ink-muted" />
            </div>
            {suggestions.length === 0 ? (
              <p className="mt-4 text-body-md text-ink-muted">Suggestions could not load. Type a question below the conversation.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-lg border border-stroke-line bg-surface-raised px-3 py-1.5 text-left text-caption-micro text-ink-graphite transition-colors hover:border-ink-solid hover:text-ink-solid"
                    onClick={() => void ask(suggestion)}
                    disabled={asking}
                  >
                    <span className="mr-1 font-mono text-ink-muted">Q{index + 1}</span>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="text-headline-sm text-ink-solid">Grounding &amp; assumptions</h2>
              <span className="chip-outline">{latest?.source === 'gemini' ? 'Gemini' : 'Deterministic'}</span>
            </div>
            {latest ? (
              <div className="mt-4 space-y-3">
                {latest.assumptions.length > 0 ? (
                  <ul className="space-y-2">
                    {latest.assumptions.map((assumption) => (
                      <li key={assumption} className="flex gap-2 text-body-md text-ink-graphite">
                        <Icon name="check" className="mt-0.5 text-[16px] text-ink-solid" />
                        <span>{assumption}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-md text-ink-muted">No additional assumptions were returned for this answer.</p>
                )}
                <div className="rounded-xl bg-surface-canvas p-3 text-caption-micro leading-relaxed text-ink-slate">
                  <p className="font-medium text-ink-solid">How this answer was built</p>
                  <p className="mt-1">
                    {latest.source === 'gemini'
                      ? 'The server calculated the figures first, then sent only those facts and the question to Gemini for explanation. The amounts are not model-generated.'
                      : 'The server matched the question to a deterministic calculation over local invoices, transactions, budgets, and Sentinel patterns. No language model was called.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-body-md text-ink-slate">
                <p>Ask a question to see the exact facts and assumptions used.</p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <Icon name="database" className="mt-0.5 text-[16px] text-ink-solid" />
                    <span>Source: local SQLite demo ledger.</span>
                  </li>
                  <li className="flex gap-2">
                    <Icon name="calculate" className="mt-0.5 text-[16px] text-ink-solid" />
                    <span>All money math uses integer USD cents.</span>
                  </li>
                  <li className="flex gap-2">
                    <Icon name="visibility_off" className="mt-0.5 text-[16px] text-ink-solid" />
                    <span>No usage or non-usage claims about subscriptions.</span>
                  </li>
                </ul>
              </div>
            )}
          </section>

          <section className="card p-4">
            <div className="flex items-start gap-2.5 text-caption-micro leading-relaxed text-ink-slate">
              <Icon name="info" className="mt-px text-[16px] text-ink-solid" />
              <span>
                Copilot is an explanation layer, not an accountant. It cannot move money, send invoices, or change records. Review
                the linked evidence before acting.
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
