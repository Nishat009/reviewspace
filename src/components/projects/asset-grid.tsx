import Link from "next/link";
import { ImageIcon, MessageSquareIcon } from "lucide-react";
import { ReviewStateBadge } from "@/components/review-state-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssetListItem } from "@/server/asset-service";
import { AssetActions } from "./asset-actions";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function Thumbnail({ asset, className }: { asset: AssetListItem; className?: string }) {
  if (!asset.latest?.thumbnailUrl) {
    return (
      <div className={`grid place-items-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <ImageIcon className="size-6" aria-hidden />
      </div>
    );
  }
  return (
    // Signed, short-lived URLs: the image optimizer can't cache them, so a plain img is used.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={asset.latest.thumbnailUrl} alt="" loading="lazy" className={`bg-muted object-cover object-top ${className ?? ""}`} />
  );
}

export function AssetGrid({
  assets,
  hrefFor,
  canManage,
}: {
  assets: AssetListItem[];
  hrefFor: (asset: AssetListItem) => string;
  canManage: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset) => (
        <li key={asset.id} className="group relative flex flex-col overflow-hidden rounded-xl border bg-card">
          <Thumbnail asset={asset} className="aspect-[4/3] w-full border-b" />
          <div className="flex items-start gap-2 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Link href={hrefFor(asset)} className="truncate font-medium after:absolute after:inset-0 focus-visible:outline-none">
                {asset.name}
              </Link>
              {asset.latest ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>V{asset.latest.versionNumber}</span>
                  <ReviewStateBadge state={asset.latest.reviewState} />
                  {asset.latest.openThreads > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquareIcon className="size-3" aria-hidden />
                      {asset.latest.openThreads} open
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">{asset.hasPending ? "Upload in progress or failed" : "No versions"}</span>
              )}
            </div>
            {canManage && <AssetActions asset={asset} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AssetTable({
  assets,
  hrefFor,
  canManage,
}: {
  assets: AssetListItem[];
  hrefFor: (asset: AssetListItem) => string;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">
              <span className="sr-only">Preview</span>
            </TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Version</TableHead>
            <TableHead className="max-sm:hidden">Status</TableHead>
            <TableHead className="max-md:hidden">Open threads</TableHead>
            <TableHead className="max-md:hidden">Updated</TableHead>
            {canManage && (
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell>
                <Thumbnail asset={asset} className="h-10 w-14 rounded border" />
              </TableCell>
              <TableCell className="font-medium">
                <Link href={hrefFor(asset)} className="hover:underline">
                  {asset.name}
                </Link>
              </TableCell>
              <TableCell>{asset.latest ? `V${asset.latest.versionNumber}` : "—"}</TableCell>
              <TableCell className="max-sm:hidden">{asset.latest ? <ReviewStateBadge state={asset.latest.reviewState} /> : "—"}</TableCell>
              <TableCell className="max-md:hidden">{asset.latest?.openThreads ?? 0}</TableCell>
              <TableCell className="text-muted-foreground max-md:hidden">{dateFormat.format(asset.updatedAt)}</TableCell>
              {canManage && (
                <TableCell>
                  <AssetActions asset={asset} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
