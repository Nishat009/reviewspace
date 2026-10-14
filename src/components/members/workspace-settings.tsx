"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABELS } from "@/lib/constants";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import {
  deleteWorkspaceAction,
  leaveWorkspaceAction,
  transferOwnershipAction,
  updateWorkspaceAction,
  updateWorkspaceLogoAction,
} from "@/app/actions/members";

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string } | void>, onOk?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result) return;
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        onOk?.();
      } else toast.error(result.error);
    });
  return { pending, run };
}

export function GeneralSettings({ slug, name, canEdit }: { slug: string; name: string; canEdit: boolean }) {
  const [value, setValue] = useState(name);
  const { pending, run } = useRun();
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateWorkspaceAction(slug, { name: value }));
      }}
    >
      <Label htmlFor="workspace-name">Workspace name</Label>
      <Input id="workspace-name" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} maxLength={60} />
      {canEdit && (
        <Button type="submit" className="w-fit" disabled={pending || value.trim() === name}>
          {pending && <Spinner />} Save
        </Button>
      )}
    </form>
  );
}

export function LogoSettings({ slug, logoUrl }: { slug: string; logoUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-4">
      <div className="grid size-16 place-items-center overflow-hidden rounded-xl border bg-muted">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated redirect to a signed URL
          <img src={logoUrl} alt="Workspace logo" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending && <Spinner />} Upload logo
        </Button>
        {logoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              const data = new FormData();
              data.set("remove", "1");
              run(() => updateWorkspaceLogoAction(slug, data));
            }}
          >
            Remove
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Choose a logo image"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              toast.error("Use an image up to 5 MB.");
              return;
            }
            const data = new FormData();
            data.set("logo", file);
            run(() => updateWorkspaceLogoAction(slug, data));
          }}
        />
        <p className="w-full text-xs text-muted-foreground">Square images work best. PNG, JPEG or WebP, up to 5 MB.</p>
      </div>
    </div>
  );
}

export function TransferOwnership({
  slug,
  candidates,
}: {
  slug: string;
  candidates: { memberId: string; name: string; role: WorkspaceRole }[];
}) {
  const [memberId, setMemberId] = useState("");
  const { pending, run } = useRun();
  const candidate = candidates.find((c) => c.memberId === memberId);
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Invite a teammate (admin or member) first; ownership can only go to the team.</p>;
  }
  return (
    <div className="flex max-w-md flex-col gap-3">
      <Label htmlFor="new-owner">New owner</Label>
      <Select value={memberId} onValueChange={setMemberId}>
        <SelectTrigger id="new-owner" className="w-full">
          <SelectValue placeholder="Choose a teammate" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.memberId} value={c.memberId}>
              {c.name} · {ROLE_LABELS[c.role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="w-fit" disabled={!memberId || pending}>
            Transfer ownership
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make {candidate?.name} the owner?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll become an admin. Only the new owner can delete the workspace or transfer it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => transferOwnershipAction(slug, { memberId }))}>Transfer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DeleteWorkspace({ slug, name }: { slug: string; name: string }) {
  const [confirm, setConfirm] = useState("");
  const { pending, run } = useRun();
  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Permanently deletes every project, version, comment, approval and file in this workspace. This can&apos;t be undone.
      </p>
      <Label htmlFor="confirm-delete">
        Type <span className="font-semibold">{name}</span> to confirm
      </Label>
      <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      <Button
        variant="destructive"
        className="w-fit"
        disabled={confirm.trim() !== name || pending}
        onClick={() => run(() => deleteWorkspaceAction(slug, { confirmName: confirm }))}
      >
        {pending && <Spinner />} Delete workspace
      </Button>
    </div>
  );
}

export function LeaveWorkspace({ slug, memberId, name }: { slug: string; memberId: string; name: string }) {
  const { pending, run } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-fit" disabled={pending}>
          Leave workspace
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {name}?</AlertDialogTitle>
          <AlertDialogDescription>You&apos;ll lose access to all its projects. An admin can invite you back.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => leaveWorkspaceAction(slug, { memberId }))}>Leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
