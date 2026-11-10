import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { Icon } from '../components/ui';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface AppContextValue {
  user: SessionUser | null;
  loading: boolean;
  demoMode: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  demoLogin: () => Promise<SessionUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);
  const toastId = useRef(0);

  const refreshSession = useCallback(async () => {
    try {
      const data = await api.get<{ user: SessionUser }>('/auth/session');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ user: SessionUser }>('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const demoLogin = useCallback(async () => {
    const data = await api.post<{ user: SessionUser }>('/auth/demo');
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = (toastId.current += 1);
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmState(options);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  const resolveConfirm = (value: boolean) => {
    confirmResolver.current?.(value);
    confirmResolver.current = null;
    setConfirmState(null);
  };

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      loading,
      demoMode: !user || user.demo,
      login,
      demoLogin,
      logout,
      refreshSession,
      toast,
      confirm,
    }),
    [user, loading, login, demoLogin, logout, refreshSession, toast, confirm],
  );

  return (
    <AppContext.Provider value={value}>
      {children}

      <div className="fixed bottom-5 right-5 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            className="toast-enter flex items-start gap-3 rounded-xl bg-ink-solid px-4 py-3 text-on-primary shadow-lg"
            role="status"
          >
            <span className="material-symbols-outlined mt-0.5 text-[18px]">
              {item.tone === 'success' ? 'check_circle' : item.tone === 'error' ? 'error' : 'info'}
            </span>
            <p className="flex-1 text-body-md">{item.message}</p>
            <button
              type="button"
              className="rounded p-0.5 text-on-primary/70 transition hover:text-on-primary"
              aria-label="Dismiss notification"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== item.id))}
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-ink-solid/40 backdrop-blur-[2px]"
            aria-label="Cancel"
            onClick={() => resolveConfirm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="fade-in relative w-full max-w-md rounded-2xl border border-stroke-line bg-surface-raised p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                <span className="material-symbols-outlined text-[20px]">
                  {confirmState.destructive ? 'warning' : 'help'}
                </span>
              </div>
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-headline-sm text-ink-solid">
                  {confirmState.title}
                </h2>
                <div className="mt-1.5 text-body-md text-ink-slate">{confirmState.message}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => resolveConfirm(false)}>
                {confirmState.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={`btn ${confirmState.destructive ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => resolveConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppContext.Provider>
  );
}

/** Shared async action helper: runs, toasts failures, never fakes success. */
export function useAsyncAction() {
  const { toast } = useApp();
  return useCallback(
    async <T,>(action: () => Promise<T>, fallback: string): Promise<T | null> => {
      try {
        return await action();
      } catch (error) {
        toast(errorMessage(error) || fallback, 'error');
        return null;
      }
    },
    [toast],
  );
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 ${
        tone === 'error' ? 'border-ink-solid bg-surface-container-low' : 'border-stroke-line bg-surface-container-low/60'
      }`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <span className="material-symbols-outlined mt-0.5 text-[18px] text-ink-solid">
        {tone === 'error' ? 'error' : tone === 'success' ? 'check_circle' : 'info'}
      </span>
      <div className="min-w-0 text-body-md text-ink-graphite">
        {title ? <p className="font-semibold text-ink-solid">{title}</p> : null}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}

export { Icon };
