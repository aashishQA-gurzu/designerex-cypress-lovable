import { createFileRoute } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";

export const Route = createFileRoute("/_authenticated/dashboard/promo")({
  ssr: false,
  component: () => (
    <LenderGate>
      <PromoPage />
    </LenderGate>
  ),
});

function PromoPage() {
  const { profile } = useAuth();
  const activePromos: unknown[] = (profile as any)?.active_promos ?? [];

  return (
    <div className="space-y-8">
      {/* Panel header */}
      <div>
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-magenta" />
          <h1 className="font-display text-3xl">Special Promo</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          On selected occasions we'll make your dress listings more enticing by offering
          them at 20% off the Rental Price, in special promos and brand ambassador partnerships that
          make it easier for you to get more bookings. The discount is covered by us and your pay out
          will remain as normal.
        </p>
      </div>

      {/* Sub-section */}
      <div className="space-y-4">
        <h2 className="font-heading text-xl">Current or Upcoming Special Promos</h2>
        <p className="text-sm text-ink-muted">
          Details of any current promos or upcoming Special Promos will be listed below.
        </p>

        {activePromos.length === 0 && (
          <div className="callout-info">
            <div>
              <p className="font-semibold text-ink">No active promos at the moment.</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Check back here to see upcoming Special Promos and promotions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
