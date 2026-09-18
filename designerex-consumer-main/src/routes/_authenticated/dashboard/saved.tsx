import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DressCard, DressCardSkeleton, type DressCardData } from "@/components/home/DressCard";

export const Route = createFileRoute("/_authenticated/dashboard/saved")({
  ssr: false,
  component: SavedDresses,
});

function SavedDresses() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: cards, isPending: savedLoading } = useQuery({
    queryKey: ["dashboard-saved", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_dresses")
        .select(
          "dress_id, created_at, dresses(*, advertised_hire_a, dress_images(url, position), brands(name), sizes(name), profiles:lender_id(hire_period_a_days, is_ultra_responsive, is_super_lender, status, is_lending_paused))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const out: DressCardData[] = [];
      for (const row of (data ?? []) as any[]) {
        const d = row.dresses;
        if (!d) continue;
        const imgs = (d.dress_images ?? []).slice().sort(
          (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
        );
        out.push({
          id: d.id,
          title: d.title,
          advertised_hire_a: d.advertised_hire_a,
          lender_id: d.lender_id,
          brand_name: d.brands?.name ?? null,
          size_name: d.sizes?.name ?? null,
          image_url: imgs[0]?.url ?? null,
          hire_days: d.profiles?.hire_period_a_days ?? null,
          lender_is_ultra_responsive: !!d.profiles?.is_ultra_responsive,
          lender_is_super_lender: !!d.profiles?.is_super_lender,
        });
      }
      return out;
    },
  });

  const handleSavedChange = (id: string, saved: boolean) => {
    if (saved) return;
    qc.setQueryData(["dashboard-saved", user?.id], (prev: DressCardData[] | undefined) =>
      (prev ?? []).filter((c) => c.id !== id),
    );
    qc.setQueryData(["saved-dress-ids", user?.id], (prev: Set<string> | undefined) => {
      if (!prev) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div>
      <h2 className="mb-6 font-display text-3xl">Saved dresses</h2>
      {savedLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <DressCardSkeleton key={i} />)}
        </div>
      ) : (cards ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed bg-white px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No saved dresses yet — heart any dress to add it here.</p>
          <Link to="/browse" className="btn-primary mt-4 inline-block text-xs">Browse dresses</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(cards ?? []).map((c) => (
            <DressCard key={c.id} dress={c} saved={true} onSavedChange={(s) => handleSavedChange(c.id, s)} />
          ))}
        </div>
      )}
    </div>
  );
}
