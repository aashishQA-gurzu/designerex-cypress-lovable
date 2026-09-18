import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Download, Shirt, TrendingDown, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SimpleSelect } from "@/components/ui/simple-select";

export const Route = createFileRoute("/_authenticated/dashboard/financials")({
  ssr: false,
  component: FinancialsPage,
});

type SummaryRow = {
  fy_label: string;
  fy_start: string;
  fy_end: string;
  bookings_count: number;
  rental_income: number;
  cleaning_income: number;
  shipping_income: number;
  gross_earnings: number;
  commission_paid: number;
  net_payout: number;
  avg_booking_value: number;
  highest_month: string | null;
  highest_month_net: number | null;
  lowest_month: string | null;
  lowest_month_net: number | null;
  best_dress: string | null;
  best_dress_net: number | null;
  worst_dress: string | null;
  worst_dress_net: number | null;
};
type MonthlyRow = {
  month_label: string;
  month_start: string;
  bookings_count: number;
  gross_earnings: number;
  commission_paid: number;
  net_payout: number;
};
type PerDressRow = {
  dress_id: string;
  dress_title: string | null;
  bookings_count: number;
  gross_earnings: number;
  commission_paid: number;
  net_payout: number;
};

function currentFY(): number {
  const now = new Date();
  const y = now.getFullYear();
  // Australian FY ends 30 June: FY label = year in which it ends.
  return now.getMonth() >= 6 ? y + 1 : y;
}

function fyOptions(current: number): number[] {
  return [current, current - 1, current - 2, current - 3];
}

function fyLabel(fy: number) {
  return `FY${fy} (1 Jul ${fy - 1} – 30 Jun ${fy})`;
}

