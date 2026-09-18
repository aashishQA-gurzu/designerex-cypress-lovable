import { supabase } from "@/integrations/supabase/client";

/**
 * Insert or update a user_addresses row, auto-dropping unknown columns
 * (e.g. city_id) if the schema hasn't been migrated yet.
 */
export async function resilientAddressWrite(
  payload: Record<string, unknown>,
  mode: { update?: string } = {},
): Promise<{ error: { message: string } | null }> {
  let data = { ...payload };
  for (let i = 0; i < 6; i++) {
    const q = mode.update
      ? supabase.from("user_addresses").update(data).eq("id", mode.update)
      : supabase.from("user_addresses").insert(data);
    const { error } = await q;
    if (!error) return { error: null };
    const m = error.message.match(/'([^']+)' column/) ?? error.message.match(/column "?([a-z_]+)"?/i);
    if (m && m[1] in data) { delete data[m[1]]; continue; }
    return { error };
  }
  return { error: { message: "Address write failed after retries" } };
}
