import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated/dashboard/password")({
  ssr: false,
  component: ChangePassword,
});

function isStrong(pw: string) {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

function PwField({
  label,
  value,
  onChange,
  show,
  setShow,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-sans font-medium uppercase tracking-wider-display text-ink-muted">
        {label} <span className="text-magenta">*</span>
      </span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {helper && (
        <p className="mt-1.5 text-[11px] text-ink-muted leading-relaxed">{helper}</p>
      )}
    </label>
  );
}

function ChangePassword() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showC, setShowC] = useState(false);
  const [showN, setShowN] = useState(false);
  const [showF, setShowF] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) { toast.error("Not signed in."); return; }
    if (!current || !next || !confirm) { toast.error("Please fill in all fields."); return; }
    if (!isStrong(next)) { toast.error("New password must be 8+ chars and include a letter, number and symbol."); return; }
    if (next !== confirm) { toast.error("New passwords don't match."); return; }
    setSaving(true);
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (signErr) { setSaving(false); toast.error("Current password is incorrect."); return; }
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setCurrent(""); setNext(""); setConfirm("");
    toast.success("Password updated.");
  };

  const handleCancel = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  return (
    <div>
      {/* Panel header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-[1.65rem] md:text-[1.85rem] leading-tight">Change Password</h1>
          <p className="mt-1 text-sm text-ink-muted">
            For your security, please choose a strong password that you don't use elsewhere.
          </p>
        </div>
        <span className="text-[11px] text-ink-muted whitespace-nowrap mt-1">* Required</span>
      </div>

      <form onSubmit={submit} className="max-w-xl space-y-5 card-surface">
        <PwField
          label="Old Password"
          value={current}
          onChange={setCurrent}
          show={showC}
          setShow={setShowC}
        />
        <PwField
          label="New Password"
          value={next}
          onChange={setNext}
          show={showN}
          setShow={setShowN}
          helper="Must be at least 8 characters long and include a mix of letters, numbers and symbols."
        />
        <PwField
          label="Confirm Password"
          value={confirm}
          onChange={setConfirm}
          show={showF}
          setShow={setShowF}
        />

        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={handleCancel} className="btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-magenta">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
