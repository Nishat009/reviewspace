"use client";

import { useState, useTransition } from "react";
import { CopyIcon, LinkIcon, LockIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createShareLinkAction, revokeShareLinkAction } from "@/app/actions/share";

type ShareLinkRow = {
  id: string;
  label: string | null;
  permission: "VIEW" | "COMMENT";
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  hasPassword: boolean;
  expired: boolean;
  createdBy: { name: string };
  _count: { guests: number };
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function ShareLinks({ projectId, links, disabled }: { projectId: string; links: ShareLinkRow[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [permission, setPermission] = useState<"VIEW" | "COMMENT">("VIEW");
  const [expires, setExpires] = useState("14");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setCreatedUrl(null);
    setPermission("VIEW");
    setExpires("14");
    setLabel("");
    setPassword("");
    setError(null);
  };

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Share links let people without an account view (or comment on) this project&apos;s latest versions. They can never
          approve.
        </p>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" disabled={disabled}>
              <PlusIcon aria-hidden /> New share link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdUrl ? "Share link ready" : "New share link"}</DialogTitle>
              <DialogDescription>
                {createdUrl
                  ? "Copy it now — for security we only store a fingerprint and can't show it again."
                  : "Anyone with the link can open this project's latest versions."}
              </DialogDescription>
            </DialogHeader>
            {createdUrl ? (
              <div className="flex gap-2">
                <Input readOnly value={createdUrl} aria-label="Share link" onFocus={(e) => e.target.select()} />
                <Button onClick={() => copy(createdUrl)}>
                  <CopyIcon aria-hidden /> Copy
                </Button>
              </div>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  startTransition(async () => {
                    const result = await createShareLinkAction({
                      projectId,
                      label,
                      permission,
                      expiresInDays: Number(expires),
                      password,
                    });
                    if (result.ok && result.url) setCreatedUrl(result.url);
                    else if (!result.ok) setError(result.error);
                  });
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="share-label">Label (optional)</Label>
                  <Input id="share-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Board review" />
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">Access</legend>
                  <RadioGroup value={permission} onValueChange={(v) => setPermission(v as "VIEW" | "COMMENT")}>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="perm-view" value="VIEW" />
                      <Label htmlFor="perm-view" className="font-normal">
                        View only
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="perm-comment" value="COMMENT" />
                      <Label htmlFor="perm-comment" className="font-normal">
                        View and comment (guests enter a name)
                      </Label>
                    </div>
                  </RadioGroup>
                </fieldset>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="share-expiry">Expires</Label>
                  <Select value={expires} onValueChange={setExpires}>
                    <SelectTrigger id="share-expiry" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">In 1 day</SelectItem>
                      <SelectItem value="7">In 7 days</SelectItem>
                      <SelectItem value="14">In 14 days</SelectItem>
                      <SelectItem value="30">In 30 days</SelectItem>
                      <SelectItem value="0">Never (revoke manually)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="share-password">Password (optional)</Label>
                  <Input
                    id="share-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-describedby="share-password-hint"
                  />
                  <p id="share-password-hint" className="text-xs text-muted-foreground">
                    At least 6 characters. Share it separately from the link.
                  </p>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={pending}>
                    {pending && <Spinner />} Create link
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {links.length === 0 ? (
        <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">No share links yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {links.map((link) => {
            const active = !link.revokedAt && !link.expired;
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <LinkIcon className="size-4 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{link.label ?? "Untitled link"}</span>
                  <span className="text-xs text-muted-foreground">
                    Created by {link.createdBy.name} on {dateFormat.format(link.createdAt)}
                    {link.expiresAt && ` · ${link.expired ? "expired" : "expires"} ${dateFormat.format(link.expiresAt)}`}
                    {link._count.guests > 0 && ` · ${link._count.guests} guest${link._count.guests === 1 ? "" : "s"}`}
                  </span>
                </div>
                <Badge variant="secondary">{link.permission === "COMMENT" ? "Can comment" : "View only"}</Badge>
                {link.hasPassword && (
                  <Badge variant="outline">
                    <LockIcon aria-hidden /> Password
                  </Badge>
                )}
                {link.revokedAt ? (
                  <Badge variant="outline">Revoked</Badge>
                ) : link.expired ? (
                  <Badge variant="outline">Expired</Badge>
                ) : null}
                {active && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await revokeShareLinkAction(link.id);
                        if (result.ok) toast.success(result.message ?? "Revoked.");
                        else toast.error(result.error);
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
