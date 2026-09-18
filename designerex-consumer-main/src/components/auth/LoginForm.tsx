import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function LoginForm() {
  const { closeAuthModal, pendingRedirect } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    closeAuthModal();
    if (pendingRedirect) navigate({ to: pendingRedirect });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email">
        <input
          type="text"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="form-input"
        />
      </Field>
      <Field label="Password">
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-sm">
        <a href="/forgot-password" className="text-muted-foreground hover:text-pink hover:underline">
          Forgot password?
        </a>
      </p>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] tracking-wider-display text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
