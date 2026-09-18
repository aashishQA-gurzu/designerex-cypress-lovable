import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Star, MapPin, MessageCircle, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DressCard, DressCardSkeleton, type DressCardData } from "@/components/home/DressCard";
import { EnquiryModal } from "@/components/messaging/EnquiryModal";
import { cn } from "@/lib/utils";
import { UltraResponsiveBadge } from "@/components/UltraResponsiveBadge";
import { SuperLenderBadge } from "@/components/SuperLenderBadge";
import { SimpleSelect } from "@/components/ui/simple-select";

export const Route = createFileRoute("/lenders/$lenderId")({
  ssr: false,
  component: LenderProfilePage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Couldn't load this profile</h1>
        <p className="mt-3 text-muted-foreground">{(error as Error)?.message ?? "Please try again."}</p>
        <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Lender not found</h1>
        <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
      </div>
    </AppShell>
  ),
});

const REVIEWS_PAGE = 20;

function LenderProfilePage() {
  const { lenderId } = Route.useParams();
  const { user, openAuthModal } = useAuth();
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [reviewsLimit, setReviewsLimit] = useState(REVIEWS_PAGE);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc" | "popular">("newest");


  useEffect(() => {
    console.log("[LenderProfile] mounted", { lenderId });
  }, [lenderId]);

  const { data: lender, isLoading } = useQuery({
    queryKey: ["lender-profile", lenderId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", lenderId)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: listings } = useQuery({
    queryKey: ["lender-listings", lenderId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: dresses } = await supabase
        .from("dresses")
        .select("id, title, advertised_hire_a, lender_id, brand_id, size_id, visit_count, created_at")
        .eq("lender_id", lenderId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      const rows = dresses ?? [];
      if (rows.length === 0) return [] as DressCardData[];
      const brandIds = [...new Set(rows.map((r: any) => r.brand_id).filter(Boolean))];
      const sIds = [...new Set(rows.map((r: any) => r.size_id).filter(Boolean))];
      const dressIds = rows.map((r: any) => r.id);
      const [brandsRes, sizesRes, imagesRes, lenderRes] = await Promise.all([
        brandIds.length ? supabase.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] as any[] }),
        sIds.length ? supabase.from("sizes").select("id, name").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from("dress_images").select("dress_id, url, position").in("dress_id", dressIds),
        supabase.from("profiles").select("is_ultra_responsive, is_super_lender").eq("id", lenderId).maybeSingle(),
      ]);
      const lender: any = lenderRes.data;
      const bMap = new Map((brandsRes.data ?? []).map((b: any) => [b.id, b.name]));
      const sMap = new Map((sizesRes.data ?? []).map((s: any) => [s.id, s.name]));
      const iMap = new Map<string, { url: string; position: number }[]>();
      for (const img of imagesRes.data ?? []) {
        const arr = iMap.get(img.dress_id) ?? [];
        arr.push({ url: img.url, position: img.position ?? 0 });
        iMap.set(img.dress_id, arr);
      }
      return rows.map((d: any): DressCardData & { visit_count: number; created_at: string } => {
        const imgs = (iMap.get(d.id) ?? []).sort((a, b) => a.position - b.position);
        return {
          id: d.id,
          title: d.title,
          advertised_hire_a: d.advertised_hire_a,
          lender_id: d.lender_id,
          brand_name: bMap.get(d.brand_id) ?? null,
          size_name: sMap.get(d.size_id) ?? null,
          image_url: imgs[0]?.url ?? null,
          hire_days: null,
          lender_is_ultra_responsive: !!lender?.is_ultra_responsive,
          lender_is_super_lender: !!lender?.is_super_lender,
          visit_count: d.visit_count ?? 0,
          created_at: d.created_at,
        };
      });
    },
  });

  const { data: reviews } = useQuery({
    queryKey: ["lender-profile-reviews", lenderId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("reviews")
        .select("id, rating, public_review, created_at, reviewer_id")
        .eq("reviewee_id", lenderId)
        .order("created_at", { ascending: false })
        .limit(100);
      const reviewerIds = [...new Set((rows ?? []).map((r: any) => r.reviewer_id).filter(Boolean))];
      const { data: reviewers } = reviewerIds.length
        ? await supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", reviewerIds)
        : { data: [] as any[] };
      const map = new Map((reviewers ?? []).map((p: any) => [p.id, p]));
      return (rows ?? []).map((r: any) => {
        const rev: any = map.get(r.reviewer_id);
        const initial = rev?.last_name?.[0] ? `${rev.first_name ?? ""} ${rev.last_name[0]}.` : rev?.first_name ?? "Anonymous";
        return { ...r, reviewer_name: initial, reviewer_avatar: rev?.avatar_url ?? null };
      });
    },
  });

  const { data: savedSet } = useQuery({
    queryKey: ["saved-dress-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("saved_dresses").select("dress_id").eq("user_id", user!.id);
      return new Set((data ?? []).map((r: { dress_id: string }) => r.dress_id));
    },
  });

  const visibleReviews = useMemo(() => (reviews ?? []).slice(0, reviewsLimit), [reviews, reviewsLimit]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        </div>
      </AppShell>
    );
  }
  if (!lender) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="font-display text-3xl">Lender not found</h1>
          <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
        </div>
      </AppShell>
    );
  }

  const canMessage = !!user && user.id !== lender.id;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {/* Header */}
        <section className="rounded-xl bg-cream p-6 md:p-10 lg:flex lg:items-start lg:gap-10">
          <div className="flex items-start gap-5 lg:flex-1">
            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-muted">
              {lender.avatar_url ? (
                <img src={lender.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-3xl">
                  {(lender.first_name ?? "L")[0]}
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-[11px] tracking-wider-display text-muted-foreground">LENDER</p>
              <h1 className="mt-1 font-display text-3xl">{lender.first_name} {lender.last_name?.[0] ? `${lender.last_name[0]}.` : ""}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {lender.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lender.location}</span>}
                {lender.created_at && <span>Member since {format(parseISO(lender.created_at), "MMMM yyyy")}</span>}
                {lender.response_rate != null && (
                  <span>Response rate {Number(lender.response_rate).toFixed(1)}%</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <SuperLenderBadge active={lender.is_super_lender} />
                <UltraResponsiveBadge active={lender.is_ultra_responsive} />
                {lender.is_top_rated && <Badge>Top Rated</Badge>}
                {lender.fast_delivery_approved && <Badge>Fast Delivery</Badge>}
              </div>
              {(lender.average_rating != null || lender.review_count != null) && (
                <div className="mt-3 flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-current text-ink" />
                  <span className="font-medium">{Number(lender.average_rating ?? 0).toFixed(1)}</span>
                  {lender.review_count != null && (
                    <span className="text-muted-foreground">· {lender.review_count} reviews</span>
                  )}
                </div>
              )}
              {lender.bio && <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink/80">{lender.bio}</p>}
            </div>
          </div>
          <div className="mt-6 lg:mt-0">
            <button
              onClick={() => {
                if (!user) return openAuthModal("login", `/lenders/${lender.id}`);
                if (user.id === lender.id) return;
                setEnquiryOpen(true);
              }}
              disabled={!!user && user.id === lender.id}
              className={cn(
                "inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-medium tracking-wider-display text-background hover:opacity-90",
                user?.id === lender.id && "opacity-40",
              )}
            >
              <MessageCircle className="h-4 w-4" />
              Message {lender.first_name}
            </button>
          </div>
        </section>

        {/* Listings */}
        <section className="mt-16">
          <h2 className="font-display text-2xl">{lender.first_name}'s listings</h2>
          {listings === undefined ? (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <DressCardSkeleton key={i} />)}
            </div>
          ) : listings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No active listings right now.</p>
          ) : (
            <ListingsBlock
              lenderId={lender.id}
              listings={listings as any}
              savedSet={savedSet}
              search={search}
              setSearch={setSearch}
              sort={sort}
              setSort={setSort}
            />
          )}
        </section>


        {/* Reviews */}
        <section className="mt-16">
          <h2 className="font-display text-2xl">Reviews</h2>
          {(reviews ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                {visibleReviews.map((r: any) => (
                  <div key={r.id} className="rounded-lg border border-border p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {r.reviewer_avatar ? (
                          <img src={r.reviewer_avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted" />
                        )}
                        <span className="text-sm font-medium">{r.reviewer_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-current text-ink" : "text-muted")} />
                      ))}
                    </div>
                    {r.public_review && <p className="mt-2 text-sm leading-relaxed text-ink/80">{r.public_review}</p>}
                  </div>
                ))}
              </div>
              {(reviews?.length ?? 0) > visibleReviews.length && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setReviewsLimit((n) => n + REVIEWS_PAGE)}
                    className="rounded-full border border-border px-5 py-2 text-xs hover:bg-muted"
                  >
                    Show more reviews
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {canMessage && (
        <EnquiryModal
          open={enquiryOpen}
          onClose={() => setEnquiryOpen(false)}
          dressId={null}
          lenderId={lender.id}
          lenderFirstName={lender.first_name ?? "the lender"}
          renterId={user.id}
        />
      )}
    </AppShell>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] tracking-wider-display text-background">
      {children}
    </span>
  );
}