function fmtMoney(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FinancialsPage() {
  const { user } = useAuth();
  const [fy, setFy] = useState<number>(currentFY());

  const params = { p_lender: user?.id, p_fy: fy } as const;

  const summary = useQuery({
    queryKey: ["fin-summary", user?.id, fy],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_lender_financials_summary" as any, params as any);
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as SummaryRow | null;
    },
  });

  const monthly = useQuery({
    queryKey: ["fin-monthly", user?.id, fy],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_lender_financials_monthly" as any, params as any);
      if (error) throw error;
      return (data ?? []) as MonthlyRow[];
    },
  });

  const perDress = useQuery({
    queryKey: ["fin-per-dress", user?.id, fy],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_lender_financials_by_dress" as any, params as any);
      if (error) throw error;
      return (data ?? []) as PerDressRow[];
    },
  });

  const monthlyMax = useMemo(() => {
    const rows = monthly.data ?? [];
    return Math.max(1, ...rows.map((r) => Number(r.net_payout ?? 0)));
  }, [monthly.data]);

  const anyError = summary.error || monthly.error || perDress.error;
  const errorMsg =
    (summary.error as any)?.message ||
    (monthly.error as any)?.message ||
    (perDress.error as any)?.message;

  const downloadCsv = () => {
    const rows: string[] = [];
    rows.push("Section,Label,Bookings,You received");
    const s = summary.data;
    if (s) {
      rows.push(
        [
          "Summary",
          csvCell(fyLabel(fy)),
          Number(s.bookings_count ?? 0),
          Number(s.net_payout ?? 0).toFixed(2),
        ].join(","),
      );
    }
    (monthly.data ?? []).forEach((r) => {
      rows.push(
        [
          "Monthly",
          csvCell(r.month_label),
          Number(r.bookings_count ?? 0),
          Number(r.net_payout ?? 0).toFixed(2),
        ].join(","),
      );
    });
    (perDress.data ?? []).forEach((r) => {
      rows.push(
        [
          "Per dress",
          csvCell(r.dress_title ?? r.dress_id),
          Number(r.bookings_count ?? 0),
          Number(r.net_payout ?? 0).toFixed(2),
        ].join(","),
      );
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financials-fy${fy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Financials</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Your completed rentals for the selected financial year. Figures are based on completed
            bookings.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:gap-3">
          <label className="hidden text-xs uppercase tracking-wider-display text-muted-foreground sm:block">
            Financial year
          </label>
          <SimpleSelect
            value={String(fy)}
            onValueChange={(v) => setFy(Number(v))}
            aria-label="Financial year"
            className="h-auto w-auto rounded-md border-border bg-surface px-3 py-2 text-sm text-ink"
            options={fyOptions(currentFY()).map((y) => ({ value: String(y), label: fyLabel(y) }))}
          />
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink hover:bg-bg-tint"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        </div>
      </header>

      {anyError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load financials: {errorMsg}
        </div>
      ) : summary.isLoading || monthly.isLoading || perDress.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading financials…</div>
      ) : summary.data?.bookings_count === 0 ? (
        <div className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
          No completed bookings in this financial year.
        </div>
      ) : summary.data ? (
        <>
      <section className="grid grid-cols-1 gap-4">
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="You received"
          hint="Paid out to you"
          value={summary.data.net_payout}
          highlight
        />
      </section>

      <p className="text-xs text-muted-foreground">
        {`${summary.data.bookings_count} completed booking${summary.data.bookings_count === 1 ? "" : "s"} in ${summary.data.fy_label || fyLabel(fy)}.`}
      </p>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PerformanceCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Highest month"
          name={summary.data.highest_month}
          value={summary.data.highest_month_net}
        />
        <PerformanceCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Lowest month"
          name={summary.data.lowest_month}
          value={summary.data.lowest_month_net}
        />
        <PerformanceCard
          icon={<Shirt className="h-4 w-4" />}
          label="Best dress"
          name={summary.data.best_dress}
          value={summary.data.best_dress_net}
        />
        <PerformanceCard
          icon={<Shirt className="h-4 w-4" />}
          label="Lowest-earning dress"
          name={summary.data.worst_dress}
          value={summary.data.worst_dress_net}
        />
      </section>

      {/* Monthly */}
      <section>
        <h2 className="font-display text-xl text-ink">Monthly breakdown</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your received amount by month.
        </p>

        <div className="mt-4 rounded-[10px] border border-border bg-surface">
          {/* Simple bar chart */}
          <div className="grid min-w-0 grid-cols-12 gap-1 border-b border-border px-2 py-4 sm:gap-2 sm:px-4">
            {(monthly.data ?? []).map((r) => {
                const v = Number(r.net_payout ?? 0);
                const pct = Math.round((v / monthlyMax) * 100);
                return (
                  <div key={r.month_start} className="flex min-w-0 flex-col items-center gap-1">
                    <div className="flex h-24 w-full items-end">
                      <div
                        className="w-full rounded-t bg-magenta/70"
                        style={{ height: `${Math.max(2, pct)}%` }}
                        title={fmtMoney(v)}
                      />
                    </div>
                    <span className="w-full truncate text-center text-[9px] text-muted-foreground sm:text-[10px]">
                      {r.month_label.replace(/ \d{4}$/, "").slice(0, 3)}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Monthly table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider-display text-muted-foreground">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Bookings</th>
                  <th className="px-4 py-3">You received</th>
                </tr>
              </thead>
              <tbody>
                {(monthly.data ?? []).map((r) => (
                  <tr key={r.month_start} className="border-b border-border/60 text-ink">
                    <td className="px-4 py-3">{r.month_label}</td>
                    <td className="px-4 py-3">{r.bookings_count ?? 0}</td>
                    <td className="px-4 py-3 font-medium text-magenta">
                      {fmtMoney(r.net_payout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Per dress */}
      <section>
        <h2 className="font-display text-xl text-ink">By dress</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Which of your listings contributed to earnings.
        </p>

        <div className="mt-4 space-y-2 sm:hidden">
          {(perDress.data ?? []).map((r) => (
            <div key={r.dress_id} className="rounded-[10px] border border-border bg-surface p-4">
              <p className="min-w-0 break-words text-sm font-medium text-ink">
                {r.dress_title ?? r.dress_id}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider-display text-muted-foreground">
                    Bookings
                  </p>
                  <p className="mt-1 text-ink">{r.bookings_count ?? 0}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider-display text-muted-foreground">
                    You received
                  </p>
                  <p className="mt-1 font-medium text-magenta">{fmtMoney(r.net_payout)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-[10px] border border-border bg-surface sm:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider-display text-muted-foreground">
                <th className="px-4 py-3">Dress</th>
                <th className="px-4 py-3">Bookings</th>
                <th className="px-4 py-3">You received</th>
              </tr>
            </thead>
            <tbody>
              {(perDress.data ?? []).map((r) => (
                <tr key={r.dress_id} className="border-b border-border/60 text-ink">
                  <td className="px-4 py-3">{r.dress_title ?? r.dress_id}</td>
                  <td className="px-4 py-3">{r.bookings_count ?? 0}</td>
                  <td className="px-4 py-3 font-medium text-magenta">
                    {fmtMoney(r.net_payout)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load financials: the summary response was empty.
        </div>
      )}
    </div>
  );
}

function PerformanceCard({
  icon,
  label,
  name,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  name: string | null;
  value: number | null;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider-display text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tint text-magenta">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm font-medium text-ink">{name ?? "—"}</p>
      <p className="mt-2 font-display text-2xl text-magenta">{fmtMoney(value)}</p>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  hint,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[10px] border border-border bg-surface p-5 ${highlight ? "ring-1 ring-magenta/40" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider-display text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tint text-magenta">
          {icon}
        </span>
        {label}
      </div>
      <p
        className={`mt-3 font-display text-3xl ${highlight ? "text-magenta" : "text-ink"}`}
      >
        {fmtMoney(value)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function csvCell(v: string | number) {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
