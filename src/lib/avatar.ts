/**
 * Avatars live in the private bucket. Pages link to an authenticated route
 * that redirects to a short-lived signed URL; the stored path doubles as a
 * cache-buster because a new upload always gets a new path.
 */
export function avatarUrl(user: { id: string; image: string | null }) {
  if (!user.image) return null;
  return `/api/avatars/${user.id}?v=${encodeURIComponent(user.image.split("/").pop() ?? "")}`;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}
