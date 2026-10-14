"use client";

import { useState, useTransition } from "react";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { archiveAssetAction, renameAssetAction } from "@/app/actions/assets";

export function AssetActions({ asset }: { asset: { id: string; name: string } }) {
  const [renaming, setRenaming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [name, setName] = useState(asset.name);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${asset.name}`} className="relative z-10">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <PencilIcon aria-hidden /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setArchiving(true)} variant="destructive">
            <ArchiveIcon aria-hidden /> Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await renameAssetAction(asset.id, name);
                if (result.ok) {
                  toast.success(result.message ?? "Renamed.");
                  setRenaming(false);
                } else toast.error(result.error);
              });
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Rename asset</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rename-${asset.id}`}>Name</Label>
              <Input id={`rename-${asset.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiving} onOpenChange={setArchiving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{asset.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the project for everyone. Versions, comments and approvals are kept in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const result = await archiveAssetAction(asset.id);
                  if (result.ok) {
                    toast.success(result.message ?? "Archived.");
                    setArchiving(false);
                  } else toast.error(result.error);
                });
              }}
              disabled={pending}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
