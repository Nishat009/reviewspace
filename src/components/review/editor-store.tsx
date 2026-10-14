"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { AnnotationPosition } from "@/lib/annotation";

/**
 * Local editor state: interaction mode, selection, the draft pin and zoom.
 * Server data (threads, comments) lives in TanStack Query, not here.
 *
 * "view" and "comment" are explicit modes so the same click never sometimes
 * pans and sometimes creates a pin.
 */
export type EditorMode = "view" | "comment";
export type ThreadFilter = "open" | "resolved" | "all";

export type EditorState = {
  mode: EditorMode;
  selectedThreadId: string | null;
  hoveredThreadId: string | null;
  draft: AnnotationPosition | null;
  /** Kept separately from the pin so a failed submit never loses the text. */
  draftBody: string;
  draftVisibility: "PUBLIC" | "INTERNAL";
  showPins: boolean;
  filter: ThreadFilter;
  zoomPercent: number;
  mobilePanel: "image" | "comments" | "review";

  setMode: (mode: EditorMode) => void;
  selectThread: (id: string | null) => void;
  hoverThread: (id: string | null) => void;
  placeDraft: (position: AnnotationPosition) => void;
  cancelDraft: () => void;
  setDraftBody: (body: string) => void;
  setDraftVisibility: (visibility: "PUBLIC" | "INTERNAL") => void;
  togglePins: () => void;
  setFilter: (filter: ThreadFilter) => void;
  setZoomPercent: (percent: number) => void;
  setMobilePanel: (panel: EditorState["mobilePanel"]) => void;
};

export function createEditorStore(initial: Partial<Pick<EditorState, "selectedThreadId">> = {}) {
  return createStore<EditorState>()((set) => ({
    mode: "view",
    selectedThreadId: initial.selectedThreadId ?? null,
    hoveredThreadId: null,
    draft: null,
    draftBody: "",
    draftVisibility: "PUBLIC",
    showPins: true,
    filter: "open",
    zoomPercent: 100,
    mobilePanel: "image",

    setMode: (mode) => set((s) => ({ mode, draft: mode === "view" && !s.draftBody ? null : s.draft })),
    selectThread: (id) => set({ selectedThreadId: id }),
    hoverThread: (id) => set({ hoveredThreadId: id }),
    placeDraft: (position) => set({ draft: position, selectedThreadId: null, showPins: true }),
    cancelDraft: () => set({ draft: null, draftBody: "", draftVisibility: "PUBLIC" }),
    setDraftBody: (draftBody) => set({ draftBody }),
    setDraftVisibility: (draftVisibility) => set({ draftVisibility }),
    togglePins: () => set((s) => ({ showPins: !s.showPins })),
    setFilter: (filter) => set({ filter }),
    setZoomPercent: (zoomPercent) => set({ zoomPercent }),
    setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  }));
}

const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null);

export function EditorStoreProvider({
  children,
  initialThreadId,
}: {
  children: ReactNode;
  initialThreadId?: string | null;
}) {
  const [store] = useState(() => createEditorStore({ selectedThreadId: initialThreadId ?? null }));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditor must be used inside EditorStoreProvider");
  return useStore(store, selector);
}

export function useEditorStore() {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used inside EditorStoreProvider");
  return store;
}
