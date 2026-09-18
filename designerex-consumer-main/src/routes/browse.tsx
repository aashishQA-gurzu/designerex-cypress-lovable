import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CalendarIcon, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { format, parse } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DressCard, DressCardSkeleton, type DressCardData } from "@/components/home/DressCard";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "@/components/ui/simple-select";


type SortKey = "popular" | "newest" | "price_asc" | "price_desc" | "best_match";

type BrowseSearch = {
  search?: string;
  designer?: string;
  occasion?: string;
  type?: string;
  size?: string;
  color?: string;
  neckline?: string;
  sleeve?: string;
  back?: string;
  min?: number;
  max?: number;
  twohour?: boolean;
  tryon?: boolean;
  super?: boolean;
  toprated?: boolean;
  fast?: boolean;
  sort?: SortKey;
  start?: string;
  end?: string;
  exclude?: string;
};

const slugifyAttr = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");



const PAGE_SIZE = 30;
const PRICE_MAX = 500;

export const Route = createFileRoute("/browse")({
  validateSearch: (s: Record<string, unknown>): BrowseSearch => ({
    search: (s.search as string) || (s.q as string) || undefined,
    designer: (s.designer as string) || undefined,
    occasion: (s.occasion as string) || undefined,
    type: (s.type as string) || undefined,
    size: (s.size as string) || undefined,
    color: (s.color as string) || undefined,
    neckline: (s.neckline as string) || undefined,
    sleeve: (s.sleeve as string) || undefined,
    back: (s.back as string) || undefined,
    min: s.min != null ? Number(s.min) : undefined,
    max: s.max != null ? Number(s.max) : undefined,
    twohour: s.twohour === true || s.twohour === "true" ? true : undefined,

    tryon: s.tryon === true || s.tryon === "true" ? true : undefined,
    super: s.super === true || s.super === "true" ? true : undefined,
    toprated: s.toprated === true || s.toprated === "true" ? true : undefined,
    fast: s.fast === true || s.fast === "true" ? true : undefined,
    sort: ((): SortKey | undefined => {
      const raw = s.sort as string | undefined;
      if (!raw) return undefined;
      if (raw === "new") return "newest";
      if (raw === "relevance") return undefined;
      return raw as SortKey;
    })(),
    start: typeof s.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.start) ? s.start : undefined,
    end: typeof s.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.end) ? s.end : undefined,
    exclude: typeof s.exclude === "string" ? s.exclude : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Browse designer dresses for rent — Designerex" },
      { name: "description", content: "Browse and filter thousands of designer dresses available for rental across Australia." },
      { property: "og:title", content: "Browse — Designerex" },
      { property: "og:description", content: "Find your next outfit. Filter by designer, size, colour, occasion and more." },
    ],
  }),
  component: BrowsePage,
});

/* ---------- helpers ---------- */

const csv = (v?: string): string[] => (v ? v.split(",").filter(Boolean) : []);
const toCsv = (arr: string[]): string | undefined => (arr.length ? arr.join(",") : undefined);

const parseIsoDate = (iso: string): Date => parse(iso, "yyyy-MM-dd", new Date());
const toIsoDate = (d: Date): string => format(d, "yyyy-MM-dd");
const fmtDateShort = (iso: string): string => {
  try { return format(parseIsoDate(iso), "d MMM"); } catch { return iso; }
};


/* ---------- lookup hooks (cached) ---------- */

function useLookups() {
  return useQuery({
    queryKey: ["browse-lookups"],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const [brands, occasions, dressTypes, sizes, colors, attributes] = await Promise.all([
        supabase.from("brands").select("id, name, slug").order("name"),
        supabase.from("occasions").select("id, name, slug").order("name"),
        supabase.from("dress_types").select("id, name, slug").order("name"),
        supabase.from("sizes").select("id, name, slug, sort_order").order("sort_order", { ascending: true }),
        supabase.from("colors").select("id, name, slug, parent_color_id"),
        supabase
          .from("attributes" as any)
          .select("id, name, category")
          .in("category", ["neckline", "sleeve", "back_style"])
          .order("category")
          .order("name"),
      ]);
      const attrRows = ((attributes as any).data ?? []) as { id: string; name: string; category: string }[];
      const attrsWithSlug = attrRows.map((a) => ({ ...a, slug: slugifyAttr(a.name) }));
      return {
        brands: brands.data ?? [],
        occasions: occasions.data ?? [],
        dressTypes: dressTypes.data ?? [],
        sizes: sizes.data ?? [],
        colors: colors.data ?? [],
        necklines: attrsWithSlug.filter((a) => a.category === "neckline"),
        sleeves: attrsWithSlug.filter((a) => a.category === "sleeve"),
        backStyles: attrsWithSlug.filter((a) => a.category === "back_style"),
      };
    },
  });
}


