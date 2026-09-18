import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

export type ColorOption = { id: string; name: string };

export function ColorCombobox({
  value,
  options,
  placeholder = "Select…",
  disabled = false,
  onChange,
}: {
  value: string | null;
  options: ColorOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedName = useMemo(
    () => options.find((o) => o.id === value)?.name ?? "",
    [value, options],
  );

  // Keep input text synced with selected value when not actively searching
  useEffect(() => {
    if (!open) setQ(selectedName);
  }, [selectedName, open]);

  const fuse = useMemo(
    () => new Fuse(options, { keys: ["name"], threshold: 0.4, ignoreLocation: true, includeScore: true }),
    [options],
  );

  const filtered = useMemo(() => {
    const term = q.trim();
    if (!term || term === selectedName) return options;
    return fuse.search(term).map((r) => r.item);
  }, [q, options, fuse, selectedName]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className="input w-full disabled:bg-muted disabled:cursor-not-allowed"
        placeholder={placeholder}
        value={open ? q : selectedName}
        disabled={disabled}
        onFocus={() => { if (!disabled) { setOpen(true); setQ(""); } }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false); setQ(o.name); }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${value === o.id ? "bg-pink-soft text-pink" : ""}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
      {open && !disabled && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white px-3 py-2 text-xs text-muted-foreground shadow-lg">
          No matches
        </div>
      )}
    </div>
  );
}
