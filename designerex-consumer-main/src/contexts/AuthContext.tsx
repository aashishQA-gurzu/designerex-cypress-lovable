import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_lender: boolean | null;
  date_of_birth: string | null;
  mobile_number: string | null;
  email: string | null;
  [key: string]: unknown;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  // UI state for global auth modals
  authModal: "login" | "signup" | null;
  openAuthModal: (mode: "login" | "signup", redirectTo?: string) => void;
  closeAuthModal: () => void;
  pendingRedirect: string | null;
  // Welcome modal after signup
  welcomeDiscountCode: string | null;
  showWelcome: (code: string) => void;
  hideWelcome: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const [welcomeDiscountCode, setWelcomeDiscountCode] = useState<string | null>(null);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.error("Profile fetch error:", error);
      return;
    }
    setProfile((data as Profile) ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer profile fetch
        setTimeout(() => fetchProfile(newSession.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) fetchProfile(existing.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const openAuthModal = useCallback((mode: "login" | "signup", redirectTo?: string) => {
    if (redirectTo) setPendingRedirect(redirectTo);
    setAuthModal(mode);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal(null);
  }, []);

  const showWelcome = useCallback((code: string) => setWelcomeDiscountCode(code), []);
  const hideWelcome = useCallback(() => setWelcomeDiscountCode(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        refreshProfile,
        signOut,
        authModal,
        openAuthModal,
        closeAuthModal,
        pendingRedirect,
        welcomeDiscountCode,
        showWelcome,
        hideWelcome,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const FALLBACK_AUTH: AuthState = {
  user: null,
  session: null,
  profile: null,
  loading: false,
  refreshProfile: async () => {},
  signOut: async () => {},
  authModal: null,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  pendingRedirect: null,
  welcomeDiscountCode: null,
  showWelcome: () => {},
  hideWelcome: () => {},
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  // Tolerant: if rendered outside provider (e.g. inside the router's root
  // errorComponent which replaces RootComponent), return a safe default
  // rather than throwing — which would itself crash the error boundary.
  if (!ctx) {
    if (typeof window !== "undefined") {
      console.warn("useAuth called outside AuthProvider — returning fallback");
    }
    return FALLBACK_AUTH;
  }
  return ctx;
}
