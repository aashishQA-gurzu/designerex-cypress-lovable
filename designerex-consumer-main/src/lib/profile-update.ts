import { supabase } from "@/integrations/supabase/client";

/**
 * Update a profile row, automatically dropping any columns that don't exist
 * in the current schema. Returns { error } where error is null on success.
 */
export async function resilientProfileUpdate(
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  let data = { ...payload };
  for (let i = 0; i < 8; i++) {
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
    if (!error) return { error: null };
    const m = error.message.match(/Could not find the '([^']+)' column/);
    if (m && m[1] in data) {
      delete data[m[1]];
      if (Object.keys(data).length === 0) return { error: null };
      continue;
    }
    return { error };
  }
  return { error: { message: "Profile update failed after retries" } };
}
