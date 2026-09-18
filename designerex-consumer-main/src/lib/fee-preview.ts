import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeePreview = {
  rental_price: number;
  cleaning_fee: number;
  advertised_rental: number;
  shipping_fee: number;
  two_hour_delivery_fee: number;
  renter_booking_fee: number;
  renter_total: number;
  service_fee_base: number;
  tier_rate: number;
  lender_commission: number;
  lender_receives: number;
};

export async function fetchFeePreview(
  rental: number,
  cleaning: number = 0,
  shipping: number = 0,
  twoHour: number = 0,
): Promise<FeePreview | null> {
  if (!Number.isFinite(rental) || rental <= 0) return null;
  const { data, error } = await supabase.rpc("dx_fee_preview", {
    p_rental: rental,
    p_cleaning: Number(cleaning) || 0,
    p_shipping: Number(shipping) || 0,
    p_two_hour: Number(twoHour) || 0,
  } as any);
  if (error) {
    console.error("dx_fee_preview error", error, { rental, cleaning, shipping, twoHour });
    return null;
  }
  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row) {
    console.error("dx_fee_preview returned no row", { data, rental, cleaning, shipping, twoHour });
    return null;
  }
  return {
    rental_price: Number(row.rental_price ?? 0),
    cleaning_fee: Number(row.cleaning_fee ?? 0),
    advertised_rental: Number(row.advertised_rental ?? 0),
    shipping_fee: Number(row.shipping_fee ?? 0),
    two_hour_delivery_fee: Number(row.two_hour_delivery_fee ?? 0),
    renter_booking_fee: Number(row.renter_booking_fee ?? 0),
    renter_total: Number(row.renter_total ?? 0),
    service_fee_base: Number(row.service_fee_base ?? 0),
    tier_rate: Number(row.tier_rate ?? 0),
    lender_commission: Number(row.lender_commission ?? 0),
    lender_receives: Number(row.lender_receives ?? 0),
  };
}

export type FeePreviewStatus = "idle" | "loading" | "ready" | "error";

export function useFeePreviewState(
  rental: number,
  cleaning: number = 0,
  shipping: number = 0,
  twoHour: number = 0,
  debounceMs: number = 300,
): { fee: FeePreview | null; status: FeePreviewStatus } {
  const [fee, setFee] = useState<FeePreview | null>(null);
  const [status, setStatus] = useState<FeePreviewStatus>("idle");
  useEffect(() => {
    let alive = true;
    // Never show a stale figure for different inputs.
    setFee(null);
    if (!Number.isFinite(rental) || rental <= 0) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const t = setTimeout(() => {
      fetchFeePreview(rental, cleaning, shipping, twoHour).then((f) => {
        if (!alive) return;
        setFee(f);
        setStatus(f ? "ready" : "error");
      });
    }, debounceMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [rental, cleaning, shipping, twoHour, debounceMs]);
  return { fee, status };
}

export function useFeePreview(
  rental: number,
  cleaning: number = 0,
  shipping: number = 0,
  twoHour: number = 0,
  debounceMs: number = 300,
): FeePreview | null {
  return useFeePreviewState(rental, cleaning, shipping, twoHour, debounceMs).fee;
}


