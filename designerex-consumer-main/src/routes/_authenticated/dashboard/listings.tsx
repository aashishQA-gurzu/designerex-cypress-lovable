import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Eye, Pause, Play, Pencil, Archive, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ListingsRoute() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (profile && !profile.is_lender) {
      navigate({ to: "/dashboard" });
    }
  }, [profile, navigate]);
  if (!profile?.is_lender) return null;
  return (
    <LenderGate>
      <ListingsPage />
    </LenderGate>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/listings")({
  ssr: false,
  component: ListingsRoute,
});

const TABS = ["all", "active", "paused", "drafts", "archived"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  active: "Live",
  paused: "Paused",
  drafts: "Drafts",
  archived: "Archived",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Live",
  paused: "Paused",
  draft: "Draft",
  archived: "Archived",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  draft: "bg-gray-200 text-gray-700",
  archived: "bg-red-100 text-red-700",
};

function ListingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null);
  const { data: isPaused } = useQuery({
    queryKey: ["lender-pause-flag", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_lending_paused")
        .eq("id", user!.id)
        .maybeSingle();
      return !!(data as any)?.is_lending_paused;
    },
  });


  const { data: rows, isPending: listingsLoading } = useQuery({
    queryKey: ["lender-listings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: dresses } = await supabase
        .from("dresses")
        .select("id, title, status, brand_id, created_at")
        .eq("lender_id", user!.id)
        .order("created_at", { ascending: false });
      const list = dresses ?? [];
      if (list.length === 0) return [];

      const ids = list.map((d: any) => d.id);
      const brandIds = [...new Set(list.map((d: any) => d.brand_id).filter(Boolean))];

      const [imagesRes, brandsRes, viewsRes, bookingsRes] = await Promise.all([
        supabase.from("dress_images").select("dress_id, url, position").in("dress_id", ids),
        brandIds.length
          ? supabase.from("brands").select("id, name").in("id", brandIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("dress_views")
          .select("dress_id, viewed_at")
          .in("dress_id", ids)
          .gte("viewed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from("bookings")
          .select("dress_id, status, lender_payout_amount, start_date, end_date")
          .in("dress_id", ids),
      ]);

      const imgMap = new Map<string, string>();
      for (const im of (imagesRes.data ?? []) as any[]) {
        const existing = imgMap.get(im.dress_id);
        if (!existing || (im.position ?? 0) === 0) imgMap.set(im.dress_id, im.url);
      }
      const bMap = new Map((brandsRes.data ?? []).map((b: any) => [b.id, b.name]));
      const viewCounts = new Map<string, number>();
      for (const v of (viewsRes.data ?? []) as any[]) {
        viewCounts.set(v.dress_id, (viewCounts.get(v.dress_id) ?? 0) + 1);
      }
      const stats = new Map<string, { bookings: number; earnings: number }>();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const activeNow = new Map<string, { end_date: string }>();
      const upcoming = new Map<string, { start_date: string }>();
      for (const b of (bookingsRes.data ?? []) as any[]) {
        const cur = stats.get(b.dress_id) ?? { bookings: 0, earnings: 0 };
        cur.bookings += 1;
        if (["accepted", "active", "completed"].includes(b.status)) {
          cur.earnings += Number(b.lender_payout_amount ?? 0);
        }
        stats.set(b.dress_id, cur);

        const start = b.start_date ? new Date(b.start_date) : null;
        const end = b.end_date ? new Date(b.end_date) : null;
        if (b.status === "active" && start && end && start <= today && today <= end) {
          activeNow.set(b.dress_id, { end_date: b.end_date });
        } else if (b.status === "accepted" && start && start > today) {
          const existing = upcoming.get(b.dress_id);
          if (!existing || new Date(existing.start_date) > start) {
            upcoming.set(b.dress_id, { start_date: b.start_date });
          }
        }
      }

      return list.map((d: any) => ({
        ...d,
        image_url: imgMap.get(d.id) ?? null,
        brand_name: bMap.get(d.brand_id) ?? null,
        views_30d: viewCounts.get(d.id) ?? 0,
        bookings_count: stats.get(d.id)?.bookings ?? 0,
        earnings: stats.get(d.id)?.earnings ?? 0,
        out_with_renter: activeNow.get(d.id) ?? null,
        upcoming_booking: upcoming.get(d.id) ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const all = rows ?? [];
    if (tab === "all") return all.filter((r: any) => r.status !== "archived");
    if (tab === "drafts") return all.filter((r: any) => r.status === "draft");
    return all.filter((r: any) => r.status === tab.replace(/s$/, ""));
  }, [rows, tab]);

  const togglePause = async (d: any) => {
    const next = d.status === "active" ? "paused" : "active";
    console.log("PAUSE/UNPAUSE CLICKED", { id: d.id, current: d.status, next });
    const { data, error } = await supabase
      .from("dresses")
      .update({ status: next })
      .eq("id", d.id)
      .eq("lender_id", user!.id)
      .select();
    console.log("PAUSE RESULT", { data, error });
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success(next === "paused" ? "Listing paused — renters can no longer book it." : "Listing is now live.");
    qc.invalidateQueries({ queryKey: ["lender-listings"] });
  };

  const confirmArchive = async () => {
    console.log("ARCHIVE CONFIRM CLICKED", archiveTarget?.id);
    if (!archiveTarget) return;
    const target = archiveTarget;
    setArchiveTarget(null);
    const { data, error } = await supabase
      .from("dresses")
      .update({ status: "archived" })
      .eq("id", target.id)
      .eq("lender_id", user!.id)
      .select();
    console.log("ARCHIVE RESULT", { data, error });
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success("Listing archived.");
    qc.invalidateQueries({ queryKey: ["lender-listings"] });
  };

  const handleEdit = (id: string) => {
    console.log("EDIT CLICKED", id);
    navigate({ to: "/dashboard/listings/$id/edit", params: { id } });
  };

  const handleView = (id: string) => {
    console.log("VIEW CLICKED", id);
    window.open(`/dresses/${id}`, "_blank", "noopener");
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl">Your listings</h2>
        <Link
          to="/dashboard/listings/new"
          className="inline-flex items-center gap-2 rounded-md bg-pink px-4 py-2 text-xs font-medium text-white hover:bg-pink/90"
        >
          <Plus className="h-4 w-4" /> List a new dress
        </Link>
      </div>

      {isPaused && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Vacation mode is on.</p>
            <p className="mt-0.5">
              Your listings are hidden from renters and won't receive new bookings.
              Turn it off to go live again.
            </p>
          </div>
          <Link
            to="/dashboard/vacation"
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Manage vacation mode
          </Link>
        </div>
      )}



      <div className="mb-6 -mx-4 overflow-x-auto px-4">
        <div className="flex gap-2 whitespace-nowrap border-b">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-xs uppercase tracking-wider-display transition-colors",
                tab === t ? "border-pink text-pink" : "border-transparent text-muted-foreground hover:text-ink",
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {listingsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-md border bg-white">
              <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed bg-white px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No listings in this tab yet. Click "List a new dress" to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d: any) => (
            <div key={d.id} className="overflow-hidden rounded-md border bg-white">
              <div className="relative aspect-[3/4] w-full bg-muted">
                {d.image_url ? (
                  <img src={d.image_url} alt="" className="h-full w-full object-cover" />
                ) : null}
                {isPaused && d.status === "active" && (
                  <div className="absolute inset-0 flex items-start justify-center bg-black/40">
                    <span className="mt-3 rounded-full bg-ink/90 px-3 py-1 text-[10px] font-medium uppercase tracking-wider-display text-white shadow">
                      Paused · Vacation
                    </span>
                  </div>
                )}
                {d.out_with_renter ? (
                  <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600/95 px-2 py-1 text-[10px] font-medium uppercase tracking-wider-display text-white shadow">
                    🟢 Out with renter
                  </span>
                ) : d.upcoming_booking ? (
                  <span className="absolute bottom-2 left-2 rounded-full bg-ink/85 px-2 py-1 text-[10px] font-medium uppercase tracking-wider-display text-white shadow">
                    📅 Booked from {new Date(d.upcoming_booking.start_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }).toUpperCase()}
                  </span>
                ) : null}
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] tracking-wider-display text-muted-foreground">
                        {d.brand_name ?? "DESIGNER"}
                      </p>
                      <p className="truncate font-display text-base">{d.title}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider-display",
                        STATUS_COLOR[d.status] ?? "bg-muted text-ink",
                      )}
                    >
                      {STATUS_LABEL[d.status] ?? "Draft"}
                    </span>
                  </div>
                </div>


                <div className="grid grid-cols-3 gap-2 border-y py-2 text-center text-xs">
                  <div>
                    <p className="font-display text-base">{d.views_30d}</p>
                    <p className="text-[10px] uppercase tracking-wider-display text-muted-foreground">
                      Views (30d)
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-base">{d.bookings_count}</p>
                    <p className="text-[10px] uppercase tracking-wider-display text-muted-foreground">
                      Bookings
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-base text-pink">
                      ${Number(d.earnings).toFixed(0)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider-display text-muted-foreground">
                      Earnings
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => handleEdit(d.id)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  {d.status !== "archived" && d.status !== "draft" && (
                    <button
                      onClick={() => togglePause(d)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 hover:bg-muted"
                    >
                      {d.status === "paused" ? (
                        <><Play className="h-3 w-3" /> Unpause</>
                      ) : (
                        <><Pause className="h-3 w-3" /> Pause</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleView(d.id)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 hover:bg-muted"
                  >
                    <Eye className="h-3 w-3" /> View
                  </button>
                  {d.status !== "archived" && (
                    <button
                      onClick={() => setArchiveTarget(d)}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-red-700 hover:bg-red-50"
                    >
                      <Archive className="h-3 w-3" /> Archive
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from renters and from your active list. Existing bookings are unaffected. You can find archived listings in the Archived tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive} className="bg-red-600 hover:bg-red-700">
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
