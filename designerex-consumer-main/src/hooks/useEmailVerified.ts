import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Reads email verification state from the Supabase session user.
 * NOTE: this is for UX only — the database triggers are the enforcement.
 */
export function useEmailVerified() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [resending, setResending] = useState(false);

  const verified = !!user?.email_confirmed_at;
  const email = user?.email ?? null;

  const resend = useCallback(async () => {
    if (!email) return { error: new Error("No email on this account.") };
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      return { error: error ?? null };
    } finally {
      setResending(false);
    }
  }, [email]);

  /** Pull a fresh session so email_confirmed_at updates after the user clicks the link. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await supabase.auth.refreshSession();
      if (!data.session) await supabase.auth.getSession();
      const { data: userData } = await supabase.auth.getUser();
      return !!userData.user?.email_confirmed_at;
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { verified, email, signedIn: !!user, resend, resending, refresh, refreshing };
}

/** True when a Postgres error came from the email-verification guards. */
export function isEmailNotVerifiedError(e: unknown): boolean {
  const err = e as { hint?: string; message?: string; details?: string } | null;
  if (!err) return false;
  return (
    err.hint === "email_not_verified" ||
    (typeof err.message === "string" && err.message.includes("email_not_verified")) ||
    (typeof err.details === "string" && err.details.includes("email_not_verified"))
  );
}
