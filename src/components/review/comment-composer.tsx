"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { editableToMarkup } from "@/lib/mentions";
import { COMMENT_MAX_LENGTH } from "@/lib/validation/review";
import { MAX_ATTACHMENT_MB } from "@/lib/validation/shared";
import { cn } from "@/lib/utils";
import { startAttachmentUploadAction } from "@/app/actions/review";
import { ACCEPTED_IMAGE_TYPES, putFile, validateImageFile } from "@/components/upload/put-file";
import { useReviewEnv } from "./review-context";
import { useMentionCandidates } from "./use-review-data";

export type PendingAttachment = { key: string; file: File; previewUrl: string; uploadId?: string; status: "uploading" | "ready" | "failed" };

export function CommentComposer({
  versionId,
  internal,
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  placeholder,
  autoFocus,
  allowAttachments = true,
  initialMentions,
  label,
}: {
  versionId: string;
  internal: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (body: string, attachmentIds: string[]) => Promise<boolean>;
  onCancel?: () => void;
  submitLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  allowAttachments?: boolean;
  initialMentions?: Map<string, string>;
  label: string;
}) {
  const { shareToken, viewer } = useReviewEnv();
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mentions] = useState(() => new Map(initialMentions ?? []));
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canMention = !viewer.isGuest;
  const { data: candidates = [] } = useMentionCandidates(versionId, internal, canMention && mentionQuery !== null);
  const matches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return candidates.filter((c) => c.id !== viewer.userId && c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [candidates, mentionQuery, viewer.userId]);

  const updateMentionQuery = (text: string, caret: number) => {
    if (!canMention) return;
    const match = /(?:^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
    setMentionQuery(match ? match[1]! : null);
    setActiveIndex(0);
  };

  const insertMention = (candidate: { id: string; name: string }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caret = textarea.selectionStart;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${candidate.name} `);
    const next = before + value.slice(caret);
    mentions.set(candidate.name, candidate.id);
    onChange(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(before.length, before.length);
    });
  };

  const addFiles = async (files: FileList) => {
    for (const file of [...files].slice(0, 4 - attachments.length)) {
      const error = validateImageFile(file, MAX_ATTACHMENT_MB);
      if (error) {
        toast.error(error);
        continue;
      }
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setAttachments((current) => [...current, { key, file, previewUrl: URL.createObjectURL(file), status: "uploading" }]);
      try {
        const started = await startAttachmentUploadAction(
          { versionId, fileName: file.name, contentType: file.type, sizeBytes: file.size },
          shareToken,
        );
        if (!started.ok || !started.data) throw new Error(started.ok ? "Upload failed." : started.error);
        await putFile(started.data.upload, file);
        const uploadId = started.data.uploadId;
        setAttachments((current) => current.map((a) => (a.key === key ? { ...a, uploadId, status: "ready" } : a)));
      } catch (error) {
        toast.error((error as Error).message);
        setAttachments((current) => current.map((a) => (a.key === key ? { ...a, status: "failed" } : a)));
      }
    }
  };

  const uploading = attachments.some((a) => a.status === "uploading");
  const trimmed = value.trim();

  const submit = async () => {
    if (!trimmed || submitting || uploading) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit(
        editableToMarkup(trimmed, mentions),
        attachments.filter((a) => a.status === "ready" && a.uploadId).map((a) => a.uploadId!),
      );
      if (ok) {
        for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
        setAttachments([]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const listboxId = `${id}-mentions`;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <label htmlFor={`${id}-input`} className="sr-only">
          {label}
        </label>
        <Textarea
          id={`${id}-input`}
          ref={textareaRef}
          value={value}
          autoFocus={autoFocus}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={placeholder ?? (canMention ? "Write a comment… use @ to mention" : "Write a comment…")}
          rows={3}
          role={mentionQuery !== null && matches.length > 0 ? "combobox" : undefined}
          aria-expanded={mentionQuery !== null && matches.length > 0 ? true : undefined}
          aria-controls={mentionQuery !== null && matches.length > 0 ? listboxId : undefined}
          aria-activedescendant={mentionQuery !== null && matches[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            updateMentionQuery(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (mentionQuery !== null && matches.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % matches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insertMention(matches[activeIndex]!);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setMentionQuery(null);
                return;
              }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape" && onCancel) {
              e.stopPropagation();
              onCancel();
            }
          }}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          className="min-h-20 resize-y"
        />
        {mentionQuery !== null && matches.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="People to mention"
            className="absolute top-full left-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
          >
            {matches.map((candidate, index) => (
              <li
                key={candidate.id}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(candidate);
                }}
                className={cn("cursor-pointer rounded-md px-2 py-1.5 text-sm", index === activeIndex && "bg-accent text-accent-foreground")}
              >
                <span className="font-medium">{candidate.name}</span>
                {candidate.email && <span className="block truncate text-xs text-muted-foreground">{candidate.email}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Attachments">
          {attachments.map((a) => (
            <li key={a.key} className="relative size-16 overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={a.previewUrl} alt={a.file.name} className={cn("size-full object-cover", a.status !== "ready" && "opacity-50")} />
              {a.status === "uploading" && <Spinner className="absolute inset-0 m-auto" />}
              {a.status === "failed" && <span className="absolute inset-x-0 bottom-0 bg-destructive text-center text-[10px] text-white">Failed</span>}
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(a.previewUrl);
                  setAttachments((current) => current.filter((x) => x.key !== a.key));
                }}
                aria-label={`Remove ${a.file.name}`}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        {allowAttachments && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => fileRef.current?.click()}
              disabled={attachments.length >= 4}
              aria-label="Attach images"
              title="Attach images"
            >
              <ImagePlusIcon />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
        <span className="text-xs text-muted-foreground max-sm:hidden">Ctrl + Enter to send</span>
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => void submit()} disabled={!trimmed || submitting || uploading}>
            {submitting && <Spinner />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
