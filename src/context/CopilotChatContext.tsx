import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CopilotAnswer } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from './AppContext';

interface CopilotMessage {
  id: number;
  role: 'user' | 'assistant';
  text?: string;
  answer?: CopilotAnswer;
}

interface CopilotChatValue {
  messages: CopilotMessage[];
  asking: boolean;
  error: string | null;
  ask: (prompt: string) => Promise<void>;
}

const CopilotChatContext = createContext<CopilotChatValue | null>(null);

let nextId = 1;

export function useCopilotChat(): CopilotChatValue {
  const value = useContext(CopilotChatContext);
  if (!value) throw new Error('useCopilotChat must be used inside CopilotChatProvider');
  return value;
}

export function CopilotChatProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askingRef = useRef(false);

  // A chat belongs to the signed-in workspace; never carry it into another session.
  useEffect(() => {
    askingRef.current = false;
    setMessages([]);
    setAsking(false);
    setError(null);
  }, [user?.id]);

  const ask = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3 || askingRef.current) return;

    askingRef.current = true;
    setAsking(true);
    setError(null);
    setMessages((current) => [...current, { id: (nextId += 1), role: 'user', text: trimmed }]);

    try {
      const data = await api.post<{ answer: CopilotAnswer; question: string }>('/copilot/ask', { question: trimmed });
      setMessages((current) => [...current, { id: (nextId += 1), role: 'assistant', answer: data.answer }]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      askingRef.current = false;
      setAsking(false);
    }
  }, []);

  const value = useMemo<CopilotChatValue>(() => ({ messages, asking, error, ask }), [messages, asking, error, ask]);

  return <CopilotChatContext.Provider value={value}>{children}</CopilotChatContext.Provider>;
}
