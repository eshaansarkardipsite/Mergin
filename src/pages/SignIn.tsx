import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp, InlineAlert } from '../context/AppContext';
import { api, errorMessage } from '../lib/api';
import { Icon, Logo, Modal, Spinner } from '../components/ui';
import { Sparkline } from '../components/charts';

type Dialog = 'terms' | 'privacy' | 'forgot' | null;

const DIALOG_COPY: Record<Exclude<Dialog, null>, { title: string; body: string[] }> = {
  terms: {
    title: 'Terms of service',
    body: [
      'This is a demonstration build of MERGIN. It is not a financial institution, payment processor, or accounting service.',
      'Use the seeded demo workspace to explore invoicing, forecasting, Sentinel signals, and the Copilot. Do not enter real customer data or real payment credentials.',
      'PayPal Sandbox mode can create sandbox invoices when server credentials are configured. No production money movement is performed by this build.',
    ],
  },
  privacy: {
    title: 'Privacy notice',
    body: [
      'Workspace data is stored locally in a SQLite file on the machine running this app. Account identity is handled by Supabase Auth. Google sign-in completes through Supabase; PayPal sign-in completes on PayPal. MERGIN stores your email, display name, and an identity link only.',
      'When Gemini is configured, the question text and deterministic fact summary are sent to the Gemini API by the server. Without a key, answers are generated locally. OpenRouter is used only as a fallback when the primary provider is rate limited.',
      'PayPal credentials, webhook IDs, and the session secret live in server environment variables and are never exposed to the browser.',
    ],
  },
  forgot: {
    title: 'Password recovery',
    body: [
      'Self-service password recovery is available when Supabase is configured. A reset link is sent to your email.',
      'Use “Launch demo workspace” for evaluation without credentials.',
    ],
  },
};

interface AuthProviders {
  supabase: boolean;
  password: boolean;
  google: boolean;
  paypal: boolean;
  demo: boolean;
}

