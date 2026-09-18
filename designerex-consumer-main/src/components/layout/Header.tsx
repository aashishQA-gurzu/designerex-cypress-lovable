import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Heart,
  ShoppingBag,
  MessageCircle,
  Bell,
  ChevronDown,
  User as UserIcon,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsPanel } from "./NotificationsPanel";
import { MessagesPanel } from "@/components/messaging/MessagesPanel";
import { useUnreadMessagesCount } from "@/lib/messaging";

export const NAV = [
  { label: "NEW IN", to: "/browse?sort=new" },
  { label: "WHAT'S POPULAR", to: "/browse?sort=popular" },
  { label: "DESIGNERS", to: "/designers" },
  { label: "OCCASIONS", to: "/occasions" },
  { label: "HOW IT WORKS", to: "/how-it-works" },
];

export function Header() {
  const { user, profile, openAuthModal, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unreadMessages = useUnreadMessagesCount(user?.id);

  // Never let a failed notification count break the page: errors resolve to 0.
  const { data: unreadNotifs = 0 } = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user,
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
    retry: false,
    throwOnError: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Realtime: refetch on any change to this user's notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);


  const drawerScrollRef = useRef<HTMLDivElement>(null);

  // Lock body scroll + Escape close while drawer open
  useEffect(() => {
    if (!drawerOpen) return;
    if (drawerScrollRef.current) drawerScrollRef.current.scrollTop = 0;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const handleProtected = (to: string) => {
    if (!user) openAuthModal("login", to);
    else navigate({ to });
  };

  const initials = (() => {
    const f = profile?.first_name?.[0] ?? "";
    const l = profile?.last_name?.[0] ?? "";
    return (f + l).toUpperCase() || (user?.email?.[0] ?? "?").toUpperCase();
  })();

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    console.log("[Search] submitted", { query: q });
    navigate({ to: "/browse", search: { q: q || undefined } as never });
  };

  const onDrawerSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    navigate({ to: "/browse", search: { q: q || undefined } as never });
    setDrawerOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-ink py-3 text-ink-foreground">

      <div className="mx-auto grid max-w-[1600px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:flex lg:gap-6">
        {/* Site drawer trigger — remains available on public pages at every width. */}
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className={`rounded-full p-2 text-ink-foreground/85 transition-colors hover:bg-white/10 hover:text-pink ${
            location.pathname.startsWith("/dashboard") ? "lg:hidden" : ""
          }`}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo */}
        <Link to="/" className="flex min-w-0 items-baseline gap-2 lg:shrink-0">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-pink text-[11px] font-bold tracking-tighter text-pink-foreground">
            DX
          </span>
          <span className="truncate font-serif text-lg tracking-wide sm:text-xl">DESIGNEREX</span>
        </Link>

        {/* Nav */}
        <nav className="hidden shrink-0 items-center gap-3.5 lg:flex xl:gap-4">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              className="text-[11px] tracking-wider-display text-ink-foreground/80 transition-colors hover:text-pink"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Search */}
        <form onSubmit={onSearchSubmit} className="hidden flex-1 max-w-md md:block lg:max-w-xs xl:max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="text"
              placeholder="Search for dresses, designers, occasions..."
              className="w-full rounded-full bg-white px-10 py-2 text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-pink/40"
            />
          </div>
        </form>

        {/* Icons — desktop: all; mobile: cart + bell only */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 lg:ml-0">
          <IconBtn label="Saved" onClick={() => handleProtected("/saved")} className="hidden lg:inline-flex">
            <Heart className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn label="Bag" onClick={() => handleProtected("/dashboard/bookings")}>
            <ShoppingBag className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn
            label="Messages"
            onClick={() => (user ? setMessagesOpen(true) : openAuthModal("login"))}
            badge={unreadMessages}
            className="hidden lg:inline-flex"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn
            label="Notifications"
            onClick={() => (user ? setNotifsOpen(true) : openAuthModal("login"))}
            badge={unreadNotifs}
          >
            <Bell className="h-[18px] w-[18px]" />
          </IconBtn>


          {/* Profile */}
          <div className="relative ml-2 hidden lg:block">
            <button
              onClick={() => (user ? setMenuOpen((o) => !o) : openAuthModal("login"))}
              className="flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-0.5 transition-colors hover:bg-white/10"
            >
              {user && profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : user ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pink text-xs font-medium text-pink-foreground">
                  {initials}
                </span>
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <UserIcon className="h-4 w-4" />
                </span>
              )}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {menuOpen && user && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="font-serif text-base">Welcome back, {profile?.first_name ?? "there"} 👋</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <nav className="flex flex-col py-1 text-sm">
                  <MenuLink to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MenuLink>
                  {!profile?.is_lender && (
                    <MenuLink to="/dashboard/listings" onClick={() => setMenuOpen(false)}>
                      <span className="text-pink">Switch to Lender</span>
                    </MenuLink>
                  )}
                  <MenuLink to="/dashboard/profile" onClick={() => setMenuOpen(false)}>Settings</MenuLink>
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await signOut();
                      navigate({ to: "/" });
                    }}
                    className="border-t border-border px-4 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    Sign out
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>
      </div>
      {user && (
        <NotificationsPanel
          userId={user.id}
          open={notifsOpen}
          onClose={() => setNotifsOpen(false)}
        />
      )}
      <MessagesPanel open={messagesOpen} onClose={() => setMessagesOpen(false)} />

      {/* Left site drawer */}
      <div
        className={`fixed inset-0 z-[60] ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* Panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className={`absolute left-0 top-0 flex h-full w-[85%] max-w-sm min-w-0 flex-col overflow-x-hidden bg-ink text-ink-foreground shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <Link to="/" onClick={() => setDrawerOpen(false)} className="flex items-baseline gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-pink text-[11px] font-bold tracking-tighter text-pink-foreground">
                DX
              </span>
              <span className="font-serif text-lg tracking-wide">DESIGNEREX</span>
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="rounded-full p-2 text-ink-foreground/85 hover:bg-white/10 hover:text-pink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={drawerScrollRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-4 space-y-5 [-webkit-overflow-scrolling:touch]">
            {/* Search */}
            <form onSubmit={onDrawerSearchSubmit} className="min-w-0">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  type="text"
                  placeholder="Search dresses, designers..."
                  className="w-full rounded-full bg-white px-10 py-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-pink/40"
                />
              </div>
            </form>

            {/* Primary nav */}
            <nav className="flex flex-col">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  to={n.to}
                  onClick={() => setDrawerOpen(false)}
                  className="py-3 text-[12px] tracking-wider-display text-ink-foreground/85 border-b border-white/5 hover:text-pink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="h-px bg-white/10" />

            {/* Account */}
            <nav className="flex flex-col text-sm">
              {user ? (
                <>
                  <div className="pb-3 mb-1">
                    <p className="font-serif text-base">Welcome back, {profile?.first_name ?? "there"} 👋</p>
                    <p className="text-xs text-ink-foreground/60">{user.email}</p>
                  </div>
                  <DrawerLink to="/dashboard/bookings" onClick={() => setDrawerOpen(false)}>My Bookings</DrawerLink>
                  <DrawerLink to="/dashboard/messages" onClick={() => setDrawerOpen(false)} badge={unreadMessages}>Messages</DrawerLink>
                  <DrawerLink to="/saved" onClick={() => setDrawerOpen(false)}>Saved Dresses</DrawerLink>
                  <DrawerLink to="/dashboard/notifications" onClick={() => setDrawerOpen(false)} badge={unreadNotifs}>Notifications</DrawerLink>
                  <DrawerLink to="/dashboard" onClick={() => setDrawerOpen(false)}>Dashboard</DrawerLink>
                  {profile?.is_lender && (
                    <DrawerLink to="/dashboard/listings" onClick={() => setDrawerOpen(false)}>My Listings</DrawerLink>
                  )}

                  <p className="mt-4 mb-1 text-[10px] tracking-[0.2em] text-ink-foreground/40">PROFILE</p>
                  <DrawerLink to="/dashboard/profile" onClick={() => setDrawerOpen(false)}>Profile Details</DrawerLink>
                  <DrawerLink to="/dashboard/addresses" onClick={() => setDrawerOpen(false)}>Delivery Address</DrawerLink>
                  <DrawerLink to="/dashboard/payment" onClick={() => setDrawerOpen(false)}>Payment Details</DrawerLink>
                  <DrawerLink to="/dashboard/id-verification" onClick={() => setDrawerOpen(false)}>ID Verification</DrawerLink>
                  <DrawerLink to="/dashboard/password" onClick={() => setDrawerOpen(false)}>Change Password</DrawerLink>

                  {profile?.is_lender && (
                    <>
                      <p className="mt-4 mb-1 text-[10px] tracking-[0.2em] text-ink-foreground/40">SETTINGS</p>
                      <DrawerLink to="/dashboard/shipping" onClick={() => setDrawerOpen(false)}>Shipping Settings</DrawerLink>
                      <DrawerLink to="/dashboard/two-hour-delivery" onClick={() => setDrawerOpen(false)}>Two Hour Delivery</DrawerLink>
                      <DrawerLink to="/dashboard/promo" onClick={() => setDrawerOpen(false)}>Promo Settings</DrawerLink>
                      <DrawerLink to="/dashboard/vacation" onClick={() => setDrawerOpen(false)}>Vacation Mode</DrawerLink>
                      <DrawerLink to="/dashboard/try-on" onClick={() => setDrawerOpen(false)}>Try-Ons</DrawerLink>
                    </>
                  )}

                  <button
                    onClick={async () => {
                      setDrawerOpen(false);
                      await signOut();
                      navigate({ to: "/" });
                    }}
                    className="mt-2 py-3 text-left text-sm text-ink-foreground/85 border-t border-white/10 hover:text-pink"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      openAuthModal("login");
                    }}
                    className="py-3 text-left border-b border-white/5 hover:text-pink"
                  >
                    Log in
                  </button>
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      openAuthModal("signup");
                    }}
                    className="py-3 text-left text-pink hover:text-pink"
                  >
                    Sign up
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}


function IconBtn({
  children,
  onClick,
  label,
  badge,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  badge?: number;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`relative rounded-full p-2 text-ink-foreground/85 transition-colors hover:bg-white/10 hover:text-pink ${className ?? ""}`}
    >
      {children}
      {badge && badge > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink px-1 text-[9px] font-medium text-pink-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

function MenuLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="px-4 py-2 text-sm hover:bg-muted">
      {children}
    </Link>
  );
}

function DrawerLink({
  to,
  children,
  onClick,
  badge,
}: {
  to: string;
  children: React.ReactNode;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center justify-between py-3 text-sm text-ink-foreground/85 border-b border-white/5 hover:text-pink"
    >
      <span>{children}</span>
      {badge && badge > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pink px-1.5 text-[10px] font-medium text-pink-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
