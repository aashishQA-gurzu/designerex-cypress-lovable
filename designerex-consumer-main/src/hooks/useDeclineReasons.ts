import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DECLINE_REASONS, type DeclineReason } from "@/lib/booking-reject";

/**
 * Decline reasons come from the database (dx_decline_reasons) when it exposes
 * them. If that function isn't available, fall back to the canonical list so
 * the lender always has a picker. Either way we display `label` and save `code`.
 */
export function useDeclineReasons() {
  return useQuery({
    queryKey: ["decline-reasons"],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<DeclineReason[]> => {
      const { data, error } = await supabase.rpc("dx_decline_reasons" as any);
      if (error) {
        console.warn("[decline-reasons] falling back to built-in list", error);
        return DECLINE_REASONS;
      }
      const rows = (Array.isArray(data) ? data : []) as any[];
      const mapped = rows
        .map((r) => ({
          code: String(r.code),
          label: String(r.label ?? r.code),
          sort_order: r.sort_order ?? null,
        }))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return mapped.length ? mapped : DECLINE_REASONS;
    },
  });
}