export default function SignIn() {
  const { demoLogin, login, signup, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState<'form' | 'demo' | null>(null);
  const [error, setError] = useState<string | null>(() => new URLSearchParams(location.search).get('error'));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<AuthProviders>('/auth/providers')
      .then((data) => {
        if (active) setProviders(data);
      })
      .catch(() => {
        if (active) setProviders(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const startSso = (provider: 'google' | 'paypal') => {
    setError(null);
    window.location.assign(`/api/auth/${provider}/start`);
  };

  const startPasskeyRegister = async () => {
    setError(null);
    try {
      const options = await api.post<{
        challenge: string;
        rpId: string;
        rpName: string;
        userId: string;
        userName: string;
        userDisplay: string;
      }>('/auth/passkey/register/start', { email: email.trim() });

      if (!window.PublicKeyCredential) {
        setError('Passkeys are not supported in this browser.');
        return;
      }

      const credential = await (navigator.credentials as any).create({
        publicKey: {
          challenge: options.challenge,
          rp: { id: options.rpId, name: options.rpName },
          user: {
            id: options.userId,
            name: options.userName,
            displayName: options.userDisplay,
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            requireResidentKey: false,
            userVerification: 'preferred',
          },
          timeout: 60_000,
        },
      });

      await api.post('/auth/passkey/register/finish', {
        challenge: options.challenge,
        credential: {
          id: credential.id,
          rawId: credential.rawId,
          response: {
            attestationObject: btoa(
              String.fromCharCode(...new Uint8Array(credential.response.attestationObject)),
            ),
            clientDataJSON: btoa(
              String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON)),
            ),
          },
        },
      });

      toast('Passkey registered. You are signed in.', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const startPasskeyAuthenticate = async () => {
    setError(null);
    try {
      const options = await api.post<{
        challenge: string;
        rpId: string;
        allowCredentials: Array<{ id: string; type: 'public-key' }>;
      }>('/auth/passkey/authenticate/start', { email: email.trim() });

      if (!window.PublicKeyCredential) {
        setError('Passkeys are not supported in this browser.');
        return;
      }

      const assertion = await (navigator.credentials as any).get({
        publicKey: {
          challenge: options.challenge,
          rpId: options.rpId,
          allowCredentials: options.allowCredentials.map((c: { id: string; type: string }) => ({
            id: c.id,
            type: c.type,
          })),
          userVerification: 'preferred',
          timeout: 60_000,
        },
      });

      await api.post('/auth/passkey/authenticate/finish', {
        challenge: options.challenge,
        credential: {
          id: assertion.id,
          rawId: assertion.rawId,
          response: {
            authenticatorData: btoa(
              String.fromCharCode(...new Uint8Array(assertion.response.authenticatorData)),
            ),
            clientDataJSON: btoa(
              String.fromCharCode(...new Uint8Array(assertion.response.clientDataJSON)),
            ),
            signature: btoa(
              String.fromCharCode(...new Uint8Array(assertion.response.signature)),
            ),
          },
        },
      });

      toast('Signed in with passkey.', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting('form');
    try {
      await login(email.trim(), password);
      toast('Signed in.', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  };

  const launchDemo = async () => {
    setError(null);
    setSubmitting('demo');
    try {
      await demoLogin();
      toast('Demo workspace ready. All records are seeded local data.', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  };

  const signUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting('form');
    try {
      await signup(email.trim(), password);
      toast('Account created. You are signed in.', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface-canvas">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-5 md:px-8">
        <div className="flex items-center gap-3">
          <Logo height={24} />
          <span className="hidden text-caption-micro uppercase tracking-wider text-ink-muted sm:inline">
            Finance, without the noise.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip-outline hidden sm:inline-flex">Demo build</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setDialog('forgot')}
          >
            Need help?
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 items-center px-4 py-6 md:px-8">
        <div className="grid w-full grid-cols-1 items-center gap-12 py-4 lg:grid-cols-12">
          <div className="mx-auto w-full max-w-xl lg:col-span-6 lg:mx-0">
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
                <span className="text-caption-micro uppercase tracking-widest text-ink-slate">
                  Institutional workspace access
                </span>
              </div>
              <h1 className="text-headline-lg-mobile tracking-tight text-ink-solid md:text-headline-lg">
                Sign in to MERGIN
              </h1>
              <p className="mt-2 text-body-md text-ink-slate">
                Your business finances. One deterministic workspace.
              </p>
            </div>

            <div className="mb-6 rounded-xl border border-stroke-line bg-surface-raised p-4 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="bolt" className="text-[16px]" />
                    <span className="text-caption-micro font-semibold uppercase tracking-widest text-ink-solid">
                      Evaluator sandbox
                    </span>
                  </div>
                  <p className="mt-1.5 text-body-md font-semibold text-ink-solid">Explore the demo workspace</p>
                  <p className="mt-0.5 text-label-sm text-ink-slate">
                    Instant access to Northstar Creative's seeded local data. No credentials needed.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary shrink-0"
                  onClick={launchDemo}
                  disabled={submitting !== null}
                >
                  {submitting === 'demo' ? <Spinner className="h-4 w-4" /> : null}
                  {submitting === 'demo' ? 'Opening' : 'Launch demo'}
                  {submitting !== 'demo' ? <Icon name="arrow_forward" className="text-[16px]" /> : null}
                </button>
              </div>
            </div>

            {error ? (
              <div className="mb-5">
                <InlineAlert tone="error" title="Sign-in failed">
                  {error}
                </InlineAlert>
              </div>
            ) : null}

            <form onSubmit={signIn} className="flex flex-col gap-4" noValidate>
              <div>
                <label className="field-label" htmlFor="email">
                  Business email
                </label>
                <div className="relative">
                  <Icon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-ink-slate" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="input pl-10"
                    placeholder="demo@mergin.example"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={submitting !== null}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-label-md font-medium text-ink-solid" htmlFor="password">
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-label-sm text-ink-slate transition-colors hover:text-ink-solid"
                    onClick={() => setDialog('forgot')}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-ink-slate" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="input pl-10 pr-11"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting !== null}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-slate transition-colors hover:bg-surface-hover hover:text-ink-solid"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    <Icon name={showPassword ? 'visibility' : 'visibility_off'} className="text-[18px]" />
                  </button>
                </div>
              </div>

              {providers === null ? null : providers.password ? (
                <p className="text-caption-micro leading-4 text-ink-muted">
                  Use your MERGIN account email and password, or continue with a provider below.
                </p>
              ) : (
                <p className="text-caption-micro leading-4 text-ink-muted">
                  Seeded credentials: <span className="font-medium text-ink-slate">demo@mergin.example</span> · password{' '}
                  <span className="font-medium text-ink-slate">mergin-demo</span>
                </p>
              )}

              <button type="submit" className="btn btn-primary mt-1 h-12 text-headline-sm" disabled={submitting !== null}>
                {submitting === 'form' ? <Spinner className="h-4 w-4" /> : null}
                {submitting === 'form' ? 'Signing in' : 'Continue to workspace'}
                {submitting !== 'form' ? <Icon name="arrow_forward" className="text-[18px]" /> : null}
              </button>
              {providers?.password ? (
                <p className="mt-4 text-caption-micro text-ink-muted">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-ink-solid"
                    onClick={signUp}
                    disabled={submitting !== null}
                  >
                    Create account
                  </button>
                </p>
              ) : null}
            </form>

            <div className="relative my-6 flex items-center justify-center">
              <div className="h-px w-full bg-surface-container-high" />
              <span className="absolute bg-surface-canvas px-3 text-caption-micro uppercase tracking-widest text-ink-slate">
                Single sign-on
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={startPasskeyRegister}
                disabled={submitting !== null}
                title="Register a passkey (Windows Hello, Face ID, Touch ID, or security key)"
              >
                <Icon name="passkey" className="text-[18px]" />
                Passkey
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={startPasskeyAuthenticate}
                disabled={submitting !== null}
                title="Sign in with your registered passkey"
              >
                <Icon name="login" className="text-[18px]" />
                Sign in w/ Passkey
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => startSso('google')}
                disabled={!providers?.google || submitting !== null}
                title={providers?.google ? 'Continue with Google' : 'Google sign-in is not configured.'}
              >
                <Icon name="corporate_fare" className="text-[18px]" />
                Google
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => startSso('paypal')}
                disabled={!providers?.paypal || submitting !== null}
                title={providers?.paypal ? 'Continue with PayPal' : 'PayPal sign-in is not configured.'}
              >
                <Icon name="payments" className="text-[18px]" />
                PayPal
              </button>
            </div>
            <p className="mt-2 text-caption-micro text-ink-muted">
              {providers === null
                ? 'Checking configured sign-in methods…'
                : providers.google || providers.paypal
                  ? 'SSO completes on the provider page. MERGIN never sees your provider password.'
                  : 'Google and PayPal sign-in are disabled because no identity provider is configured.'}
            </p>

            <div className="mt-7 flex items-start gap-2 text-caption-micro text-ink-slate">
              <Icon name="verified_user" className="mt-px text-[15px]" />
              <p>
                Demo build. Data stays in local SQLite.{' '}
                <button type="button" className="underline underline-offset-2 hover:text-ink-solid" onClick={() => setDialog('terms')}>
                  Terms
                </button>{' '}
                and{' '}
                <button type="button" className="underline underline-offset-2 hover:text-ink-solid" onClick={() => setDialog('privacy')}>
                  privacy notice
                </button>
                .
              </p>
            </div>
          </div>

          <div className="hidden lg:col-span-6 lg:flex lg:justify-center">
            <div className="w-full max-w-lg rounded-2xl border border-stroke-line bg-surface-raised p-8 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-canvas text-headline-sm font-semibold">
                    N
                  </div>
                  <div>
                    <p className="text-body-md font-semibold leading-none text-ink-solid">Northstar Creative</p>
                    <p className="mt-1 text-caption-micro uppercase tracking-wider text-ink-slate">
                      Seeded demo workspace
                    </p>
                  </div>
                </div>
                <span className="chip-outline">Preview</span>
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-xl bg-surface-canvas p-5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-label-sm font-semibold uppercase tracking-wider text-ink-slate">Recorded balance</span>
                    <span className="text-caption-micro text-ink-slate">USD · demo ledger</span>
                  </div>
                  <div className="mt-1 text-[32px] font-semibold tracking-tight tabular-nums text-ink-solid">$18,420.50</div>
                </div>
                <div className="h-px w-full bg-surface-container-high" />
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-label-sm text-ink-slate">Outstanding invoices</span>
                    <p className="mt-0.5 text-body-md font-semibold tabular-nums text-ink-solid">$5,490.00</p>
                  </div>
                  <div className="text-right">
                    <span className="text-label-sm text-ink-slate">PayPal gateway</span>
                    <p className="mt-0.5 text-caption-micro text-ink-solid">Demo mode unless configured</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-container-low p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-solid text-on-primary">
                    <Icon name="notifications_active" className="text-[16px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-label-md text-ink-solid">Sentinel: CloudDesk Pro</p>
                    <p className="truncate text-caption-micro text-ink-slate">$49.00/mo · price up from $45.00</p>
                  </div>
                </div>
                <span className="chip shrink-0">Evidence</span>
              </div>

              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-caption-micro text-ink-slate">
                  <span>Liquidity trajectory · preview</span>
                  <span className="font-medium text-ink-solid">Seeded series</span>
                </div>
                <Sparkline values={[34, 40, 37, 50, 47, 58, 61, 72]} width={380} height={48} />
              </div>

              <p className="mt-6 text-label-sm leading-relaxed text-ink-slate">
                Deterministic reconciliation, Sentinel recurring-pattern evidence, and a grounded copilot for growing studios.
                Figures above are from the seeded demo, not a live feed.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-5 text-caption-micro text-ink-slate sm:flex-row md:px-8">
        <span>© 2026 MERGIN. Demonstration build.</span>
        <div className="flex items-center gap-5">
          <button type="button" className="transition-colors hover:text-ink-solid" onClick={() => setDialog('privacy')}>
            Privacy notice
          </button>
          <button type="button" className="transition-colors hover:text-ink-solid" onClick={() => setDialog('terms')}>
            Terms of service
          </button>
          <a href="https://developer.paypal.com/" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink-solid">
            PayPal developer
          </a>
        </div>
      </footer>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog ? DIALOG_COPY[dialog].title : ''}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setDialog(null)}>
            Close
          </button>
        }
      >
        <div className="space-y-3 text-body-md text-ink-graphite">
          {dialog
            ? DIALOG_COPY[dialog].body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
            : null}
        </div>
      </Modal>
    </div>
  );
}
