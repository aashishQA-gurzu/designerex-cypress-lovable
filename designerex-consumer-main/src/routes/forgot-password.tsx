import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Field } from "@/components/auth/LoginForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-center font-serif text-4xl">Forgot password?</h1>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          We'll send a reset link to your email.
        </p>
        <div className="mt-8 rounded-xl bg-card p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <p className="font-serif text-xl">Check your email</p>
              <p className="mt-2 text-sm text-muted-foreground">
                We've sent a password reset link to <strong>{email}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field label="Email">
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
