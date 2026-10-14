"use client";

import { useEffect, useRef } from "react";
import { KeepScale, TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { EyeIcon, EyeOffIcon, HandIcon, MaximizeIcon, MessageSquarePlusIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clientToNormalized } from "@/lib/annotation";
import type { ThreadDTO } from "@/lib/review-types";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "./editor-store";

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;
const CLICK_SLOP_PX = 4;

/**
 * Zoomable, pannable image with comment pins. The content box is the image
 * at its natural pixel size, so 100% means "actual pixels". Pins sit at
 * normalized positions inside that box and are counter-scaled to stay the
 * same size on screen at any zoom.
 */
export function ImageViewer({
  imageUrl,
  width,
  height,
  alt,
  threads,
  canComment,
  onImageError,
}: {
  imageUrl: string;
  width: number;
  height: number;
  alt: string;
  threads: ThreadDTO[];
  canComment: boolean;
  onImageError?: () => void;
}) {
  const store = useEditorStore();
  const mode = useEditor((s) => s.mode);
  const draft = useEditor((s) => s.draft);
  const showPins = useEditor((s) => s.showPins);
  const selectedThreadId = useEditor((s) => s.selectedThreadId);
  const hoveredThreadId = useEditor((s) => s.hoveredThreadId);
  const zoomPercent = useEditor((s) => s.zoomPercent);
  const filter = useEditor((s) => s.filter);

  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  const visibleThreads = threads.filter((t) =>
    filter === "all" ? true : filter === "open" ? !t.resolvedAt : !!t.resolvedAt,
  );

  // Selecting a thread elsewhere (list, deep link) brings its pin into view.
  useEffect(() => {
    if (!selectedThreadId) return;
    const pin = document.getElementById(`pin-${selectedThreadId}`);
    const ref = transformRef.current;
    if (!pin || !ref) return;
    const wrapper = ref.instance.wrapperComponent?.getBoundingClientRect();
    const rect = pin.getBoundingClientRect();
    if (wrapper && (rect.left < wrapper.left || rect.right > wrapper.right || rect.top < wrapper.top || rect.bottom > wrapper.bottom)) {
      ref.zoomToElement(pin, Math.max(ref.state.scale, 0.5), 250);
    }
  }, [selectedThreadId]);

  const fit = () => transformRef.current?.fitToView({ animationTime: 200 });

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const state = store.getState();
      switch (event.key) {
        case "c":
        case "C":
          if (canComment) state.setMode(state.mode === "comment" ? "view" : "comment");
          break;
        case "v":
        case "V":
          state.setMode("view");
          break;
        case "p":
        case "P":
          state.togglePins();
          break;
        case "+":
        case "=":
          transformRef.current?.zoomIn(0.5, 150);
          break;
        case "-":
          transformRef.current?.zoomOut(0.5, 150);
          break;
        case "0":
          fit();
          break;
        case "Escape":
          if (state.draft && !state.draftBody) state.cancelDraft();
          else if (state.mode === "comment" && !state.draft) state.setMode("view");
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, canComment]);

  const onImageClick = (event: React.MouseEvent) => {
    const start = pointerDown.current;
    pointerDown.current = null;
    // A drag that ended here is a pan, not a click.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
    const image = imageRef.current;
    if (!image) return;
    const state = store.getState();
    if (state.mode !== "comment" || !canComment) {
      state.selectThread(null);
      return;
    }
    const position = clientToNormalized(event.clientX, event.clientY, image.getBoundingClientRect());
    if (!position) return; // outside the image: never create a pin on empty space
    // Re-placing the pin of a half-written comment keeps its text.
    state.placeDraft(position);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        role="toolbar"
        aria-label="Image tools"
        className="flex flex-wrap items-center gap-1 border-b bg-background px-2 py-1.5"
      >
        {canComment && (
          <div className="mr-1 flex rounded-lg border p-0.5" role="group" aria-label="Mode">
            <ModeButton
              active={mode === "view"}
              onClick={() => store.getState().setMode("view")}
              icon={<HandIcon />}
              label="View"
              shortcut="V"
            />
            <ModeButton
              active={mode === "comment"}
              onClick={() => store.getState().setMode("comment")}
              icon={<MessageSquarePlusIcon />}
              label="Comment"
              shortcut="C"
            />
          </div>
        )}
        <ToolButton label="Zoom out" shortcut="−" onClick={() => transformRef.current?.zoomOut(0.5, 150)}>
          <ZoomOutIcon />
        </ToolButton>
        <span className="w-12 text-center text-xs tabular-nums" aria-live="polite" aria-label={`Zoom ${zoomPercent} percent`}>
          {zoomPercent}%
        </span>
        <ToolButton label="Zoom in" shortcut="+" onClick={() => transformRef.current?.zoomIn(0.5, 150)}>
          <ZoomInIcon />
        </ToolButton>
        <ToolButton label="Fit to screen" shortcut="0" onClick={fit}>
          <MaximizeIcon />
        </ToolButton>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => transformRef.current?.centerView(1, 200)}
          aria-label="Actual size (100%)"
        >
          1:1
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton
          label={showPins ? "Hide pins" : "Show pins"}
          shortcut="P"
          onClick={() => store.getState().togglePins()}
          pressed={!showPins}
        >
          {showPins ? <EyeIcon /> : <EyeOffIcon />}
        </ToolButton>
        {mode === "comment" && (
          <span className="ml-auto text-xs text-muted-foreground max-sm:hidden" role="status">
            Click on the image to place a comment
          </span>
        )}
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]",
          mode === "comment" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <TransformWrapper
          ref={transformRef}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          fitOnInit="contain"
          centerOnInit
          limitToBounds
          centerZoomedOut
          doubleClick={{ disabled: mode === "comment" }}
          panning={{ disabled: mode === "comment", velocityDisabled: true }}
          wheel={{ step: 0.2 }}
          onTransform={(_ref, state) => store.getState().setZoomPercent(Math.round(state.scale * 100))}
          onInit={(ref) => store.getState().setZoomPercent(Math.round(ref.state.scale * 100))}
        >
          <TransformComponent wrapperClass="!size-full" contentClass="">
            <div
              className="relative"
              style={{ width, height }}
              onPointerDown={(e) => {
                pointerDown.current = { x: e.clientX, y: e.clientY };
              }}
              onClick={onImageClick}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt={alt}
                width={width}
                height={height}
                draggable={false}
                onError={onImageError}
                className="block size-full select-none"
              />
              {showPins &&
                visibleThreads.map((thread) => (
                  <Pin
                    key={thread.id}
                    thread={thread}
                    selected={thread.id === selectedThreadId}
                    hovered={thread.id === hoveredThreadId}
                    onSelect={() => {
                      const state = store.getState();
                      state.selectThread(thread.id);
                      state.setMobilePanel("comments");
                    }}
                  />
                ))}
              {draft && <DraftPin x={draft.x} y={draft.y} />}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}

