import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Listing statuses that mean the listing is live/published on the site. */
const PUBLISHED_STATUSES = ["active", "published", "paused"] as const;

/**
 * Migrated lenders: they already have published listings but their account was
 * never verified, so their listings can't take new bookings. Verified lenders
 * and brand-new lenders with no listings never see this.
 */
export function VerificationBanner() {
  const { user, profile } = useAuth();
  // Verification is recorded as is_verified on newer profiles and
  // is_id_verified on older ones; either one being true means verified.
  const p = profile as any;
  const unverified = !!profile && !p.is_verified && !p.is_id_verified;

  const { data: publishedCount = 0 } = useQuery({
    queryKey: ["lender-published-listing-count", user?.id],
    enabled: !!user && unverified,
    retry: false,
    // A failed count must never take the dashboard down — no banner instead.
    throwOnError: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("dresses")
        .select("id", { count: "exact", head: true })
        .eq("lender_id", user!.id)
        .in("status", PUBLISHED_STATUSES as unknown as string[]);
      if (error) {
        console.warn("[verification-banner] listing count failed", error);
        return 0;
      }
      return count ?? 0;
    },
  });

  if (!unverified || publishedCount === 0) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-[10px] border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
        <p className="text-sm text-amber-900">
          Your account needs to be verified before your listings can accept new bookings.
          Verify now to reactivate.
        </p>
      </div>
      <Link
        to="/dashboard/id-verification"
        className="btn-magenta inline-flex flex-shrink-0 items-center justify-center text-xs"
      >
        Verify now
      </Link>
    </div>
  );
}
