import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function LenderGate({ children }: { children: React.ReactNode }) {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!user) return null; // _authenticated guard handles redirect

  if (profile?.is_lender) return <>{children}</>;

  const enable = async () => {
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ is_lender: true }).eq("id", user.id);
    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    await refreshProfile();
    navigate({ to: window.location.pathname });
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
        <div className="bg-pink-soft px-10 py-10 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink text-pink-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-serif text-4xl">Want to lend your dresses?</h1>
        </div>
        <div className="px-10 py-8 text-center">
          <p className="text-muted-foreground">
            Turn the dresses sitting unworn in your wardrobe into income. Set your own prices,
            choose when you lend, and reach thousands of renters across Australia.
          </p>
          <button onClick={enable} disabled={loading} className="btn-primary mt-8">
            {loading ? "Enabling..." : "Yes, enable lending"}
          </button>
        </div>
      </div>
    </div>
  );
}
