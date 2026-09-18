import { useState, useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Field } from "./LoginForm";
import { SimpleSelect } from "@/components/ui/simple-select";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SignupForm() {
  const { closeAuthModal, showWelcome } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm: "",
    firstName: "",
    lastName: "",
    day: "",
    month: "",
    year: "",
    mobile: "",
    isLender: false,
    agree: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 100 }, (_, i) => now - 18 - i);
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = (): string | null => {
    if (!form.email.includes("@")) return "Please enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
      return "Password must contain letters and numbers.";
    if (form.password !== form.confirm) return "Passwords do not match.";
    if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your full name.";
    if (!form.day || !form.month || !form.year) return "Please enter your date of birth.";
    const dob = new Date(Number(form.year), Number(form.month) - 1, Number(form.day));
    const ageMs = Date.now() - dob.getTime();
    const age = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 18) return "You must be 18 or older to join.";
    if (!form.agree) return "Please accept the Terms & Privacy Policy.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setLoading(true);

    const dobIso = `${form.year}-${String(form.month).padStart(2, "0")}-${String(form.day).padStart(2, "0")}`;

    const { data, error: signErr } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
        },
      },
    });

    if (signErr) {
      setLoading(false);
      setError(signErr.message);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setLoading(false);
      setError("Account created — please check your email to confirm.");
      return;
    }

    // Update profile fields not covered by the auth trigger
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        date_of_birth: dobIso,
        mobile_number: form.mobile.trim() || null,
        is_lender: form.isLender,
      })
      .eq("id", userId);

    if (profErr) console.error("profile update", profErr);

    // Pull the freshly-generated welcome discount code
    let code: string | null = null;
    for (let i = 0; i < 5; i++) {
      const { data: codes } = await supabase
        .from("discount_codes")
        .select("code")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (codes && codes.length > 0) {
        code = (codes[0] as { code: string }).code;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    setLoading(false);
    closeAuthModal();
    if (code) showWelcome(code);
    navigate({ to: "/" });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email">
        <input
          type="text"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          className="form-input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input
            type="text"
            required
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Last name">
          <input
            type="text"
            required
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            className="form-input"
          />
        </Field>
      </div>

      <Field label="Password">
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
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

      <Field label="Confirm password">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={(e) => set("confirm", e.target.value)}
          className="form-input"
        />
      </Field>

      <Field label="Date of birth">
        <div className="grid grid-cols-3 gap-2">
          <SimpleSelect
            value={form.day}
            onValueChange={(v) => set("day", v)}
            aria-label="Day of birth"
            placeholder="Day"
            options={Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => ({ value: d, label: d }))}
          />
          <SimpleSelect
            value={form.month}
            onValueChange={(v) => set("month", v)}
            aria-label="Month of birth"
            placeholder="Month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <SimpleSelect
            value={form.year}
            onValueChange={(v) => set("year", v)}
            aria-label="Year of birth"
            placeholder="Year"
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </Field>

      <Field label="Mobile (optional)">
        <input
          type="tel"
          autoComplete="tel"
          value={form.mobile}
          onChange={(e) => set("mobile", e.target.value)}
          className="form-input"
          placeholder="+61 4xx xxx xxx"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isLender}
          onChange={(e) => set("isLender", e.target.checked)}
          className="mt-0.5 accent-[var(--pink)]"
        />
        <span>I want to lend dresses too</span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.agree}
          onChange={(e) => set("agree", e.target.checked)}
          className="mt-0.5 accent-[var(--pink)]"
          required
        />
        <span>
          I agree to the{" "}
          <a href="/legal/terms" className="text-pink hover:underline">Terms & Conditions</a> and{" "}
          <a href="/legal/privacy" className="text-pink hover:underline">Privacy Policy</a>
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
