import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Notification } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { initials, relativeTime } from '../lib/format';
import { useApp } from '../context/AppContext';
import { Icon, Logo, Modal } from './ui';
import { CopilotDock } from './CopilotDock';

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/app', label: 'Overview', icon: 'space_dashboard', end: true },
      { to: '/app/invoices', label: 'Invoices', icon: 'receipt_long' },
      { to: '/app/transactions', label: 'Transactions', icon: 'swap_horiz' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/app/expenses', label: 'Expenses', icon: 'credit_card' },
      { to: '/app/budgets', label: 'Budgets', icon: 'savings' },
      { to: '/app/cash-flow', label: 'Cash Flow', icon: 'monitoring' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/app/sentinel', label: 'Sentinel', icon: 'radar' },
      { to: '/app/copilot', label: 'Copilot', icon: 'forum' },
    ],
  },
];

export function AppShell() {
  const { user, logout, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    api
      .get<{ notifications: Notification[] }>('/notifications')
      .then((data) => setNotifications(data.notifications))
      .catch(() => {
        // The bell simply shows no items when the API is unavailable.
      });
  }, [location.pathname]);

  const unread = notifications.filter((item) => !item.read).length;

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const openNotification = async (item: Notification) => {
    setNotifOpen(false);
    if (!item.read) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        setNotifications((current) => current.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      } catch {
        // Navigation still proceeds; the item stays unread.
      }
    }
    navigate(item.href);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/app/invoices?search=${encodeURIComponent(query)}` : '/app/invoices');
    setSearch('');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-stroke-line px-5">
        <Link to="/app" aria-label="MERGIN overview" className="flex items-center">
          <Logo height={22} />
        </Link>
        <button
          type="button"
          className="icon-btn lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        >
          <Icon name="close" className="text-[20px]" />
        </button>
      </div>

      <div className="px-3 pt-4">
        <Link
          to="/app/settings"
          className="flex items-center gap-3 rounded-xl border border-stroke-line bg-surface-container-low/60 px-3 py-2.5 transition-colors hover:bg-surface-hover"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-solid text-label-md font-semibold text-on-primary">
            {initials(user?.workspaceName ?? 'Mergin')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label-md font-medium text-ink-solid">
              {user?.workspaceName ?? 'Demo workspace'}
            </span>
            <span className="block text-caption-micro uppercase tracking-wider text-ink-muted">Demo workspace</span>
          </span>
          <Icon name="unfold_more" className="text-[16px] text-ink-muted" />
        </Link>
      </div>

      <nav aria-label="Primary" className="scroll-thin mt-4 flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 text-caption-micro uppercase tracking-wider text-ink-muted">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  <Icon name={item.icon} className="text-[19px]" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.to === '/app/sentinel' ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" /> : null}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-stroke-line p-3">
        <NavLink
          to="/app/settings"
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Icon name="settings" className="text-[19px]" />
          Settings
        </NavLink>
        <button
          type="button"
          onClick={() => navigate('/onboarding/business')}
          className="nav-link w-full text-left"
        >
          <Icon name="rocket_launch" className="text-[19px]" />
          Onboarding
        </button>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-surface-container-low px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-label-sm font-semibold">
            {initials(user?.name ?? 'Maya Chen')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label-md font-medium text-ink-solid">{user?.name ?? 'Maya Chen'}</p>
            <p className="truncate text-caption-micro text-ink-muted">Demo owner</p>
          </div>
          <button
            type="button"
            className="icon-btn h-8 w-8"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <Icon name="logout" className="text-[17px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-canvas">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-50 hidden w-[240px] border-r border-stroke-line bg-surface-raised lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-ink-solid/40 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fade-in absolute inset-y-0 left-0 w-[280px] border-r border-stroke-line bg-surface-raised shadow-xl">
            {sidebar}
          </div>
        </div>
      ) : null}

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-solid focus:px-4 focus:py-2 focus:text-label-md focus:text-on-primary"
      >
        Skip to content
      </a>

      <div className="app-content lg:pl-[240px]">
        <header className="app-topbar fixed left-0 right-0 top-0 z-40 h-16 border-b border-stroke-line bg-surface-raised/90 backdrop-blur-md lg:left-[240px]">
          <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 md:px-8">
            <button
              type="button"
              className="icon-btn lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" className="text-[22px]" />
            </button>
            <Link to="/app" className="lg:hidden" aria-label="MERGIN overview">
              <Logo height={19} />
            </Link>

            <form onSubmit={submitSearch} className="relative hidden max-w-[440px] flex-1 sm:block" role="search">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-muted" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoices, clients, records..."
                aria-label="Search invoices"
                className="h-10 w-full rounded-lg border border-stroke-line bg-surface-canvas pl-9 pr-14 text-body-md text-ink-solid placeholder:text-ink-muted transition-colors focus:border-ink-solid focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-stroke-line bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-muted md:block">
                Ctrl K
              </span>
            </form>

            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to="/app/settings"
                className="hidden h-7 items-center gap-1.5 rounded-full border border-stroke-line px-2.5 text-caption-micro uppercase tracking-wider text-ink-slate transition-colors hover:border-ink-solid hover:text-ink-solid sm:inline-flex"
                title="This workspace uses local demo data unless credentials are configured."
              >
                <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
                Demo data
              </Link>

              <button type="button" className="icon-btn" aria-label="About this demo" title="About this demo" onClick={() => setHelpOpen(true)}>
                <Icon name="help" className="text-[20px]" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  className="icon-btn relative"
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                  aria-expanded={notifOpen}
                  onClick={() => setNotifOpen((value) => !value)}
                >
                  <Icon name="notifications" className="text-[20px]" />
                  {unread > 0 ? (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-solid px-1 text-[9px] font-semibold leading-none text-on-primary">
                      {unread}
                    </span>
                  ) : null}
                </button>
                {notifOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close notifications"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setNotifOpen(false)}
                    />
                    <div className="fade-in absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stroke-line bg-surface-raised shadow-xl">
                      <div className="flex items-center justify-between border-b border-stroke-line px-4 py-3">
                        <p className="text-label-md font-semibold">Notifications</p>
                        {unread > 0 ? (
                          <button type="button" onClick={markAllRead} className="text-caption-micro text-ink-slate underline-offset-4 hover:underline">
                            Mark all read
                          </button>
                        ) : (
                          <span className="text-caption-micro text-ink-muted">All read</span>
                        )}
                      </div>
                      {notifications.length === 0 ? (
                        <p className="px-4 py-8 text-center text-body-md text-ink-muted">No notifications.</p>
                      ) : (
                        <ul className="max-h-[360px] divide-y divide-stroke-line overflow-y-auto">
                          {notifications.slice(0, 6).map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => openNotification(item)}
                                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                              >
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                                  <Icon
                                    name={
                                      item.kind === 'invoice'
                                        ? 'receipt_long'
                                        : item.kind === 'sentinel'
                                          ? 'radar'
                                          : item.kind === 'budget'
                                            ? 'savings'
                                            : 'info'
                                    }
                                    className="text-[16px]"
                                  />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className={`block text-label-md ${item.read ? 'text-ink-slate' : 'font-medium text-ink-solid'}`}>
                                    {item.title}
                                  </span>
                                  <span className="mt-0.5 block text-caption-micro leading-4 text-ink-muted">{item.body}</span>
                                  <span className="mt-1 block text-caption-micro text-ink-muted">{relativeTime(item.createdAt)}</span>
                                </span>
                                {!item.read ? <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-solid" /> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              <Link
                to="/app/settings"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink-solid text-label-sm font-semibold text-on-primary"
                aria-label="Open profile settings"
                title={user?.email ?? 'Profile'}
              >
                {initials(user?.name ?? 'M')}
              </Link>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="app-main min-h-screen pt-16">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="About this MERGIN demo"
        description="What is real, what is simulated, and where data lives."
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setHelpOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-4 text-body-md text-ink-graphite">
          <p>
            This workspace is a seeded demo. Every invoice, transaction, expense, budget, and Sentinel signal is local SQLite data
            on this machine — not a live bank or PayPal feed.
          </p>
          <ul className="space-y-2.5">
            <li className="flex gap-2.5">
              <Icon name="database" className="mt-0.5 text-[18px]" />
              <span>Data persists in <code className="rounded bg-surface-container px-1 py-0.5 text-label-sm">dev.db</code> until you reset the demo.</span>
            </li>
            <li className="flex gap-2.5">
              <Icon name="paypal" className="mt-0.5 text-[18px]" />
              <span>PayPal Sandbox invoices only run when server credentials are set. Otherwise sends are marked demo-only, with no email.</span>
            </li>
            <li className="flex gap-2.5">
              <Icon name="forum" className="mt-0.5 text-[18px]" />
              <span>Copilot calculates facts in TypeScript. Gemini, when configured, only explains those calculated facts.</span>
            </li>
            <li className="flex gap-2.5">
              <Icon name="visibility_off" className="mt-0.5 text-[18px]" />
              <span>Usage telemetry for subscriptions is not connected, so Sentinel never claims a service is used or unused.</span>
            </li>
          </ul>
          <p className="text-caption-micro text-ink-muted">No real funds move from this app. Demo payments are labeled in the audit log.</p>
        </div>
      </Modal>

      <CopilotDock />
    </div>
  );
}
