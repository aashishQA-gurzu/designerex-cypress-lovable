import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DressCard, DressCardSkeleton, type DressCardData } from "@/components/home/DressCard";

type Occasion = {
  id: string;
  name: string;
  slug: string;
  landing_page_description: string | null;
  image_url: string | null;
};

export const Route = createFileRoute("/occasions/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} dresses — Designerex` },
      {
        name: "description",
        content: `Rent dresses for ${params.slug}. Designer styles from local lenders.`,
      },
    ],
  }),
  component: OccasionLanding,
});

function OccasionLanding() {
  const { slug } = Route.useParams();
  const { user } = useAuth();

  const occasionQuery = useQuery({
    queryKey: ["occasion", slug],
    queryFn: async (): Promise<Occasion | null> => {
      const { data, error } = await supabase
        .from("occasions")
        .select("id, name, slug, landing_page_description, image_url")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data as Occasion) ?? null;
    },
  });

  const occasion = occasionQuery.data;

  const dressesQuery = useQuery({
    queryKey: ["occasion-dresses", occasion?.id],
    enabled: !!occasion?.id,
    queryFn: async (): Promise<DressCardData[]> => {
      // Mirror Browse: fetch active dresses for this occasion, then hydrate
      // brand/size/image/lender and filter out paused/inactive lenders.
      const { data: rows, error } = await supabase
        .from("dresses")
        .select(
          "id, title, advertised_hire_a, lender_id, brand_id, size_id, created_at",
        )
        .eq("status", "active")
        .eq("occasion_id", occasion!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const baseRows = rows ?? [];
      if (baseRows.length === 0) return [];

      const brandIds = [...new Set(baseRows.map((r: any) => r.brand_id).filter(Boolean))];
      const sizeIds = [...new Set(baseRows.map((r: any) => r.size_id).filter(Boolean))];
      const lenderIds = [...new Set(baseRows.map((r: any) => r.lender_id).filter(Boolean))];
      const dressIds = baseRows.map((r: any) => r.id);

      const [brandsRes, sizesRes, imagesRes, lendersRes] = await Promise.all([
        brandIds.length
          ? supabase.from("brands").select("id, name").in("id", brandIds)
          : Promise.resolve({ data: [] as any[] }),
        sizeIds.length
          ? supabase.from("sizes").select("id, name").in("id", sizeIds)
          : Promise.resolve({ data: [] as any[] }),
        dressIds.length
          ? supabase
              .from("dress_images")
              .select("dress_id, url, position")
              .in("dress_id", dressIds)
          : Promise.resolve({ data: [] as any[] }),
        lenderIds.length
          ? supabase
              .from("profiles")
              .select("id, first_name, hire_period_a_days, status, is_lending_paused")
              .in("id", lenderIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const brandMap = new Map((brandsRes.data ?? []).map((b: any) => [b.id, b.name]));
      const sizeMap = new Map((sizesRes.data ?? []).map((s: any) => [s.id, s.name]));
      const lenderMap = new Map((lendersRes.data ?? []).map((l: any) => [l.id, l]));
      const imgMap = new Map<string, { url: string; position: number }[]>();
      for (const img of imagesRes.data ?? []) {
        const arr = imgMap.get(img.dress_id) ?? [];
        arr.push({ url: img.url, position: img.position ?? 0 });
        imgMap.set(img.dress_id, arr);
      }

      return baseRows
        .filter((r: any) => {
          const l: any = lenderMap.get(r.lender_id);
          return !l || (l.status === "active" && !l.is_lending_paused);
        })
        .map((r: any) => {
          const imgs = (imgMap.get(r.id) ?? []).sort((a, b) => a.position - b.position);
          const lender: any = lenderMap.get(r.lender_id);
          return {
            id: r.id,
            title: r.title,
            advertised_hire_a: r.advertised_hire_a,
            lender_id: r.lender_id,
            brand_name: brandMap.get(r.brand_id) ?? null,
            size_name: sizeMap.get(r.size_id) ?? null,
            image_url: imgs[0]?.url ?? null,
            hire_days: lender?.hire_period_a_days ?? null,
          };
        });
    },
  });

  const { data: savedIds } = useQuery({
    queryKey: ["saved-dress-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("saved_dresses")
        .select("dress_id")
        .eq("user_id", user!.id);
      return new Set((data ?? []).map((r: { dress_id: string }) => r.dress_id));
    },
  });

  if (occasionQuery.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1400px] px-6 py-16 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  if (!occasion) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1400px] px-6 py-16 text-center">
          <h1 className="font-serif text-3xl">Occasion not found</h1>
          <Link to="/occasions" className="mt-4 inline-block text-sm text-pink underline">
            Back to occasions
          </Link>
        </div>
      </AppShell>
    );
  }

  const dresses = dressesQuery.data ?? [];

  return (
    <AppShell>
      <section className="bg-cream">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-16 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center">
            <p className="text-[10px] tracking-wider-display text-pink">OCCASION</p>
            <h1 className="mt-3 font-serif text-4xl md:text-6xl">{occasion.name}</h1>
            {occasion.landing_page_description && (
              <p className="mt-4 text-muted-foreground md:text-lg">
                {occasion.landing_page_description}
              </p>
            )}
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-pink-soft">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="px-6 text-center font-display text-3xl text-ink/60">
                {occasion.name}
              </span>
            </div>
            {occasion.image_url && (
              <img
                src={occasion.image_url}
                alt={occasion.name}
                className="relative h-full w-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  console.error(
                    `[occasion ${occasion.slug}] image failed: ${img.src}`,
                  );
                  img.style.display = "none";
                }}
              />
            )}
          </div>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-[1400px] px-6 py-12">
          {dressesQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <DressCardSkeleton key={i} />
              ))}
            </div>
          ) : dresses.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No dresses available for this occasion yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {dresses.map((d) => (
                <DressCard
                  key={d.id}
                  dress={d}
                  saved={savedIds?.has(d.id) ?? false}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
