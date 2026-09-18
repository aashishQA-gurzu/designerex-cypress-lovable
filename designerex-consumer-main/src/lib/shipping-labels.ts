/** Display-only labels for shipping methods. Never change stored values. */

export const SHIPPING_NAME: Record<string, string> = {
  standard: "Standard post",
  express: "Express post",
  pickup: "Pick Up & Drop Off",
  two_hour_uber: "2-hour delivery",
};

export function shippingName(type?: string | null): string {
  if (!type) return "—";
  return SHIPPING_NAME[type] ?? type;
}

/** Name with price, e.g. "Standard post ($15)". Pickup never shows a price. */
export function shippingLabel(type?: string | null, price?: number | null): string {
  const name = shippingName(type);
  if (!type || type === "pickup") return name;
  const p = Number(price ?? 0);
  if (!Number.isFinite(p) || p <= 0) return name;
  return `${name} ($${p.toFixed(0)})`;
}
