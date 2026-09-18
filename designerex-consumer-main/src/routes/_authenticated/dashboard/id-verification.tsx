import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ShieldCheck, Lock, FileCheck2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated/dashboard/id-verification")({
  ssr: false,
  component: IdVerification,
});

function IdVerification() {
  const { user, profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const verified = Boolean((profile as any)?.is_id_verified);

  // NOTE: Stripe Identity is not integrated yet. The CTA opens an existing
  // mock-verify modal that flips the profile flag — kept as the "existing
  // verification flow" so the button isn't a no-op.
  const mockVerify = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ is_id_verified: true })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    setOpen(false);
    toast.success("Identity verified (mock).");
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6" />
        <div>
          <h2 className="font-display text-3xl leading-none">ID Verification</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We use <span className="text-magenta font-medium">Stripe Identity</span>{" "}
            to verify your identity securely.
          </p>
        </div>
      </div>

      <div className="card-surface p-6 md:p-8">
        {verified ? (
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" strokeWidth={3} />
            </div>
            <div>
              <p className="font-display text-2xl">Your identity is verified ✓</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Thanks for completing verification.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-8 md:grid-cols-2">
              {/* LEFT — explainer blocks */}
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-xl mb-2">What is ID Verification?</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    ID verification helps us confirm that you are who you say you are.
                    It protects both renters and lenders on DesignerEx, builds trust in
                    the community, and unlocks higher-value bookings.
                  </p>
                </div>
                <div>
                  <h3 className="font-display text-xl mb-2">Is Verifying my ID secure?</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Yes. Your ID is handled by Stripe Identity, an industry-leading
                    verification service. We never store your ID documents on our
                    servers. For details on how your data is handled, see our{" "}
                    <a
                      href="/privacy"
                      className="text-magenta underline underline-offset-2"
                    >
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              </div>

              {/* RIGHT — illustration + status card */}
              <div className="space-y-5">
                <div className="flex items-center justify-center rounded-md bg-[var(--color-bg-tint)] p-8">
                  <div className="relative">
                    <div className="h-32 w-52 rounded-lg bg-white shadow-md border border-black/10 p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-8 rounded bg-[var(--color-bg-tint)]" />
                        <div className="flex-1 space-y-1">
                          <div className="h-2 w-3/4 rounded bg-black/10" />
                          <div className="h-2 w-1/2 rounded bg-black/10" />
                          <div className="h-2 w-2/3 rounded bg-black/10" />
                        </div>
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <div className="h-2 w-16 rounded bg-black/10" />
                        <CreditCard className="h-4 w-4 text-black/30" />
                      </div>
                    </div>
                    <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--magenta,#d6336c)] text-white shadow-md">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                  </div>
                </div>

                <div className="card-surface p-4 space-y-3">
                  <StatusRow
                    icon={<FileCheck2 className="h-4 w-4" />}
                    title="Verification Status"
                    value="Not started"
                  />
                  <StatusRow
                    icon={<ShieldCheck className="h-4 w-4" />}
                    title="Secure & Private"
                    value="Handled by Stripe Identity"
                  />
                  <StatusRow
                    icon={<Lock className="h-4 w-4" />}
                    title="Data is encrypted"
                    value="Stored securely and never shared"
                  />
                </div>
              </div>
            </div>

            {/* Bottom callout */}
            <div className="mt-8 rounded-md bg-[var(--color-bg-tint)] p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <p className="text-sm max-w-xl">
                You will be redirected to Stripe Identity to complete your
                verification securely.
              </p>
              <div className="flex flex-col items-start md:items-end gap-1">
                <button
                  onClick={() => setOpen(true)}
                  className="btn-magenta text-xs"
                >
                  Continue with ID Verification
                </button>
                <span className="text-xs text-muted-foreground">
                  Takes only a few minutes
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-md bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 font-display text-2xl">Stripe Identity</h3>
            <p className="text-sm text-muted-foreground">
              In production this would launch Stripe Identity to verify your ID.
              For dev, click below to mock-verify.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="btn-outline text-xs"
              >
                Cancel
              </button>
              <button
                onClick={mockVerify}
                disabled={busy}
                className="btn-magenta text-xs"
              >
                {busy ? "Verifying…" : "Mock-verify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-bg-tint)] text-foreground">
        {icon}
      </div>
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground text-right">{value}</span>
      </div>
    </div>
  );
}
