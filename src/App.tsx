import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { CopilotChatProvider } from './context/CopilotChatContext';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';

const SignIn = lazy(() => import('./pages/SignIn'));
const OnboardingBusiness = lazy(() => import('./pages/OnboardingBusiness'));
const OnboardingPaypal = lazy(() => import('./pages/OnboardingPaypal'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceNew = lazy(() => import('./pages/InvoiceNew'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'));
const Pay = lazy(() => import('./pages/Pay'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Budgets = lazy(() => import('./pages/Budgets'));
const CashFlow = lazy(() => import('./pages/CashFlow'));
const Sentinel = lazy(() => import('./pages/Sentinel'));
const SentinelDetail = lazy(() => import('./pages/SentinelDetail'));
const Copilot = lazy(() => import('./pages/Copilot'));
const Settings = lazy(() => import('./pages/Settings'));

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
      <div className="flex items-center gap-3 text-body-md text-ink-slate">
        <Spinner />
        Loading workspace
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function PublicOnly({ children }: { children: ReactElement }) {
  const { user, loading } = useApp();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useApp();
  if (loading) return <FullPageLoader />;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <CopilotChatProvider>
          <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <SignIn />
                </PublicOnly>
              }
            />
            <Route path="/pay/:publicToken" element={<Pay />} />

            <Route
              path="/onboarding/business"
              element={
                <RequireAuth>
                  <OnboardingBusiness />
                </RequireAuth>
              }
            />
            <Route
              path="/onboarding/paypal"
              element={
                <RequireAuth>
                  <OnboardingPaypal />
                </RequireAuth>
              }
            />

            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/new" element={<InvoiceNew />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="cash-flow" element={<CashFlow />} />
              <Route path="sentinel" element={<Sentinel />} />
              <Route path="sentinel/:id" element={<SentinelDetail />} />
              <Route path="copilot" element={<Copilot />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </CopilotChatProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
