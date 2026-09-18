import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";

import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/vacation")({
  ssr: false,
  component: () => (
    <LenderGate>
      <VacationPage />
    </LenderGate>
  ),
});

function VacationPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const [busy, setBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const { data: pausedData, isLoading: pausedLoading } = useQuery({
    queryKey: ["lender-pause-flag", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_lending_paused")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!(data as any)?.is_lending_paused;
    },
  });
  const paused = !!pausedData;

  const { data: vacations } = useQuery({
    queryKey: ["lender-vacations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("lender_vacation_periods")
        .select("id, start_date, end_date")
        .eq("lender_id", user!.id)
        .order("start_date");
      return data ?? [];
    },
  });

  const togglePause = async (next: boolean) => {
    if (!user) return;
    const prev = paused;
    setToggleBusy(true);
    qc.setQueryData(["lender-pause-flag", user.id], next);
    const { error } = await supabase
      .from("profiles")
      .update({ is_lending_paused: next })
      .eq("id", user.id);
    if (error) {
      qc.setQueryData(["lender-pause-flag", user.id], prev);
      setToggleBusy(false);
      toast.error("Couldn't update vacation mode — try again.");
      return;
    }
    const { data: confirmed } = await supabase
      .from("profiles")
      .select("is_lending_paused")
      .eq("id", user.id)
      .maybeSingle();
    qc.setQueryData(
      ["lender-pause-flag", user.id],
      !!(confirmed as any)?.is_lending_paused,
    );
    qc.invalidateQueries({ queryKey: ["lender-listings"] });
    setToggleBusy(false);
    toast.success(next ? "Lending paused." : "Lending resumed.");
  };

  const addVacation = async () => {
    if (!user || !range?.from || !range?.to) return;
    setBusy(true);
    const { error } = await supabase.from("lender_vacation_periods").insert({
      lender_id: user.id,
      start_date: format(range.from, "yyyy-MM-dd"),
      end_date: format(range.to, "yyyy-MM-dd"),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vacation scheduled.");
    setRange(undefined);
    qc.invalidateQueries({ queryKey: ["lender-vacations"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("lender_vacation_periods").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed.");
    qc.invalidateQueries({ queryKey: ["lender-vacations"] });
  };

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-3xl">Vacation mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pause your lending temporarily or schedule time away.
        </p>
      </div>

      <section className="rounded-md border bg-white p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl">Indefinite pause</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Pause new bookings indefinitely. Your existing bookings remain unaffected.
            </p>
          </div>
          <Switch
            checked={paused}
            onCheckedChange={(v) => togglePause(v)}
            disabled={pausedLoading || toggleBusy}
            aria-label="Toggle pause"
            className="data-[state=checked]:bg-pink"
          />

        </div>
      </section>

      <section className="rounded-md border bg-white p-4 sm:p-6">
        <h3 className="font-display text-xl">Scheduled vacation</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick dates to mark yourself as away. All your listings will be unavailable for those dates.
        </p>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-start">
          <div className="w-full min-w-0">
            <Calendar
              mode="range"
              selected={range as any}
              onSelect={setRange as any}
              numberOfMonths={2}
              disabled={{ before: new Date() }}
              className={cn("pointer-events-auto mx-auto mt-4")}
            />
          </div>
          <div className="w-full min-w-0 space-y-3">
            <p className="text-sm">
              {range?.from && range?.to
                ? `${format(range.from, "EEE d MMM")} → ${format(range.to, "EEE d MMM yyyy")}`
                : "Pick a start and end date."}
            </p>
            <button
              onClick={addVacation}
              disabled={busy || !range?.from || !range?.to}
              className="rounded-md bg-pink px-4 py-2 text-xs font-medium text-white hover:bg-pink/90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Schedule vacation"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-xl">Upcoming vacations</h3>
        {(vacations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming vacations scheduled.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-white">
            {vacations!.map((v: any) => (
              <li key={v.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {format(parseISO(v.start_date), "EEE d MMM")} →{" "}
                  {format(parseISO(v.end_date), "EEE d MMM yyyy")}
                </span>
                <button
                  onClick={() => remove(v.id)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
