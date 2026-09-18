import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Field } from "@/components/auth/LoginForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    navigate({ to: "/login" });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-center font-serif text-4xl">Set a new password</h1>
        <div className="mt-8 rounded-xl bg-card p-8 shadow-sm">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="New password">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="form-input"
              />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