function Pin({ thread, selected, hovered, onSelect }: { thread: ThreadDTO; selected: boolean; hovered: boolean; onSelect: () => void }) {
  const resolved = !!thread.resolvedAt;
  const label = `Comment ${thread.number} by ${thread.createdBy.name}${thread.visibility === "INTERNAL" ? ", internal" : ""}${resolved ? ", resolved" : ", open"}${thread.preview ? `: ${thread.preview}` : ""}`;
  return (
    <div className="absolute size-0" style={{ left: `${thread.x * 100}%`, top: `${thread.y * 100}%`, zIndex: selected ? 30 : hovered ? 20 : 10 }}>
      <KeepScale style={{ transformOrigin: "0 0" }}>
        <button
          id={`pin-${thread.id}`}
          type="button"
          aria-label={label}
          aria-pressed={selected}
          title={label}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={cn(
            "flex size-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border-2 text-xs font-semibold shadow-md transition-transform outline-none",
            "focus-visible:ring-4 focus-visible:ring-ring/60",
            thread.visibility === "INTERNAL"
              ? "border-violet-700 bg-violet-600 text-white"
              : resolved
                ? "border-muted-foreground/40 bg-background text-muted-foreground"
                : "border-white bg-primary text-primary-foreground",
            (selected || hovered) && "scale-125 ring-4 ring-amber-400",
          )}
          style={{ transformOrigin: "0% 100%" }}
        >
          {thread.number}
          {resolved && <span className="sr-only"> (resolved)</span>}
        </button>
      </KeepScale>
    </div>
  );
}

function DraftPin({ x, y }: { x: number; y: number }) {
  return (
    <div className="pointer-events-none absolute size-0" style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: 40 }}>
      <KeepScale style={{ transformOrigin: "0 0" }}>
        <span
          aria-hidden
          className="flex size-7 -translate-x-1/2 -translate-y-full animate-pulse items-center justify-center rounded-full rounded-bl-none border-2 border-white bg-amber-500 text-xs font-semibold text-white shadow-md"
        >
          +
        </span>
      </KeepScale>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  onClick,
  pressed,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} aria-pressed={pressed}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={active}
          onClick={onClick}
          className={cn(active && "shadow-sm")}
        >
          {icon}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} mode <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
