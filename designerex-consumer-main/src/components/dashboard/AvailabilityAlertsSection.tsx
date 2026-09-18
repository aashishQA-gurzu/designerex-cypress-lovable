import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AlertRow = {
  id: string;
  dress_id: string;
  desired_start: string;
  desired_end: string;
  notified_at: string | null;
  created_at: string;
};

type DressMeta = {
  id: string;
  title: string | null;
  image_url: string | null;
};

const fmt = (iso: string) => format(parseISO(iso), "d MMM");

export function AvailabilityAlertsSection() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["availability-alerts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error: rErr } = await supabase
        .from("availability_alerts")
        .select("id, dress_id, desired_start, desired_end, notified_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (rErr) throw rErr;
      const alerts = (rows ?? []) as AlertRow[];
      if (!alerts.length) return { alerts, dresses: new Map<string, DressMeta>() };
      const ids = Array.from(new Set(alerts.map((a) => a.dress_id)));
      const { data: dressRows } = await supabase
        .from("dresses")
        .select("id, title, images:dress_images(url, position)")
        .in("id", ids);
      const dressMap = new Map<string, DressMeta>();
      for (const d of (dressRows ?? []) as any[]) {
        const img = ((d.images ?? []) as any[]).sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        )[0]?.url;
        dressMap.set(d.id, { id: d.id, title: d.title ?? null, image_url: img ?? null });
      }
      return { alerts, dresses: dressMap };
    },
  });

  const handleRemove = async (id: string) => {
    const prev = data;
    qc.setQueryData(["availability-alerts", user?.id], (old: any) =>
      old ? { ...old, alerts: old.alerts.filter((a: AlertRow) => a.id !== id) } : old,
    );
    const { error: dErr } = await supabase.from("availability_alerts").delete().eq("id", id);
    if (dErr) {
      qc.setQueryData(["availability-alerts", user?.id], prev);
      toast.error("Couldn't remove alert.");
      return;
    }
    toast.success("Alert removed.");
  };

  return (
    <section className="rounded-[10px] border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-magenta" />
        <h2 className="font-heading text-sm tracking-wider-display uppercase">
          Availability alerts
        </h2>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-bg-tint" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-destructive">Couldn't load alerts.</p>
      ) : !data || data.alerts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No alerts yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.alerts.map((a) => {
            const dress = data.dresses.get(a.dress_id);
            const notified = !!a.notified_at;
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-[10px] border border-border p-3"
              >
                <Link
                  to="/dresses/$id"
                  params={{ id: a.dress_id }}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  {dress?.image_url ? (
                    <img
                      src={dress.image_url}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 flex-shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm text-ink">
                      {dress?.title ?? "Dress"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmt(a.desired_start)} → {fmt(a.desired_end)}
                    </p>
                    <span
                      className={
                        "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] tracking-wider-display " +
                        (notified
                          ? "bg-success-bg text-success-ink"
                          : "bg-bg-tint text-ink-muted")
                      }
                    >
                      {notified ? "Notified" : "Waiting"}
                    </span>
                  </div>
                </Link>
                <button
                  onClick={() => handleRemove(a.id)}
                  className="rounded-full p-2 text-ink-muted hover:bg-bg-tint hover:text-ink"
                  aria-label="Remove alert"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
