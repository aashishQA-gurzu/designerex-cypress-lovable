import { useEffect, useRef, useState } from "react";
import { MailCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useEmailVerified } from "@/hooks/useEmailVerified";

const RESEND_COOLDOWN = 60;

/** Shared resend + "I've verified" actions. */
function VerifyActions({ onVerified }: { onVerified?: () => void }) {
  const { resend, resending, refresh, refreshing } = useEmailVerified();
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown]);

  const handleResend = async () => {
    const { error } = await resend();
    if (error) {
      toast.error(error.message || "Couldn't send the email. Please try again shortly.");
      return;
    }
    setCooldown(RESEND_COOLDOWN);
    toast.success("Verification email sent — check your inbox.");
  };

  const handleVerified = async () => {
    const ok = await refresh();
    if (ok) {
      toast.success("Email verified. Thanks!");
      onVerified?.();
    } else {
      toast.error("Still unverified — click the link in the email, then try again.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleResend}
        disabled={resending || cooldown > 0}
        className="rounded-md bg-magenta px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {cooldown > 0 ? `Resend email (${cooldown}s)` : resending ? "Sending…" : "Resend email"}
      </button>
      <button
        type="button"
        onClick={handleVerified}
        disabled={refreshing}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink hover:bg-bg-tint disabled:opacity-50"
      >
        {refreshing ? "Checking…" : "I've verified"}
      </button>
    </div>
  );
}

export function VerifyEmailModal({
  open,
  onClose,
  title = "Verify your email first",
  body,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  body?: string;
}) {
  const { email, verified } = useEmailVerified();
  useEffect(() => {
    if (open && verified) onClose();
  }, [open, verified, onClose]);

  if (!open) return null;
  const defaultBody = `For everyone's safety we ask renters to confirm their email before booking. We sent a link to ${email ?? "your email address"}.`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-[10px] border border-border bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tint text-magenta">
              <MailCheck className="h-4 w-4" />
            </span>
            <h2 className="font-display text-xl text-ink">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {body ? `${body} We sent a link to ${email ?? "your email address"}.` : defaultBody}
        </p>
        <div className="mt-5">
          <VerifyActions onVerified={onClose} />
        </div>
      </div>
    </div>
  );
}

const DISMISS_KEY = "dx_verify_banner_dismissed";

export function VerifyEmailBanner() {
  const { signedIn, verified, email } = useEmailVerified();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    }
  }, []);

  if (!signedIn || verified || dismissed) return null;

  return (
    <div className="w-full border-b border-border bg-bg-tint">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <p className="flex-1 text-sm text-ink">
          Verify your email to book dresses and publish listings. We sent a link to{" "}
          <span className="font-medium">{email ?? "your email address"}</span>.
        </p>
        <VerifyActions />
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            if (typeof window !== "undefined") window.sessionStorage.setItem(DISMISS_KEY, "1");
          }}
          className="text-muted-foreground hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
