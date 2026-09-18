import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  Heart,
  Headphones,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Inbox,
  ShoppingBag,
  MessageSquare,
  User as UserIcon,
  MapPin,
  CreditCard,
  ShieldCheck,
  KeyRound,
  Truck,
  Zap,
  Tag,
  Plane,
  ArrowRight,
  Sparkles,

  BarChart3,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import { VerificationBanner } from "@/components/dashboard/VerificationBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

type SideItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; pill?: string };
type SideGroup = { label: string; items: SideItem[] };

const PROFILE_GROUP: SideGroup = {
  label: "PROFILE",
  items: [
    { to: "/dashboard/profile", label: "Profile Details", icon: UserIcon },
    { to: "/dashboard/addresses", label: "Delivery Address", icon: MapPin },
    { to: "/dashboard/payment", label: "Payment Details", icon: CreditCard },
    { to: "/dashboard/id-verification", label: "ID Verification", icon: ShieldCheck },
    { to: "/dashboard/password", label: "Change Password", icon: KeyRound },
  ],
};

const SETTINGS_GROUP: SideGroup = {
  label: "SETTINGS",
  items: [
    { to: "/dashboard/shipping", label: "Shipping Settings", icon: Truck },
    { to: "/dashboard/two-hour-delivery", label: "Two Hour Delivery", icon: Zap, pill: "Uber" },
    { to: "/dashboard/promo", label: "Promo Settings", icon: Tag },
    { to: "/dashboard/vacation", label: "Vacation Mode", icon: Plane },
    { to: "/dashboard/try-on", label: "Try-Ons", icon: Sparkles },

  ],
};

const TOP_TABS_ALL: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; lenderOnly?: boolean; search?: Record<string, string> }[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/rentals", label: "My Rentals", icon: ShoppingBag },
  { to: "/dashboard/booking-requests", label: "Booking Requests", icon: Inbox, lenderOnly: true },
  { to: "/dashboard/bookings", label: "My Bookings", icon: ShoppingBag, lenderOnly: true },
  { to: "/dashboard/listings", label: "Listings", icon: ClipboardList, lenderOnly: true },
  { to: "/dashboard/availability", label: "Availability Calendar", icon: CalendarDays, lenderOnly: true },
  { to: "/dashboard/financials", label: "Financials", icon: BarChart3, lenderOnly: true },
];

