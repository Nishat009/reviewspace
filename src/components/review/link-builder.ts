import { paths } from "@/lib/paths";

/**
 * Where editor links point. Serializable (unlike a function), so server
 * pages can hand it to client components.
 */
export type LinkScope =
  | { kind: "workspace"; slug: string; projectId: string }
  | { kind: "share"; token: string };

export function assetHref(scope: LinkScope, assetId: string, opts: { version?: string; thread?: string } = {}) {
  return scope.kind === "workspace"
    ? paths.asset(scope.slug, scope.projectId, assetId, opts)
    : paths.share(scope.token, { asset: assetId, ...opts });
}

export function compareHref(scope: LinkScope, assetId: string, a?: string, b?: string) {
  if (scope.kind === "workspace") return paths.compare(scope.slug, scope.projectId, assetId, a, b);
  const params = new URLSearchParams({ asset: assetId, compare: "1" });
  if (a) params.set("a", a);
  if (b) params.set("b", b);
  return `/s/${scope.token}?${params}`;
}

export function backHref(scope: LinkScope) {
  return scope.kind === "workspace" ? paths.project(scope.slug, scope.projectId) : paths.share(scope.token);
}