type ListingItem = DressCardData & { visit_count: number; created_at: string };

function ListingsBlock({
  lenderId,
  listings,
  savedSet,
  search,
  setSearch,
  sort,
  setSort,
}: {
  lenderId: string;
  listings: ListingItem[];
  savedSet: Set<string> | undefined;
  search: string;
  setSearch: (v: string) => void;
  sort: "newest" | "price_asc" | "price_desc" | "popular";
  setSort: (v: "newest" | "price_asc" | "price_desc" | "popular") => void;
}) {
  const showBar = listings.length >= 6;
  const trimmed = search.trim();

  const { data: searchIds, isFetching: searching } = useQuery({
    queryKey: ["lender-listings-search", lenderId, trimmed],
    enabled: trimmed.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_dresses", {
        p_query: trimmed,
        p_limit: 200,
        p_lender_id: lenderId,
      } as any);
      if (error) {
        console.error("[LenderProfile] search_dresses error", error);
        return [] as string[];
      }
      return ((data ?? []) as any[]).map((r) => r.dress_id ?? r.id).filter(Boolean) as string[];
    },
  });

  const filtered = useMemo(() => {
    let base: ListingItem[];
    if (trimmed.length === 0) {
      base = listings.slice();
    } else if (searching && !searchIds) {
      base = [];
    } else {
      const idSet = new Set(searchIds ?? []);
      const byId = new Map(listings.map((d) => [d.id, d]));
      base = (searchIds ?? [])
        .map((id) => byId.get(id))
        .filter((d): d is ListingItem => !!d);
      // also include any matched ids not in current page-limited listings? skip — listings is the full set
      void idSet;
    }
    base.sort((a, b) => {
      switch (sort) {
        case "price_asc": return (a.advertised_hire_a ?? 0) - (b.advertised_hire_a ?? 0);
        case "price_desc": return (b.advertised_hire_a ?? 0) - (a.advertised_hire_a ?? 0);
        case "popular": return (b.visit_count ?? 0) - (a.visit_count ?? 0);
        case "newest":
        default:
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      }
    });
    return base;
  }, [listings, trimmed, searchIds, searching, sort]);

  return (
    <>
      {showBar && (
        <div className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this lender's dresses..."
                className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:border-pink focus:outline-none"
              />
            </div>
            <SimpleSelect
              value={sort}
              onValueChange={(v) => setSort(v as any)}
              aria-label="Sort listings"
              className="h-auto w-auto rounded-full border-border bg-background px-4 py-2.5 text-sm text-ink"
              options={[
                { value: "newest", label: "Newest" },
                { value: "price_asc", label: "Price: Low to High" },
                { value: "price_desc", label: "Price: High to Low" },
                { value: "popular", label: "Most Popular" },
              ]}
            />
          </div>
          <p className="mt-2 text-right text-xs text-muted-foreground">
            {filtered.length} of {listings.length} dresses
          </p>
        </div>
      )}
      {trimmed.length > 0 && searching && !searchIds ? (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <DressCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>No dresses match your search.</p>
          <button onClick={() => setSearch("")} className="mt-2 text-pink underline">Clear search</button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((d) => (
            <DressCard key={d.id} dress={d} saved={!!savedSet?.has(d.id)} />
          ))}
        </div>
      )}
    </>
  );
}