function DashboardLayout() {
  const { user, profile, refreshProfile } = useAuth();
  const unreadMessages = useUnreadMessagesCount(user?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOverview = pathname === "/dashboard";

  // The unread badge is decoration: if this count fails it must resolve to 0
  // quietly and never take the dashboard down with it.
  const { data: unreadNotifs = 0 } = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user,
    retry: false,
    throwOnError: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .is("read_at", null);
        if (error) return 0;
        return count ?? 0;
      } catch {
        return 0;
      }
    },
  });

  const [lenderOn, setLenderOn] = useState<boolean>(!!profile?.is_lender);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setLenderOn(!!profile?.is_lender); }, [profile?.is_lender]);

  // Close drawer on route change + lock body scroll while open
  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sidebarOpen]);

  // NOTE: `is_lender` exists on profile — toggle is wired to update it.
  const toggleLender = async () => {
    if (!user) return;
    const next = !lenderOn;
    setLenderOn(next);
    const { error } = await supabase.from("profiles").update({ is_lender: next }).eq("id", user.id);
    if (error) {
      setLenderOn(!next);
      console.warn("Failed to update is_lender", error);
    } else {
      refreshProfile();
    }
  };

  const isActive = (to: string) =>
    to === "/dashboard" ? pathname === "/dashboard" : pathname === to || pathname.startsWith(to + "/");

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Account";
  const initial = (profile?.first_name?.[0] ?? "U").toUpperCase();



  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="font-display text-3xl leading-none text-white">DX</p>
          <p className="mt-1 text-[10px] tracking-[0.3em] text-white/60">DESIGNEREX</p>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="md:hidden rounded-full p-2 text-white/85 hover:bg-white/10 hover:text-magenta"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="h-px bg-white/10 mx-6" />

      {/* Top dashboard link */}
      <div className="px-3 pt-4">
        <Link
          to="/dashboard"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
            isOverview
              ? "bg-magenta/15 text-magenta"
              : "text-white/80 hover:bg-white/5",
          )}
        >
          {isOverview ? (
            <>
              <LayoutDashboard className="h-4 w-4" />
              Main Dashboard
            </>
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              Back to Dashboard
            </>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {[PROFILE_GROUP, SETTINGS_GROUP].map((g) => (
          <div key={g.label}>
            <p className="mb-2 px-3 text-[10px] tracking-[0.2em] text-white/40">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(it.to);
                const Icon = it.icon;
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-magenta/15 text-magenta"
                          : "text-white/80 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.pill && (
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
                          {it.pill}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Saved & Messages preserved here */}
        <div>
          <p className="mb-2 px-3 text-[10px] tracking-[0.2em] text-white/40">QUICK LINKS</p>
          <ul className="space-y-0.5">
            <li>
              <Link
                to="/dashboard/messages"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive("/dashboard/messages")
                    ? "bg-magenta/15 text-magenta"
                    : "text-white/80 hover:bg-white/5 hover:text-white",
                )}
              >
                <MessageSquare className="h-4 w-4" />
                <span className="flex-1">Messages</span>
                {unreadMessages > 0 && (
                  <span className="rounded-full bg-magenta px-1.5 py-0.5 text-[9px] text-white">
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>
            </li>
            <li>
              <Link
                to="/dashboard/saved"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive("/dashboard/saved")
                    ? "bg-magenta/15 text-magenta"
                    : "text-white/80 hover:bg-white/5 hover:text-white",
                )}
              >
                <Heart className="h-4 w-4" />
                Saved Dresses
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      {/* Help card */}
      <div className="p-4">
        <div className="rounded-[10px] bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-magenta/20">
              <Headphones className="h-4 w-4 text-magenta" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Need help?</p>
              <a
                href="#"
                className="mt-1 flex items-center gap-1 text-xs text-white/60 hover:text-white"
              >
                Visit our Help Centre or contact support
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full min-w-0 max-w-full bg-bg">
      {/* ─────── SIDEBAR (desktop / small laptops) ─────── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-black text-white lg:w-64">
        <SidebarContent />
      </aside>

      {/* ─────── SIDEBAR (mobile drawer) ─────── */}
      <div
        className={`md:hidden fixed inset-0 z-[60] ${sidebarOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!sidebarOpen}
      >
        <div
          onClick={() => setSidebarOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            sidebarOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard menu"
          className={`absolute left-0 top-0 h-full w-[85%] max-w-xs bg-black text-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent />
        </aside>
      </div>

      {/* ─────── MAIN ─────── */}
      <div className="flex w-full min-w-0 max-w-full flex-1 flex-col">
        {/* Header */}
        <header className="border-b border-border bg-bg px-4 lg:px-10 py-6">
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 flex items-start gap-3">
              {/* L10: in-page hamburger removed — use the top-bar (global header) one. */}
              <div className="min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl text-ink">
                  Welcome back, {profile?.first_name ?? "there"} <span aria-hidden>👋</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Here's what's happening with your rentals and listings.
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
              {/* Lender toggle */}
              <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2">
                <span className="text-xs text-ink">Do you want to lend?</span>
                <button
                  type="button"
                  onClick={toggleLender}
                  role="switch"
                  aria-checked={lenderOn}
                  className={cn(
                    "relative h-5 w-10 rounded-full transition-colors",
                    lenderOn ? "bg-magenta" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                      lenderOn ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </button>
                <span className="text-xs font-medium text-ink">{lenderOn ? "Yes" : "No"}</span>
              </div>

              {/* Notifications */}
              <Link
                to="/dashboard/notifications"
                search={{ filter: "all" as const }}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface hover:bg-bg-tint"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4 text-ink" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-magenta px-1 text-[9px] font-medium text-white">
                    {unreadNotifs > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </Link>

              {/* Avatar */}
              <Link
                to="/dashboard/profile"
                className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 hover:bg-bg-tint"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">
                    {initial}
                  </div>
                )}
                <span className="max-w-28 truncate text-sm text-ink sm:max-w-40">{fullName}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </header>

        {/* Top tab bar */}
        <nav className="relative border-b border-border bg-bg px-4 lg:px-10">
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-bg via-bg/80 to-transparent" />
          <div className="flex max-w-full gap-6 overflow-x-auto overscroll-x-contain pr-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {TOP_TABS_ALL.filter((t) => !t.lenderOnly || profile?.is_lender).map((t) => {
              const active = isActive(t.to);
              const Icon = t.icon;
              return (
              <Link
                  key={t.to}
                  to={t.to}
                  search={t.search}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm transition-colors",
                    active
                      ? "border-magenta text-magenta font-medium"
                      : "border-transparent text-muted-foreground hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden bg-bg p-4 lg:p-10">
          <VerificationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
