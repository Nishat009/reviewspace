"use client";

import { useRef, useState } from "react";
import { ImageUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_MB } from "@/lib/validation/shared";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from "./put-file";
import { UploadRow } from "./upload-row";
import { useUploads } from "./use-uploads";

/**
 * Drag-and-drop or pick screenshots; each file becomes a new asset (V1).
 * Shows per-file progress, server-side processing and retry on failure.
 */
export function AssetDropzone({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { items, add, retry, dismiss } = useUploads({
    projectId,
    onComplete: (item) => toast.success(`${item.file.name} uploaded as V${item.result?.versionNumber ?? 1}.`),
  });

  const accept = (files: FileList | File[]) => {
    const list = [...files];
    const errors = list.map((f) => validateImageFile(f, MAX_UPLOAD_MB)).filter(Boolean) as string[];
    for (const error of errors) toast.error(error);
    const valid = list.filter((f) => !validateImageFile(f, MAX_UPLOAD_MB));
    if (valid.length > 0) add(valid);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <ImageUpIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Drop screenshots here</p>
        <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to {MAX_UPLOAD_MB} MB each. Each file becomes a new asset.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose images to upload"
          onChange={(e) => {
            if (e.target.files) accept(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {items.map((item) => (
            <UploadRow key={item.key} item={item} onRetry={() => retry(item.key)} onDismiss={() => dismiss(item.key)} />
          ))}
        </ul>
      )}
    </div>
  );
}
