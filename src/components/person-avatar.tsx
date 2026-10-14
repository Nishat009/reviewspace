import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export function PersonAvatar({
  person,
  className,
}: {
  person: { name: string; avatarUrl?: string | null };
  className?: string;
}) {
  return (
    <Avatar className={cn("size-7", className)}>
      {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
      <AvatarFallback className="text-[0.7rem]">{initials(person.name)}</AvatarFallback>
    </Avatar>
  );
}
