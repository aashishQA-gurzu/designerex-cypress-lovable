import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, UploadCloud, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


const BUCKET = "Dress Images";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export type DressImage = { id: string; url: string; position: number; path?: string | null };

function pathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  try { return decodeURIComponent(url.slice(i + marker.length)); } catch { return url.slice(i + marker.length); }
}

export function ImageUploader({ dressId }: { dressId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DressImage | null>(null);


  const { data: images = [] } = useQuery({
    queryKey: ["dress-images", dressId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dress_images")
        .select("id, url, position")
        .eq("dress_id", dressId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, path: pathFromUrl(d.url) })) as DressImage[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["dress-images", dressId] });

  const upload = async (files: FileList) => {
    const arr = Array.from(files);
    const startPos = images.length;
    console.log("[ImageUploader] upload() called", { count: arr.length, dressId, startPos, bucket: BUCKET });
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      console.log("[ImageUploader] file", i, { name: file.name, size: file.size, type: file.type });
      if (!ACCEPT.includes(file.type)) { toast.error(`${file.name}: only JPEG/PNG/WebP allowed`); continue; }
      if (file.size > MAX_BYTES) { toast.error(`${file.name}: max 10MB`); continue; }
      const key = `${file.name}-${file.size}-${Date.now()}`;
      setProgress((p) => ({ ...p, [key]: 5 }));
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${dressId}/${Date.now()}-${i}.${ext}`;
      console.log("[ImageUploader] uploading to storage", { bucket: BUCKET, path });
      const { data: upData, error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      console.log("[ImageUploader] storage.upload response", { upData, upErr: upErr ? JSON.stringify(upErr) : null });
      if (upErr) {
        setProgress((p) => { const n = { ...p }; delete n[key]; return n; });
        console.error("[ImageUploader] STORAGE UPLOAD FAILED", upErr);
        toast.error(`Upload failed: ${upErr.message}`);
        continue;
      }
      setProgress((p) => ({ ...p, [key]: 70 }));
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      console.log("[ImageUploader] publicUrl", pub);
      const { data: insData, error: insErr } = await supabase.from("dress_images").insert({
        dress_id: dressId,
        url: pub.publicUrl,
        position: startPos + i,
      }).select().single();
      console.log("[ImageUploader] dress_images insert response", { insData, insErr: insErr ? JSON.stringify(insErr) : null });
      setProgress((p) => { const n = { ...p }; delete n[key]; return n; });
      if (insErr) {
        console.error("[ImageUploader] DB INSERT FAILED", insErr);
        toast.error(`DB insert failed: ${insErr.message}`);
        continue;
      }
    }
    refresh();
    qc.invalidateQueries({ queryKey: ["dress-images-count", dressId] });
  };

  const remove = async (img: DressImage) => {
    if (img.path) await supabase.storage.from(BUCKET).remove([img.path]);
    const { error } = await supabase.from("dress_images").delete().eq("id", img.id);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    // Re-pack positions
    const remaining = images.filter((i) => i.id !== img.id);
    for (let idx = 0; idx < remaining.length; idx++) {
      const im = remaining[idx];
      if (im.position !== idx) {
        await supabase.from("dress_images").update({ position: idx }).eq("id", im.id);
      }
    }
    refresh();
  };

  const reorder = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const reordered = [...images];
    const fromIdx = reordered.findIndex((i) => i.id === fromId);
    const toIdx = reordered.findIndex((i) => i.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [m] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, m);
    for (let idx = 0; idx < reordered.length; idx++) {
      const im = reordered[idx];
      if (im.position !== idx) {
        await supabase.from("dress_images").update({ position: idx }).eq("id", im.id);
      }
    }
    refresh();
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center hover:bg-muted/50"
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm">Drop images here or click to upload</p>
        <p className="mt-1 text-xs text-muted-foreground">
          JPEG, PNG or WEBP — up to 10MB each
        </p>
      </div>

      {Object.entries(progress).length > 0 && (
        <div className="space-y-1">
          {Object.entries(progress).map(([k, v]) => (
            <div key={k} className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-pink transition-all" style={{ width: `${v}%` }} />
            </div>
          ))}
        </div>
      )}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDragId(img.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) reorder(dragId, img.id); setDragId(null); }}
              className="group relative aspect-[3/4] overflow-hidden rounded-md border bg-muted"
            >
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-2 top-2 rounded-full bg-pink px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider-display text-white shadow">
                {img.position === 0 ? "Cover" : img.position + 1}
              </span>
              <button
                type="button"
                onClick={() => setPendingDelete(img)}
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
                aria-label="Delete photo"
              >
                <X className="h-3 w-3" />
              </button>
              <span className="absolute bottom-1 left-1 hidden h-6 w-6 cursor-grab items-center justify-center rounded bg-black/50 text-white group-hover:flex">
                <GripVertical className="h-3 w-3" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No photos yet.</p>
      )}

      {images.length > 0 && images.length < 3 && (
        <p className="text-xs text-amber-700">Add at least 3 photos to publish this listing.</p>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const img = pendingDelete;
                setPendingDelete(null);
                if (img) await remove(img);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

