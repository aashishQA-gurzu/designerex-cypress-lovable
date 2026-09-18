import { supabase } from "@/integrations/supabase/client";

export type SavedCheckout = {
  reservationId: string | null;
  dressId: string;
  start: string;
  end: string;
  expiresAt: string | null;
  hireOption: "a" | "b" | "tryon";
  tryOnPeriod: "am" | "pm" | null;
  shippingOption: "standard" | "express" | "pickup" | "two_hour_uber" | null;
};

export async function fetchMySavedCheckout(): Promise<SavedCheckout | null> {
  const { data, error } = await supabase.rpc("dx_my_saved_checkout" as any);
  if (error) {
    console.warn("[saved-checkout] dx_my_saved_checkout failed", error);
    return null;
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const dressId = row.dress_id ?? row.p_dress_id;
  const start = row.start_date ?? row.start ?? row.p_start;
  const end = row.end_date ?? row.end ?? row.p_end ?? start;
  if (!dressId || !start || !end) return null;

  const rawHireOption = row.hire_option ?? row.option;
  const hireOption = rawHireOption === "try_on" || rawHireOption === "tryon"
    ? "tryon"
    : rawHireOption === "b" || rawHireOption === "hire_b"
      ? "b"
      : "a";
  const rawShipping = row.shipping_option ?? row.shipping_type;
  const shippingOption = ["standard", "express", "pickup", "two_hour_uber"].includes(rawShipping)
    ? rawShipping
    : hireOption === "tryon"
      ? "pickup"
      : null;

  return {
    reservationId: row.reservation_id ?? row.id ?? null,
    dressId: String(dressId),
    start: String(start),
    end: String(end),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    hireOption,
    tryOnPeriod: row.try_on_period === "am" || row.try_on_period === "pm" ? row.try_on_period : null,
    shippingOption,
  };
}