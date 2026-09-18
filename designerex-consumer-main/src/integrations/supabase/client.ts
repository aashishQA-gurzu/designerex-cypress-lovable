import { createClient } from "@supabase/supabase-js";

// Which Supabase project this app talks to is configuration, not source, so it is read
// from the environment. That lets a local build, a development build and the production
// build be the same code pointed somewhere different.
//
// The fallbacks below are the values that were previously written into this file, and they
// are permanent rather than a step towards removing them. Lovable builds this branch, and
// Lovable gates environment variables behind its Enterprise tier, confirmed by Designerex
// on 5 September 2026. So a build with nothing set has to behave exactly as this file did
// before, and it does: same project, same key, same request.
//
// Throwing on a missing variable would be right in a repository whose builds we control.
// Here it would mean the next Lovable build fails at import, and sixty two files import
// this module.
//
// The committed `.env` also sets these two names and takes effect before the fallbacks do,
// which is why it is corrected in the same change. `.env.local` overrides it locally and
// a real environment variable overrides both, which is how the development build points
// itself at Designerex Dev. See `.env.local.example`.
// The Lovable preview sandbox still injects environment variables for the retired project
// `qlauiscizowpxodpcxdb`, whose hostname no longer resolves in DNS. Those injected values win
// over `.env`, so the preview pointed at a dead backend while production was fine. Any
// configuration naming the retired project is therefore ignored in favour of the values below.
const RETIRED_PROJECT_REF = "qlauiscizowpxodpcxdb";

const DEFAULT_SUPABASE_URL = "https://lgyecdudufnmrkzikvwd.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zdq4HWe6brEBre7IMw-i6g_jLDjDxQA";

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const envIsRetired = !!envUrl && envUrl.includes(RETIRED_PROJECT_REF);

export const SUPABASE_URL = envIsRetired ? DEFAULT_SUPABASE_URL : envUrl ?? DEFAULT_SUPABASE_URL;

export const SUPABASE_PUBLISHABLE_KEY = envIsRetired
  ? DEFAULT_SUPABASE_PUBLISHABLE_KEY
  : envKey ?? DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
