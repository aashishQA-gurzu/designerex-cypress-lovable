import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type CityRow = {
  id: string;
  name: string;
  slug?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  value: CityRow | null;
  onChange: (city: CityRow | null) => void;
  placeholder?: string;
  className?: string;
};

/**
 * City autocomplete — searches the `cities` table by name prefix.
 * Renders a dropdown of "Name, STATE" suggestions. When a city is selected,
 * the parent should derive `state` from city.state and lock the state input.
 */
export function CityAutocomplete({ value, onChange, placeholder = "Start typing a city…", className = "" }: Props) {
  const [query, setQuery] = useState(value ? (value.state ? `${value.name}, ${value.state}` : value.name) : "");
  const [results, setResults] = useState<CityRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setQuery(value.state ? `${value.name}, ${value.state}` : value.name);
  }, [value?.id]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const term = query.trim();
    // If the query matches the selected value, don't re-search.
    if (value && query === (value.state ? `${value.name}, ${value.state}` : value.name)) return;
    if (term.length < 1) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("cities")
        .select("id, name, slug")
        .ilike("name", `${term}%`)
        .order("name")
        .limit(10);
      if (!cancelled) {
        setResults((data ?? []) as CityRow[]);
        setLoading(false);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, value?.id]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        className="input w-full"
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (query.trim().length > 0) && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-md">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No cities match.</div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => { onChange(c); setQuery(c.state ? `${c.name}, ${c.state}` : c.name); setOpen(false); }}
            >
              {c.name}{c.state ? <>, <span className="text-muted-foreground">{c.state}</span></> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type StateProps = { state: string; locked: boolean };
export function LockedStateField({ state, locked }: StateProps) {
  return (
    <div className="relative">
      <input
        className="input w-full bg-muted text-muted-foreground"
        value={state}
        readOnly
        disabled={!locked && !state}
        title={locked ? "State is determined by selected city" : ""}
      />
      {locked && (
        <Lock className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      )}
    </div>
  );
}
