import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TryOnInfo = {
  try_on_offered: boolean;
  try_on_price: number;
  try_on_location: string | null;
  try_on_address: string | null;
  renter_service_fee: number;
  renter_total: number;
  lender_receives: number;
};

/**
 * Single source of truth for try-on availability and pricing.
 * All figures come from the database — never computed in JS.
 */
export function useTryOnForDress(dressId?: string, signedIn?: boolean) {
  return useQuery({
    queryKey: ["try-on-for-dress", dressId, !!signedIn],
    enabled: !!dressId,
    staleTime: 60_000,
    queryFn: async (): Promise<TryOnInfo | null> => {
      const { data, error } = await supabase.rpc("dx_try_on_for_dress", {
        p_dress_id: dressId!,
      } as any);
      if (error) {
        console.warn("[try-on] dx_try_on_for_dress failed", error);
        return null;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        try_on_offered: !!row.try_on_offered,
        try_on_price: Number(row.try_on_price ?? 0),
        try_on_location: row.try_on_location ?? null,
        try_on_address: row.try_on_address ?? null,
        renter_service_fee: Number(row.renter_service_fee ?? 0),
        renter_total: Number(row.renter_total ?? 0),
        lender_receives: Number(row.lender_receives ?? 0),
      };
    },
  });
}
