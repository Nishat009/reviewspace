"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadRow } from "@/components/upload/upload-row";
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from "@/components/upload/put-file";
import { useUploads } from "@/components/upload/use-uploads";
import { MAX_UPLOAD_MB } from "@/lib/validation/shared";

/** Uploads a new version of the current asset; it never replaces an old one. */
export function NewVersionDialog({
  projectId,
  assetId,
  nextNumber,
  hrefForVersion,
}: {
  projectId: string;
  assetId: string;
  nextNumber: number;
  hrefForVersion: (versionId: string) => string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, add, retry, dismiss } = useUploads({
    projectId,
    onComplete: (item) => {
      toast.success(`V${item.result?.versionNumber} uploaded.`);
      setOpen(false);
      setFile(null);
      setSummary("");
      if (item.result) router.push(hrefForVersion(item.result.versionId));
    },
  });
  const busy = items.some((i) => i.status === "uploading" || i.status === "processing");

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UploadIcon aria-hidden /> <span className="max-sm:sr-only">New version</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload V{nextNumber}</DialogTitle>
          <DialogDescription>
            The new version starts as a draft with no comments. Earlier versions, their comments and approvals stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            add([file], { assetId, changeSummary: summary.trim() || undefined });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="version-file">Image</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                Choose file
              </Button>
              <span className="truncate text-sm text-muted-foreground">{file?.name ?? "PNG, JPEG or WebP"}</span>
            </div>
            <input
              id="version-file"
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (!chosen) return;
                const error = validateImageFile(chosen, MAX_UPLOAD_MB);
                if (error) toast.error(error);
                else setFile(chosen);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="version-summary">What changed? (optional)</Label>
            <Textarea
              id="version-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. Bigger Book Now button, new hero copy"
            />
          </div>
          {items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <UploadRow key={item.key} item={item} onRetry={() => retry(item.key)} onDismiss={() => dismiss(item.key)} />
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!file || busy}>
              Upload V{nextNumber}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
