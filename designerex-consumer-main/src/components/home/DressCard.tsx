import { Link, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { recordDressView } from "@/lib/tracking";
import { UltraResponsiveBadge } from "@/components/UltraResponsiveBadge";
import { SuperLenderBadge } from "@/components/SuperLenderBadge";

export type DressCardData = {
  id: string;
  title: string;
  advertised_hire_a: number | null;
  lender_id: string;
  brand_name: string | null;
  size_name: string | null;
  image_url: string | null;
  hire_days: number | null;
  lender_is_ultra_responsive?: boolean | null;
  lender_is_super_lender?: boolean | null;
};

export function DressCard({ dress, saved, onSavedChange }: {
  dress: DressCardData;
  saved: boolean;
  onSavedChange?: (saved: boolean) => void;
}) {
  const { user, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const [isSaved, setIsSaved] = useState(saved);
  const [busy, setBusy] = useState(false);

  useEffect(() => setIsSaved(saved), [saved]);

  const toggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      openAuthModal("login");
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !isSaved;
    setIsSaved(next);
    try {
      if (next) {
        await supabase
          .from("saved_dresses")
          .upsert(
            { user_id: user.id, dress_id: dress.id },
            { onConflict: "user_id,dress_id", ignoreDuplicates: true },
          );
      } else {
        await supabase.from("saved_dresses").delete().eq("user_id", user.id).eq("dress_id", dress.id);
      }
      onSavedChange?.(next);
    } catch (err) {
      console.error(err);
      setIsSaved(!next);
    } finally {
      setBusy(false);
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    recordDressView(dress.id, user?.id);
    navigate({ to: "/dresses/$id", params: { id: dress.id } });
  };

  return (
    <a
      href={`/dresses/${dress.id}`}
      onClick={handleClick}
      className="group block"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-muted">
        {dress.image_url ? (
          <img
            src={dress.image_url}
            alt={dress.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        <button
          type="button"
          aria-label={isSaved ? "Unsave" : "Save"}
          onClick={toggleSave}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur transition-colors hover:bg-white"
        >
          <Heart
            className={`h-4 w-4 transition-colors ${isSaved ? "fill-pink text-pink" : "text-ink/70"}`}
          />
        </button>
        {(dress.lender_is_ultra_responsive || dress.lender_is_super_lender) && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            <SuperLenderBadge active={dress.lender_is_super_lender} size="sm" />
            <UltraResponsiveBadge active={dress.lender_is_ultra_responsive} size="sm" />
          </div>
        )}
      </div>
      <div className="mt-3 px-0.5">
        <p className="text-[10px] tracking-wider-display text-muted-foreground">
          {dress.brand_name ?? "DESIGNER"}
        </p>
        <h3 className="mt-1 line-clamp-1 font-display text-base text-ink">{dress.title}</h3>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{dress.size_name ? `Size ${dress.size_name}` : ""}</span>
          <span className="font-medium text-pink">
            {dress.advertised_hire_a != null ? `$${Math.round(Number(dress.advertised_hire_a))}` : ""}
            {dress.hire_days ? ` / ${dress.hire_days} days` : ""}
          </span>
        </div>
      </div>
    </a>
  );
}

export function DressCardSkeleton() {
  return (
    <div>
      <div className="aspect-[4/5] animate-pulse rounded-md bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-2 w-16 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
