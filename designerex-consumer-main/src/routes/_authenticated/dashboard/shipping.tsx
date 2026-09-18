import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { resilientProfileUpdate } from "@/lib/profile-update";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/dashboard/shipping")({
  ssr: false,
  component: () => (
    <LenderGate>
      <ShippingSettingsPage />
    </LenderGate>
  ),
});

function ShippingSettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [auspost, setAuspost] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setAuspost(!!(profile as any).auspost_integration_enabled);
  }, [profile]);

  const auspostLocked = !!(profile as any)?.auspost_integration_enabled;

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload: Record<string, unknown> = {};
    if (!auspostLocked && auspost) payload.auspost_integration_enabled = true;
    const { error } = await resilientProfileUpdate(user.id, payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Shipping settings saved.");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl text-ink">Shipping Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Need a hand with shipping? We&apos;ve got you covered.
          </p>
        </div>
        <Truck className="h-6 w-6 text-muted-foreground" />
      </div>

      <div className="card-surface mt-6 space-y-6">
        {/* Explainer */}
        <p className="text-sm text-ink leading-relaxed">
          Turn on the toggle below to enable prepaid shipping labels across ALL your
          listings. Once a booking is accepted, your label will be automatically generated
          and available to download in your booking details — making the process seamless
          from start to finish.
        </p>

        {/* Warning callout */}
        <div className="callout-info">
          <AlertTriangle data-callout-icon className="h-5 w-5 mt-0.5" />
          <div>
            <p data-callout-title>Please note, once this setting is turned on, it cannot be undone.</p>
            <p data-callout-body>
              Please refer to the{" "}
              <Link to="/faq" className="text-magenta hover:underline">FAQs</Link>
              {" "}for more information.
            </p>
          </div>
        </div>

        {/* Self-shipping note */}
        <p className="text-sm text-ink-muted leading-relaxed">
          If this isn&apos;t turned on you will need to handle all shipping yourself and add a
          fixed shipping cost per listing. Platform shipping labels will not be generated.
        </p>

        {/* Toggle row */}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-bg p-4">
          <div>
            <p className="text-sm font-medium text-ink">
              {auspostLocked ? "Platform shipping enabled" : "Enable platform shipping"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {auspostLocked
                ? "This is permanently enabled on your account."
                : "Auto-generate shipping labels for all accepted bookings."}
            </p>
          </div>
          <Switch
            checked={auspost}
            disabled={auspostLocked}
            onCheckedChange={setAuspost}
            aria-label="Toggle platform shipping"
          />
        </div>

        {/* Second callout */}
        <div className="rounded-[10px] bg-bg-tint p-4">
          <p className="text-sm text-ink-muted leading-relaxed">
            <span className="font-semibold text-ink">Please note:</span>{" "}
            this applies only to listings using Designerex shipping. Listings set to free
            shipping, custom shipping costs, or pickup will not generate labels.
          </p>
        </div>

        {/* Save */}
        {!auspostLocked && (
          <div className="pt-2">
            <button
              onClick={save}
              disabled={saving || !auspost}
              className="btn-magenta text-sm"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
