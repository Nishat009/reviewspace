"use client";

import type { UploadTarget } from "@/lib/storage";

/**
 * Uploads a file straight to storage with progress. XHR rather than fetch
 * because fetch has no upload progress events.
 */
export function putFile(target: UploadTarget, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = "Upload failed.";
        try {
          message = (JSON.parse(xhr.responseText) as { error?: string; message?: string }).error ?? message;
        } catch {
          // non-JSON error body
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and retry."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validateImageFile(file: File, maxMb: number): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return `${file.name}: use a PNG, JPEG or WebP image.`;
  if (file.size > maxMb * 1024 * 1024) return `${file.name}: images must be ${maxMb} MB or smaller.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}
