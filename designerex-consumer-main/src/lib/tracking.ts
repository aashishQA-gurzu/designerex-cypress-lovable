import { supabase } from "@/integrations/supabase/client";

const COOKIE = "dx_sid";

function getOrCreateSessionId(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]+)"));
  if (match) return decodeURIComponent(match[1]);
  const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE}=${id}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
  return id;
}

export async function recordDressView(dressId: string, viewerId?: string | null) {
  try {
    const session_id = getOrCreateSessionId();
    await supabase.from("dress_views").insert({
      dress_id: dressId,
      viewer_id: viewerId ?? null,
      session_id,
    });
  } catch (e) {
    // non-fatal
    console.warn("dress view tracking failed", e);
  }
}
