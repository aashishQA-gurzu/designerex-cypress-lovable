import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, MapPin, Timer, Package, Truck, Bell, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { resilientProfileUpdate } from "@/lib/profile-update";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/dashboard/two-hour-delivery")({
  ssr: false,
  component: () => (
    <LenderGate>
      <TwoHourPage />
    </LenderGate>
  ),
});

const INFO_CARDS = [
  {
    icon: MapPin,
    title: "Service Area",
    line: "Available within a 25–30 km radius; outside that range it's unavailable.",
  },
  {
    icon: Timer,
    title: "Accept Within 1 Hour",
    line: "Must accept within 1 hour or it may be cancelled.",
  },
  {
    icon: Package,
    title: "Ship Within 1 Hour",
    line: "Have the item ready for Uber pickup within 1 hour of accepting.",
  },
  {
    icon: Truck,
    title: "Uber Pickup & Delivery",
    line: "Uber collects from you and delivers to the Renter.",
  },
];

function TwoHourPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const enabled = !!(profile as any)?.enable_two_hour_delivery;

  const toggle = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await resilientProfileUpdate(user.id, {
      enable_two_hour_delivery: !enabled,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success(!enabled ? "Two-hour delivery enabled." : "Two-hour delivery disabled.");
  };

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-ink flex items-center gap-2">
            <Clock className="h-6 w-6 text-muted-foreground" />
            Two Hour Delivery (Uber)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Offer ultra-fast delivery to nearby Renters with Uber.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggle}
          disabled={saving}
          aria-label="Toggle two-hour delivery"
        />
      </div>

      <div className="card-surface mt-6 space-y-6">
        {/* Explainer */}
        <p className="text-sm text-ink leading-relaxed">
          When enabled, your listings will be eligible for Two Hour Delivery. Once a booking
          request is made, Uber will be arranged to pick up the item from you and deliver it
          directly to the Renter.
        </p>

        {/* Important callout */}
        <div className="callout-info">
          <AlertTriangle data-callout-icon className="h-5 w-5 mt-0.5" />
          <div>
            <p data-callout-title>Important: Requests must be accepted within 1 hour.</p>
            <p data-callout-body>
              To keep deliveries fast and reliable, all Two Hour Delivery requests must be
              accepted within 1 hour of being received.
            </p>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INFO_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-[10px] border border-border p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-tint">
                    <Icon className="h-4 w-4 text-magenta" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{card.title}</p>
                    <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                      {card.line}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stay notified callout */}
        <div className="rounded-[10px] bg-bg-tint p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-magenta/10">
              <Bell className="h-4 w-4 text-magenta" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Stay notified</p>
              <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                You&apos;ll receive an email and SMS for every Two Hour Delivery request.
                Please ensure your notifications are on so you don&apos;t miss any requests.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-ink-muted leading-relaxed">
          This feature helps you offer a faster, more convenient experience for nearby Renters.
          By enabling this, you agree to respond promptly and keep your items ready for quick
          pickup.
        </p>
      </div>
    </div>
  );
}
