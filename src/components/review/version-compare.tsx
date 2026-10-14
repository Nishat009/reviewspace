"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { ArrowLeftIcon, ColumnsIcon, InfoIcon, LayersIcon, LinkIcon, UnlinkIcon } from "lucide-react";
import { ReviewStateBadge } from "@/components/review-state-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ReviewState } from "@/generated/prisma/enums";
import { assetHref, compareHref, type LinkScope } from "./link-builder";

type Side = {
  id: string;
  versionNumber: number;
  reviewState: ReviewState;
  changeSummary: string | null;
  width: number;
  height: number;
  url: string;
  openThreads: number;
};

/**
 * Side-by-side (with optional synced zoom/pan) or an overlay with a
 * before/after slider. Versions with different dimensions are shown fitted to
 * the same width and flagged, rather than silently stretched.
 */
export function VersionCompare({
  scope,
  asset,
  versions,
  left,
  right,
}: {
  scope: LinkScope;
  asset: { id: string; name: string; projectName: string };
  versions: { id: string; versionNumber: number }[];
  left: Side;
  right: Side;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"side" | "overlay">("side");
  const [split, setSplit] = useState(50);
  const sameSize = left.width === right.width && left.height === right.height;
  const [synced, setSynced] = useState(sameSize);

  const pick = (which: "a" | "b", id: string) =>
    router.push(which === "a" ? compareHref(scope, asset.id, id, right.id) : compareHref(scope, asset.id, left.id, id));

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={assetHref(scope, asset.id, { version: right.id })} aria-label="Back to review">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-muted-foreground">{asset.projectName}</span>
          <h1 className="truncate text-sm font-semibold">Compare · {asset.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <VersionPicker label="Left version" value={left.id} versions={versions} exclude={right.id} onChange={(id) => pick("a", id)} />
          <span className="text-sm text-muted-foreground">vs</span>
          <VersionPicker label="Right version" value={right.id} versions={versions} exclude={left.id} onChange={(id) => pick("b", id)} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {mode === "side" && sameSize && (
            <Button variant="ghost" size="sm" onClick={() => setSynced((s) => !s)} aria-pressed={synced}>
              {synced ? <LinkIcon aria-hidden /> : <UnlinkIcon aria-hidden />} {synced ? "Synced zoom" : "Independent zoom"}
            </Button>
          )}
          <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as "side" | "overlay")} aria-label="Compare mode">
            <ToggleGroupItem value="side" aria-label="Side by side">
              <ColumnsIcon /> <span className="max-sm:sr-only">Side by side</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="overlay" aria-label="Overlay slider">
              <LayersIcon /> <span className="max-sm:sr-only">Overlay</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>

      {!sameSize && (
        <p className="flex items-center gap-2 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" role="note">
          <InfoIcon className="size-3.5" aria-hidden />
          Different sizes: V{left.versionNumber} is {left.width}×{left.height}px, V{right.versionNumber} is {right.width}×{right.height}px.
          Both are fitted to the same width, so positions may not line up exactly.
        </p>
      )}

      {mode === "side" ? (
        <SideBySide left={left} right={right} synced={synced && sameSize} scope={scope} assetId={asset.id} />
      ) : (
        <Overlay left={left} right={right} split={split} onSplit={setSplit} />
      )}
    </div>
  );
}

function VersionPicker({
  label,
  value,
  versions,
  exclude,
  onChange,
}: {
  label: string;
  value: string;
  versions: { id: string; versionNumber: number }[];
  exclude: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-20" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id} disabled={v.id === exclude}>
            V{v.versionNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SideBySide({ left, right, synced, scope, assetId }: { left: Side; right: Side; synced: boolean; scope: LinkScope; assetId: string }) {
  const refs = useRef<(ReactZoomPanPinchRef | null)[]>([null, null]);
  const syncing = useRef(false);

  const mirror = (from: 0 | 1, state: { positionX: number; positionY: number; scale: number }) => {
    if (!synced || syncing.current) return;
    const other = refs.current[from === 0 ? 1 : 0];
    if (!other) return;
    syncing.current = true;
    other.setTransform(state.positionX, state.positionY, state.scale, 0);
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
      {[left, right].map((side, index) => (
        <section key={side.id} aria-label={`Version ${side.versionNumber}`} className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-sm">
            <span className="font-medium">V{side.versionNumber}</span>
            <ReviewStateBadge state={side.reviewState} />
            {side.openThreads > 0 && (
              <Link href={assetHref(scope, assetId, { version: side.id })} className="text-xs underline">
                {side.openThreads} unresolved {side.openThreads === 1 ? "comment" : "comments"}
              </Link>
            )}
            {side.changeSummary && <span className="w-full truncate text-xs text-muted-foreground">{side.changeSummary}</span>}
          </div>
          <div className="relative min-h-0 flex-1 bg-muted/40">
            <TransformWrapper
              ref={(r) => {
                refs.current[index] = r;
              }}
              minScale={0.02}
              maxScale={8}
              fitOnInit="contain"
              centerOnInit
              onTransform={(_ref, state) => mirror(index as 0 | 1, state)}
            >
              <TransformComponent wrapperClass="!size-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img src={side.url} alt={`Version ${side.versionNumber}`} width={side.width} height={side.height} className="block max-w-none" style={{ width: side.width, height: side.height }} />
              </TransformComponent>
            </TransformWrapper>
          </div>
        </section>
      ))}
    </div>
  );
}

function Overlay({ left, right, split, onSplit }: { left: Side; right: Side; split: number; onSplit: (value: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    onSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2 text-sm">
        <span className="shrink-0 font-medium">V{left.versionNumber}</span>
        <Slider
          value={[split]}
          onValueChange={([value]) => onSplit(value ?? 50)}
          min={0}
          max={100}
          step={1}
          aria-label={`Reveal: ${Math.round(split)}% V${left.versionNumber}, ${100 - Math.round(split)}% V${right.versionNumber}`}
          className="max-w-md"
        />
        <span className="shrink-0 font-medium">V{right.versionNumber}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
        <div
          ref={containerRef}
          className="relative mx-auto w-full max-w-5xl touch-none select-none"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && updateFromPointer(e.clientX)}
          onPointerUp={() => {
            dragging.current = false;
          }}
        >
          {/* After (right version) underneath, before (left) clipped on top. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
          <img src={right.url} alt={`Version ${right.versionNumber}`} className="block w-full" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
          <img
            src={left.url}
            alt={`Version ${left.versionNumber}`}
            className="absolute inset-x-0 top-0 block w-full"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow" style={{ left: `${split}%` }} aria-hidden>
            <span className="absolute top-1/2 left-1/2 grid size-8 -translate-1/2 place-items-center rounded-full border-2 border-background bg-primary text-xs text-primary-foreground shadow">
              ⇔
            </span>
          </div>
          <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium">V{left.versionNumber}</span>
          <span className="absolute top-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium">V{right.versionNumber}</span>
        </div>
      </div>
    </div>
  );
}
