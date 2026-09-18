import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Brand = { id: string; name: string; slug?: string | null };

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function BrandCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null, name?: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Brand[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load selected brand label
  useEffect(() => {
    if (!value) { setSelectedName(""); return; }
    supabase.from("brands").select("id, name").eq("id", value).maybeSingle().then(({ data }) => {
      if (data) { setSelectedName(data.name); setQ(data.name); }
    });
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const search = q.trim();
      const query = supabase.from("brands").select("id, name, slug").order("name").limit(20);
      const { data } = search
        ? await query.ilike("name", `%${search}%`)
        : await query;
      setOptions((data ?? []) as Brand[]);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const exact = options.find((o) => o.name.toLowerCase() === q.trim().toLowerCase());
  const showCreate = q.trim().length > 1 && !exact;

  const create = async (rawName?: string) => {
    const name = (rawName ?? q).trim();
    if (!name) return null;
    const slug = slugify(name);
    console.log("[ListingForm] BrandCombobox: creating new brand", { name, slug });
    const { data, error } = await supabase.from("brands").insert({ name, slug }).select("id, name").single();
    if (error) {
      console.error("[ListingForm] BrandCombobox: create failed", error);
      toast.error(`Couldn't add brand: ${error.message}`);
      return null;
    }
    console.log("[ListingForm] BrandCombobox: created brand_id", data.id);
    setSelectedName(data.name);
    setQ(data.name);
    onChange(data.id, data.name);
    setOpen(false);
    return data.id;
  };

  const select = (b: Brand) => {
    console.log("[ListingForm] BrandCombobox: selected existing brand_id", b.id, b.name);
    setSelectedName(b.name);
    setQ(b.name);
    onChange(b.id, b.name);
    setOpen(false);
  };

  // Auto-resolve on blur: exact match → select; non-empty new text → create.
  // CRITICAL: if a brand_id is already set, do nothing.
  const handleBlur = async () => {
    if (value) {
      console.log("[ListingForm] BrandCombobox: blur skipped — brand_id already set", value);
      return;
    }
    const text = q.trim();
    if (!text) return;
    // Try exact match against existing brands (case-insensitive)
    const { data } = await supabase
      .from("brands")
      .select("id, name")
      .ilike("name", text)
      .limit(1);
    const match = data?.[0];
    if (match) {
      console.log("[ListingForm] BrandCombobox: blur auto-matched existing", match.id);
      select(match as Brand);
      return;
    }
    console.log("[ListingForm] BrandCombobox: blur auto-creating", text);
    await create(text);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className="input w-full"
        placeholder="Search designer / brand…"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(handleBlur, 150); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }}
      />
      {open && (options.length > 0 || showCreate) && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => select(o)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${value === o.id ? "bg-pink-soft text-pink" : ""}`}
            >
              {o.name}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => create()}
              className="block w-full border-t px-3 py-2 text-left text-sm text-pink hover:bg-pink-soft"
            >
              + Add new brand "{q.trim()}"
            </button>
          )}
        </div>
      )}
      {selectedName && value && (
        <p className="mt-1 text-[11px] text-muted-foreground">Selected: {selectedName}</p>
      )}
    </div>
  );
}
