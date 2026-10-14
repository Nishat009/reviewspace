"use client";

import { useState, useTransition } from "react";
import { EyeIcon, LockIcon, UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { setGuestNameAction, unlockShareAction } from "@/app/actions/share";

export function UnlockShareForm({ token, projectName }: { token: string; projectName: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await unlockShareAction(token, password);
          if (!result.ok) setError(result.error);
        });
      }}
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LockIcon className="size-4" aria-hidden /> “{projectName}” is password-protected.
      </p>
      <Label htmlFor="share-password">Password</Label>
      <Input
        id="share-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        aria-invalid={!!error}
        aria-describedby={error ? "share-password-error" : undefined}
        autoFocus
      />
      {error && (
        <p id="share-password-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!password || pending}>
        {pending && <Spinner />} Open
      </Button>
    </form>
  );
}

/** Shows how the visitor appears, and lets a commenting guest set their name. */
export function GuestIdentity({
  token,
  permission,
  guestName,
}: {
  token: string;
  permission: "VIEW" | "COMMENT";
  guestName: string | null;
}) {
  const [name, setName] = useState(guestName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (permission === "VIEW") {
    return (
      <Badge variant="outline">
        <EyeIcon aria-hidden /> View only
      </Badge>
    );
  }

  const form = (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setGuestNameAction(token, name);
          if (result.ok) setOpen(false);
          else setError(result.error);
        });
      }}
    >
      <Label htmlFor="guest-name">Your name</Label>
      <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
      <p className="text-xs text-muted-foreground">Shown next to your comments as a guest. Guests can comment but not approve.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={pending || name.trim().length < 2}>
        {pending && <Spinner />} {guestName ? "Save" : "Start commenting"}
      </Button>
    </form>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={guestName ? "ghost" : "default"}>
          <UserIcon aria-hidden /> {guestName ? guestName : "Add your name to comment"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        {form}
      </PopoverContent>
    </Popover>
  );
}