/* ---------- main page ---------- */

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/browse" });
  const { user } = useAuth();
  const lookups = useLookups();
  useEffect(() => {
    console.log("[Browse] search params", search);
  }, [search]);

  const sort: SortKey = search.sort ?? (search.search ? "best_match" : "popular");

  const updateSearch = useCallback(
    (patch: Partial<BrowseSearch>) => {
      navigate({ search: (prev: BrowseSearch) => ({ ...prev, ...patch }), replace: false });
    },
    [navigate],
  );

  const clearAll = () => navigate({ search: {} });

  // Resolve slugs → ids for filters
  const designerIds = useMemo(() => {
    const slugs = csv(search.designer);
    return (lookups.data?.brands ?? []).filter((b: any) => slugs.includes(b.slug)).map((b: any) => b.id);
  }, [search.designer, lookups.data]);
  const occasionIds = useMemo(() => {
    const slugs = csv(search.occasion);
    return (lookups.data?.occasions ?? []).filter((o: any) => slugs.includes(o.slug)).map((o: any) => o.id);
  }, [search.occasion, lookups.data]);
  const typeIds = useMemo(() => {
    const slugs = csv(search.type);
    return (lookups.data?.dressTypes ?? []).filter((t: any) => slugs.includes(t.slug)).map((t: any) => t.id);
  }, [search.type, lookups.data]);
  const sizeIds = useMemo(() => {
    const slugs = csv(search.size);
    return (lookups.data?.sizes ?? []).filter((s: any) => slugs.includes(s.slug)).map((s: any) => s.id);
  }, [search.size, lookups.data]);
  const colorIds = useMemo(() => {
    const slugs = csv(search.color);
    const cols = lookups.data?.colors ?? [];
    const selectedParents = cols.filter((c: any) => slugs.includes(c.slug));
    const expanded = new Set<string>();
    for (const c of selectedParents) {
      expanded.add(c.id);
      // include children
      for (const child of cols) if (child.parent_color_id === c.id) expanded.add(child.id);
    }
    return [...expanded];
  }, [search.color, lookups.data]);
  const attributeIds = useMemo(() => {
    const necklineSlugs = new Set(csv(search.neckline));
    const sleeveSlugs = new Set(csv(search.sleeve));
    const backSlugs = new Set(csv(search.back));
    const ids: string[] = [];
    for (const a of lookups.data?.necklines ?? []) if (necklineSlugs.has(a.slug)) ids.push(a.id);
    for (const a of lookups.data?.sleeves ?? []) if (sleeveSlugs.has(a.slug)) ids.push(a.id);
    for (const a of lookups.data?.backStyles ?? []) if (backSlugs.has(a.slug)) ids.push(a.id);
    return ids;
  }, [search.neckline, search.sleeve, search.back, lookups.data]);


  /* ---------- results query (infinite) ---------- */

  const results = useInfiniteQuery({
    queryKey: [
      "browse",
      search.search ?? "",
      designerIds.sort().join(","),
      occasionIds.sort().join(","),
      typeIds.sort().join(","),
      sizeIds.sort().join(","),
      colorIds.sort().join(","),
      attributeIds.slice().sort().join(","),

      search.min ?? 0,
      search.max ?? PRICE_MAX,
      search.twohour ?? false,
      search.tryon ?? false,
      search.super ?? false,
      search.toprated ?? false,
      search.fast ?? false,
      sort,
      search.start ?? "",
      search.end ?? "",
      search.exclude ?? "",
    ],
    enabled: lookups.isSuccess,
    initialPageParam: 0,
    getNextPageParam: (last: any) => (last.hasMore ? last.nextOffset : undefined),

    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam as number;

      // Search via FTS RPC if query present
      let searchIds: string[] | null = null;
      if (search.search && search.search.trim().length > 0) {
        const p_query = search.search.trim();
        const { data: sRows, error: sErr } = await supabase.rpc("search_dresses", {
          p_query,
          p_limit: 500,
        });
        console.log("[Search] RPC call", { p_query, results: sRows?.length, error: sErr });
        const ids: string[] = (sRows ?? []).map((r: any) => r.dress_id ?? r.id).filter(Boolean);
        searchIds = ids;
        if (ids.length === 0) return { rows: [], hasMore: false, nextOffset: offset };
      }

      // Pre-filter by dress_colors / dress_attributes / dress_shipping_options when needed
      let intersectIds: Set<string> | null = null;
      const intersect = (ids: string[]) => {
        const s = new Set(ids);
        intersectIds = intersectIds ? new Set([...intersectIds].filter((x) => s.has(x))) : s;
      };

      const hasDateRange = !!(search.start && search.end);



      if (colorIds.length > 0) {
        const { data } = await supabase
          .from("dress_colors")
          .select("dress_id")
          .in("color_id", colorIds);
        intersect((data ?? []).map((r: any) => r.dress_id));
        if (intersectIds!.size === 0) return { rows: [], hasMore: false, nextOffset: offset };
      }

      if (attributeIds.length > 0) {
        const { data } = await supabase
          .from("dress_attributes" as any)
          .select("dress_id")
          .in("attribute_id", attributeIds);
        intersect(((data ?? []) as any[]).map((r: any) => r.dress_id));
        if (intersectIds!.size === 0) return { rows: [], hasMore: false, nextOffset: offset };
      }


      if (search.twohour) {
        const { data } = await supabase
          .from("dress_shipping_options")
          .select("dress_id")
          .eq("shipping_type", "two_hour_uber");
        intersect((data ?? []).map((r: any) => r.dress_id));
        if (intersectIds!.size === 0) return { rows: [], hasMore: false, nextOffset: offset };
      }

      // Lender filters
      let lenderIdFilter: string[] | null = null;
      if (search.super || search.toprated || search.fast) {
        let q = supabase.from("profiles").select("id");
        if (search.super) q = q.eq("is_super_lender", true);
        if (search.toprated) q = q.eq("is_top_rated", true);
        if (search.fast) q = q.eq("fast_delivery_approved", true);
        const { data } = await q;
        lenderIdFilter = (data ?? []).map((p: any) => p.id);
        if (lenderIdFilter.length === 0) return { rows: [], hasMore: false, nextOffset: offset };
      }

      const baseSelect = "id, title, hire_price_a, advertised_hire_a, lender_id, brand_id, size_id, created_at, try_on_available, visit_count";
      let q: any = hasDateRange
        ? supabase
            .rpc(
              "dx_dresses_available" as any,
              { p_start: search.start, p_end: search.end },
              { count: "exact" },
            )
            .select(baseSelect)
            .eq("status", "active")
        : supabase
            .from("dresses")
            .select(baseSelect, { count: "exact" })
            .eq("status", "active");


      if (designerIds.length) q = q.in("brand_id", designerIds);
      if (typeIds.length) q = q.in("dress_type_id", typeIds);
      if (sizeIds.length) q = q.in("size_id", sizeIds);
      if (occasionIds.length) {
        q = q.in("occasion_id", occasionIds);
      }
      if (search.tryon) q = q.eq("try_on_available", true);
      if (search.exclude) q = q.neq("id", search.exclude);

      if (search.min != null) q = q.gte("advertised_hire_a", search.min);
      if (search.max != null && search.max < PRICE_MAX) q = q.lte("advertised_hire_a", search.max);
      if (lenderIdFilter) q = q.in("lender_id", lenderIdFilter);

      if (searchIds && intersectIds) {
        const sIdsArr: string[] = searchIds;
        const both = sIdsArr.filter((id) => intersectIds!.has(id));
        if (both.length === 0) return { rows: [], hasMore: false, nextOffset: offset };
        q = q.in("id", both);
      } else if (searchIds) {
        q = q.in("id", searchIds);
      } else if (intersectIds) {
        q = q.in("id", [...intersectIds]);
      }

      // Sorting
      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "price_asc") q = q.order("advertised_hire_a", { ascending: true });
      else if (sort === "price_desc") q = q.order("advertised_hire_a", { ascending: false });
      else if (sort === "popular") q = q.order("visit_count", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      else q = q.order("created_at", { ascending: false }); // best_match fallback (FTS already ordered)

      q = q.range(offset, offset + PAGE_SIZE - 1);
      const { data: rows, count } = await q;
      const baseRows = rows ?? [];

      let sortedRows = baseRows;
      if (sort === "best_match" && searchIds) {
        const order = new Map(searchIds.map((id, i) => [id, i]));
        sortedRows = [...baseRows].sort(
          (a: any, b: any) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
        );
      }

      // Hydrate brand/size/image/lender
      const brandIds = [...new Set(sortedRows.map((r: any) => r.brand_id).filter(Boolean))];
      const sIds = [...new Set(sortedRows.map((r: any) => r.size_id).filter(Boolean))];
      const lenderIds = [...new Set(sortedRows.map((r: any) => r.lender_id).filter(Boolean))];
      const dressIds = sortedRows.map((r: any) => r.id);
      const [brandsRes, sizesRes, imagesRes, lendersRes] = await Promise.all([
        brandIds.length ? supabase.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] as any[] }),
        sIds.length ? supabase.from("sizes").select("id, name").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
        dressIds.length ? supabase.from("dress_images").select("dress_id, url, position").in("dress_id", dressIds) : Promise.resolve({ data: [] as any[] }),
        lenderIds.length
          ? supabase
              .from("profiles")
              .select("id, first_name, hire_period_a_days, status, is_lending_paused, is_ultra_responsive, is_super_lender")
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

      const cards: DressCardData[] = sortedRows
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
            lender_is_ultra_responsive: !!lender?.is_ultra_responsive,
            lender_is_super_lender: !!lender?.is_super_lender,
          };
        });

      const total = count ?? null;
      const nextOffset = offset + PAGE_SIZE;
      const hasMore = total != null ? nextOffset < total : baseRows.length === PAGE_SIZE;
      return { rows: cards, hasMore, nextOffset, total };
    },
  });

  const allRows: DressCardData[] = useMemo(
    () => (results.data?.pages ?? []).flatMap((p: any) => p.rows),
    [results.data],
  );
  const total = results.data?.pages?.[0]?.total ?? (results.isPending ? null : allRows.length);

  // Saved set
  const { data: savedIds } = useQuery({
    queryKey: ["saved-dress-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("saved_dresses").select("dress_id").eq("user_id", user!.id);
      return new Set((data ?? []).map((r: { dress_id: string }) => r.dress_id));
    },
  });

  const remaining = useMemo(() => {
    const t = results.data?.pages?.[0]?.total;
    if (typeof t !== "number") return null;
    return Math.max(0, t - allRows.length);
  }, [results.data, allRows.length]);


  /* ---------- chips ---------- */
  const loadingResults = results.isPending || (results.isFetching && allRows.length === 0);

  const chips = useMemo(() => {
    const out: { label: string; onRemove: () => void }[] = [];
    const lk = lookups.data;
    if (!lk) return out;
    for (const slug of csv(search.designer)) {
      const b = lk.brands.find((x: any) => x.slug === slug);
      if (b) out.push({ label: b.name, onRemove: () => updateSearch({ designer: toCsv(csv(search.designer).filter((s) => s !== slug)) }) });
    }
    for (const slug of csv(search.occasion)) {
      const o = lk.occasions.find((x: any) => x.slug === slug);
      if (o) out.push({ label: o.name, onRemove: () => updateSearch({ occasion: toCsv(csv(search.occasion).filter((s) => s !== slug)) }) });
    }
    for (const slug of csv(search.type)) {
      const t = lk.dressTypes.find((x: any) => x.slug === slug);
      if (t) out.push({ label: t.name, onRemove: () => updateSearch({ type: toCsv(csv(search.type).filter((s) => s !== slug)) }) });
    }
    for (const slug of csv(search.size)) {
      const s = lk.sizes.find((x: any) => x.slug === slug);
      if (s) out.push({ label: `Size ${s.name}`, onRemove: () => updateSearch({ size: toCsv(csv(search.size).filter((x) => x !== slug)) }) });
    }
    for (const slug of csv(search.color)) {
      const c = lk.colors.find((x: any) => x.slug === slug);
      if (c) out.push({ label: c.name, onRemove: () => updateSearch({ color: toCsv(csv(search.color).filter((s) => s !== slug)) }) });
    }
    const attrSections: { key: "neckline" | "sleeve" | "back"; list: { id: string; name: string; slug: string }[] }[] = [
      { key: "neckline", list: lk.necklines ?? [] },
      { key: "sleeve", list: lk.sleeves ?? [] },
      { key: "back", list: lk.backStyles ?? [] },
    ];
    for (const { key, list } of attrSections) {
      for (const slug of csv(search[key])) {
        const a = list.find((x) => x.slug === slug);
        if (a) out.push({
          label: a.name,
          onRemove: () => updateSearch({ [key]: toCsv(csv(search[key]).filter((s) => s !== slug)) } as Partial<BrowseSearch>),
        });
      }
    }

    if (search.min != null || (search.max != null && search.max < PRICE_MAX)) {
      out.push({
        label: `$${search.min ?? 0}–$${search.max ?? PRICE_MAX}`,
        onRemove: () => updateSearch({ min: undefined, max: undefined }),
      });
    }
    if (search.twohour) out.push({ label: "2hr Delivery", onRemove: () => updateSearch({ twohour: undefined }) });
    if (search.tryon) out.push({ label: "Try-on", onRemove: () => updateSearch({ tryon: undefined }) });
    if (search.super) out.push({ label: "Super Lender", onRemove: () => updateSearch({ super: undefined }) });
    if (search.toprated) out.push({ label: "Top Rated", onRemove: () => updateSearch({ toprated: undefined }) });
    if (search.fast) out.push({ label: "Fast Delivery", onRemove: () => updateSearch({ fast: undefined }) });
    if (search.start && search.end) {
      out.push({
        label: `${fmtDateShort(search.start)} – ${fmtDateShort(search.end)}`,
        onRemove: () => updateSearch({ start: undefined, end: undefined }),
      });
    }

    return out;
  }, [search, lookups.data, updateSearch]);

  /* ---------- search input ---------- */
  const [searchInput, setSearchInput] = useState(search.search ?? "");
  useEffect(() => {
    setSearchInput(search.search ?? "");
  }, [search.search]);
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (search.search ?? "")) {
        updateSearch({ search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "newest", label: "New In" },
    { key: "popular", label: "Most Popular" },
    { key: "price_desc", label: "Price high to low" },
    { key: "price_asc", label: "Price low to high" },
  ];

  const occasionSlug = csv(search.occasion)[0] ?? "";
  const typeSlug = csv(search.type)[0] ?? "";

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-10 md:px-8 md:py-14">
        {/* Title + Filter pill */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-display text-4xl leading-[1.02] md:text-6xl">
              Designer dresses,
              <br />
              <span className="font-serif italic" style={{ color: "var(--rose)" }}>
                endless opportunities.
              </span>
            </h1>
            <p className="mt-4 max-w-md text-sm text-ink-muted md:text-base">
              Rent from our community and find your perfect look.
            </p>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button className="inline-flex shrink-0 items-center gap-2 rounded-full bg-bg-tint px-5 py-2.5 text-sm font-medium text-ink hover:border-rose">
                <SlidersHorizontal className="h-4 w-4" />
                Filter{chips.length > 0 ? ` · ${chips.length}` : ""}
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full overflow-y-auto sm:max-w-md"
            >
              <div className="flex items-center justify-between pb-4">
                <h2 className="font-display text-2xl">Filter</h2>
                {chips.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-magenta underline">
                    Clear all
                  </button>
                )}
              </div>
              <FilterPanel search={search} update={updateSearch} lookups={lookups.data} />
            </SheetContent>
          </Sheet>
        </div>

        {/* Search bar */}
        <div className="relative mt-8 max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by designer, style, occasion…"
            className="w-full rounded-full border border-border bg-surface py-3 pl-10 pr-10 text-sm outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/20"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort row */}
        <div className="mt-8 flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <span className="text-ink-muted">Sorting options:</span>

            <SortShortcut
              label={occasionSlug ? lookups.data?.occasions.find((o: any) => o.slug === occasionSlug)?.name ?? "Occasion" : "Occasion"}
              value={occasionSlug}
              options={(lookups.data?.occasions ?? []).map((o: any) => ({ value: o.slug, label: o.name }))}
              onChange={(v) => updateSearch({ occasion: v || undefined })}
            />
            <SortShortcut
              label={typeSlug ? lookups.data?.dressTypes.find((t: any) => t.slug === typeSlug)?.name ?? "Edit" : "Edit"}
              value={typeSlug}
              options={(lookups.data?.dressTypes ?? []).map((t: any) => ({ value: t.slug, label: t.name }))}
              onChange={(v) => updateSearch({ type: v || undefined })}
            />

            {sortOptions.map((o) => {
              const active = sort === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => updateSearch({ sort: o.key })}
                  className={`relative whitespace-nowrap pb-1 transition-colors ${
                    active ? "text-magenta" : "text-ink hover:text-magenta"
                  }`}
                >
                  {o.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-px h-[2px] bg-magenta" />
                  )}
                </button>
              );
            })}

            <DateRangePicker
              start={search.start}
              end={search.end}
              onChange={(start, end) => updateSearch({ start, end })}
            />
          </div>


          <p className="text-sm text-ink-muted">
            {loadingResults || total == null
              ? "Loading…"
              : `${total} dress${total === 1 ? "" : "es"}`}
          </p>
        </div>

        {/* Chips */}
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {chips.map((c, i) => (
              <button
                key={i}
                onClick={c.onRemove}
                className="inline-flex items-center gap-1.5 rounded-full bg-bg-tint px-3 py-1 text-xs text-ink hover:bg-pink-soft"
              >
                {c.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            {chips.length >= 2 && (
              <button onClick={clearAll} className="ml-1 text-xs text-magenta underline">
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="mt-8 min-w-0">
          {loadingResults ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => <DressCardSkeleton key={i} />)}
            </div>
          ) : allRows.length === 0 ? (
            <EmptyState onClear={clearAll} />
          ) : (
            <>
              <div
                className={`grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4 ${results.isFetching ? "opacity-70 transition-opacity" : ""}`}
              >
                {allRows.map((d) => (
                  <DressCard
                    key={d.id}
                    dress={d}
                    saved={savedIds?.has(d.id) ?? false}
                  />
                ))}
              </div>
              {results.hasNextPage && (
                <div className="mt-10 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => results.fetchNextPage()}
                    disabled={results.isFetchingNextPage}
                    className="min-w-[220px]"
                  >
                    {results.isFetchingNextPage
                      ? "Loading…"
                      : remaining != null
                        ? `Load more (${remaining} remaining)`
                        : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- sort shortcut dropdown ---------- */

function SortShortcut({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const active = !!value;
  return (
    <div className="relative">
      <SimpleSelect
        value={value}
        onValueChange={onChange}
        aria-label={label}
        options={[{ value: "", label: label }, ...options]}
        className={`h-auto w-auto min-w-0 gap-1 border-0 bg-transparent px-0 pb-1 text-sm shadow-none focus:ring-0 focus:ring-offset-0 ${
          active ? "text-magenta" : "text-ink"
        }`}
      />
      {active && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-magenta" />}
    </div>
  );
}

/* ---------- date range picker ---------- */

function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start?: string;
  end?: string;
  onChange: (start: string | undefined, end: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const range: DateRange | undefined =
    start && end
      ? { from: parseIsoDate(start), to: parseIsoDate(end) }
      : start
        ? { from: parseIsoDate(start), to: undefined }
        : undefined;
  const active = !!(start && end);
  const label = active
    ? `${fmtDateShort(start!)} – ${fmtDateShort(end!)}`
    : "Any dates";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex items-center gap-1.5 whitespace-nowrap pb-1 text-sm transition-colors",
            active ? "text-magenta" : "text-ink hover:text-magenta",
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}
          {active && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-magenta" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={(r) => {
            const s = r?.from ? toIsoDate(r.from) : undefined;
            const e = r?.to ? toIsoDate(r.to) : undefined;
            onChange(s, e);
            if (s && e) setOpen(false);
          }}
          disabled={{ before: today }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined, undefined)}
            disabled={!start && !end}
          >
            Clear dates
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}



/* ---------- filter panel ---------- */

function AttributeSection({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; name: string; slug: string }[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <FilterSection title={title}>
      <div className="max-h-56 overflow-y-auto pr-1">
        {items.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={selected.has(a.slug)}
              onChange={() => onToggle(a.slug)}
              className="h-4 w-4 rounded border-input accent-pink"
            />
            <span>{a.name}</span>
          </label>
        ))}
      </div>
    </FilterSection>
  );
}

function FilterSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {

  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border py-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-medium uppercase tracking-wider-display">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function FilterPanel({
  search,
  update,
  lookups,
}: {
  search: BrowseSearch;
  update: (p: Partial<BrowseSearch>) => void;
  lookups?: {
    brands: any[];
    occasions: any[];
    dressTypes: any[];
    sizes: any[];
    colors: any[];
    necklines: { id: string; name: string; slug: string }[];
    sleeves: { id: string; name: string; slug: string }[];
    backStyles: { id: string; name: string; slug: string }[];
  };

}) {
  if (!lookups) return null;

  const toggleCsv = (key: keyof BrowseSearch, slug: string) => {
    const cur = csv(search[key] as string | undefined);
    const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
    update({ [key]: toCsv(next) } as Partial<BrowseSearch>);
  };

  const [designerSearch, setDesignerSearch] = useState("");
  const filteredBrands = lookups.brands.filter((b: any) =>
    b.name.toLowerCase().includes(designerSearch.toLowerCase()),
  );

  const parentColors = lookups.colors.filter((c: any) => !c.parent_color_id);
  const childColors = lookups.colors.filter((c: any) => c.parent_color_id);

  const [showChildColors, setShowChildColors] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([
    search.min ?? 0,
    search.max ?? PRICE_MAX,
  ]);
  useEffect(() => {
    setPriceRange([search.min ?? 0, search.max ?? PRICE_MAX]);
  }, [search.min, search.max]);

  const designerSel = new Set(csv(search.designer));
  const occasionSel = new Set(csv(search.occasion));
  const typeSel = new Set(csv(search.type));
  const sizeSel = new Set(csv(search.size));
  const colorSel = new Set(csv(search.color));

  return (
    <div>
      <FilterSection title="Designer">
        <input
          type="text"
          value={designerSearch}
          onChange={(e) => setDesignerSearch(e.target.value)}
          placeholder="Search designers…"
          className="mb-2 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-pink"
        />
        <div className="max-h-64 overflow-y-auto pr-1">
          {filteredBrands.map((b: any) => (
            <label key={b.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={designerSel.has(b.slug)}
                onChange={() => toggleCsv("designer", b.slug)}
                className="h-4 w-4 rounded border-input accent-pink"
              />
              <span>{b.name}</span>
            </label>
          ))}
          {filteredBrands.length === 0 && <p className="py-2 text-xs text-muted-foreground">No matches</p>}
        </div>
      </FilterSection>

      <FilterSection title="Occasion">
        <div className="max-h-56 overflow-y-auto pr-1">
          {lookups.occasions.map((o: any) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={occasionSel.has(o.slug)}
                onChange={() => toggleCsv("occasion", o.slug)}
                className="h-4 w-4 rounded border-input accent-pink"
              />
              <span>{o.name}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Dress type">
        <div className="max-h-56 overflow-y-auto pr-1">
          {lookups.dressTypes.map((t: any) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={typeSel.has(t.slug)}
                onChange={() => toggleCsv("type", t.slug)}
                className="h-4 w-4 rounded border-input accent-pink"
              />
              <span>{t.name}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Size">
        <div className="grid grid-cols-3 gap-2">
          {lookups.sizes.map((s: any) => {
            const sel = sizeSel.has(s.slug);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleCsv("size", s.slug)}
                className={`rounded-md border px-2 py-1.5 text-xs ${sel ? "border-pink bg-pink text-pink-foreground" : "border-input bg-background hover:bg-muted"}`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title="Colour">
        <div className="grid grid-cols-4 gap-3">
          {parentColors.map((c: any) => {
            const sel = colorSel.has(c.slug);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCsv("color", c.slug)}
                className="flex flex-col items-center gap-1"
                title={c.name}
              >
                <span
                  className={`block h-8 w-8 rounded-full border-2 ${sel ? "border-pink ring-2 ring-pink/30" : "border-input"}`}
                  style={{ backgroundColor: c.hex || "#ccc" }}
                />
                <span className="line-clamp-1 text-[10px]">{c.name}</span>
              </button>
            );
          })}
        </div>
        {childColors.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowChildColors((s) => !s)}
              className="mt-3 text-xs text-pink underline"
            >
              {showChildColors ? "Hide" : "More"} specific colours
            </button>
            {showChildColors && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {childColors.map((c: any) => {
                  const sel = colorSel.has(c.slug);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCsv("color", c.slug)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${sel ? "border-pink bg-pink text-pink-foreground" : "border-input"}`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </FilterSection>

      <AttributeSection
        title="Neckline"
        items={lookups.necklines}
        selected={new Set(csv(search.neckline))}
        onToggle={(slug) => toggleCsv("neckline", slug)}
      />
      <AttributeSection
        title="Sleeve"
        items={lookups.sleeves}
        selected={new Set(csv(search.sleeve))}
        onToggle={(slug) => toggleCsv("sleeve", slug)}
      />
      <AttributeSection
        title="Back style"
        items={lookups.backStyles}
        selected={new Set(csv(search.back))}
        onToggle={(slug) => toggleCsv("back", slug)}
      />



      <FilterSection title="Price per hire">
        <div className="px-1">
          <Slider
            min={0}
            max={PRICE_MAX}
            step={10}
            value={priceRange}
            onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
            onValueCommit={(v) =>
              update({
                min: v[0] === 0 ? undefined : v[0],
                max: v[1] === PRICE_MAX ? undefined : v[1],
              })
            }
            className="mt-2"
          />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>${priceRange[0]}</span>
            <span>${priceRange[1]}{priceRange[1] === PRICE_MAX ? "+" : ""}</span>
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Special features">
        <div className="space-y-2">
          <Toggle
            label="2 Hour Delivery (Uber)"
            checked={!!search.twohour}
            onChange={(v) => update({ twohour: v || undefined })}
          />
          <Toggle
            label="Available for try-on"
            checked={!!search.tryon}
            onChange={(v) => update({ tryon: v || undefined })}
          />
          <Toggle
            label="Super Lender"
            checked={!!search.super}
            onChange={(v) => update({ super: v || undefined })}
          />
          <Toggle
            label="Top Rated Lender"
            checked={!!search.toprated}
            onChange={(v) => update({ toprated: v || undefined })}
          />
          <Toggle
            label="Fast delivery approved"
            checked={!!search.fast}
            onChange={(v) => update({ fast: v || undefined })}
          />
        </div>
      </FilterSection>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-pink" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
    </label>
  );
}

/* ---------- empty state ---------- */

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Search className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="font-display text-2xl">No dresses match your filters</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Try adjusting your filters or check back soon — new listings added daily.
      </p>
      <button onClick={onClear} className="mt-5 rounded-md bg-ink px-5 py-2.5 text-sm text-ink-foreground">
        Clear all filters
      </button>
    </div>
  );
}
