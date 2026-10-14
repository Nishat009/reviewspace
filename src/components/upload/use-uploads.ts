"use client";

import { useCallback, useRef, useState } from "react";
import { abandonUploadAction, finalizeUploadAction, startUploadAction } from "@/app/actions/assets";
import { putFile } from "./put-file";

export type UploadItem = {
  key: string;
  file: File;
  /** Set once the server created the asset, so a retry adds to it instead of making another. */
  assetId?: string;
  assetName?: string;
  changeSummary?: string;
  status: "uploading" | "processing" | "done" | "failed";
  progress: number;
  error?: string;
  result?: { assetId: string; versionId: string; versionNumber: number };
};

type Options = {
  projectId: string;
  onComplete?: (item: UploadItem) => void;
};

/**
 * Drives the three-step upload (reserve → PUT to storage → finalize) for any
 * number of files, with progress and retry. A failed item keeps its asset id
 * so retrying never creates a duplicate asset.
 */
export function useUploads({ projectId, onComplete }: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const counter = useRef(0);

  const patch = useCallback((key: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  const run = useCallback(
    async (item: UploadItem) => {
      patch(item.key, { status: "uploading", progress: 0, error: undefined });
      let versionId: string | undefined;
      try {
        const started = await startUploadAction({
          projectId,
          assetId: item.assetId,
          assetName: item.assetId ? undefined : item.assetName,
          fileName: item.file.name,
          contentType: item.file.type as "image/png",
          sizeBytes: item.file.size,
          changeSummary: item.changeSummary,
        });
        if (!started.ok || !started.data) throw new Error(started.ok ? "Upload failed." : started.error);
        versionId = started.data.versionId;
        patch(item.key, { assetId: started.data.assetId });

        await putFile(started.data.upload, item.file, (fraction) => patch(item.key, { progress: Math.round(fraction * 100) }));

        patch(item.key, { status: "processing", progress: 100 });
        const finalized = await finalizeUploadAction(versionId);
        if (!finalized.ok || !finalized.data) throw new Error(finalized.ok ? "Processing failed." : finalized.error);

        const done: UploadItem = { ...item, assetId: finalized.data.assetId, status: "done", progress: 100, result: finalized.data };
        patch(item.key, done);
        onComplete?.(done);
      } catch (error) {
        if (versionId) void abandonUploadAction(versionId);
        patch(item.key, { status: "failed", error: (error as Error).message });
      }
    },
    [patch, projectId, onComplete],
  );

  const add = useCallback(
    (files: File[], extra: { assetId?: string; changeSummary?: string } = {}) => {
      const created = files.map<UploadItem>((file) => ({
        key: `upload-${++counter.current}`,
        file,
        assetId: extra.assetId,
        changeSummary: extra.changeSummary,
        assetName: undefined,
        status: "uploading",
        progress: 0,
      }));
      setItems((current) => [...created, ...current]);
      // Sequential keeps server-side processing (sharp) from piling up.
      void (async () => {
        for (const item of created) await run(item);
      })();
    },
    [run],
  );

  const retry = useCallback(
    (key: string) => {
      const item = items.find((i) => i.key === key);
      if (item) void run(item);
    },
    [items, run],
  );

  const dismiss = useCallback((key: string) => setItems((current) => current.filter((i) => i.key !== key)), []);

  return { items, add, retry, dismiss };
}
