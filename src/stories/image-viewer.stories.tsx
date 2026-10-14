import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EditorStoreProvider } from "@/components/review/editor-store";
import { ImageViewer } from "@/components/review/image-viewer";
import type { ThreadDTO } from "@/lib/review-types";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#fff7ed"/><text x="80" y="200" font-size="64" font-family="Arial">Your next escape</text><rect x="80" y="300" width="300" height="80" rx="40" fill="#ea580c"/></svg>`;
const image = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const person = (name: string) => ({ id: name, name, avatarUrl: null, isGuest: false });
const thread = (n: number, x: number, y: number, patch: Partial<ThreadDTO> = {}): ThreadDTO => ({
  id: `t${n}`,
  number: n,
  x,
  y,
  visibility: "PUBLIC",
  createdBy: person("Sara Ahmed"),
  createdAt: new Date().toISOString(),
  resolvedAt: null,
  resolvedBy: null,
  clientMutationId: `m${n}`,
  preview: "Make this stand out more",
  commentCount: 1,
  lastActivityAt: new Date().toISOString(),
  canResolve: true,
  ...patch,
});

/**
 * Zoom, pan and the View/Comment modes with pins stored as normalized
 * positions. Zoom in: pins stay on the same image point and keep their size.
 */
const meta: Meta<typeof ImageViewer> = {
  title: "Review/ImageViewer",
  component: ImageViewer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <EditorStoreProvider>
        <div className="h-[600px]">
          <Story />
        </div>
      </EditorStoreProvider>
    ),
  ],
  args: {
    imageUrl: image,
    width: 1200,
    height: 800,
    alt: "Travel homepage",
    canComment: true,
    threads: [
      thread(1, 0.19, 0.42),
      thread(2, 0.4, 0.22, { visibility: "INTERNAL", createdBy: person("Rafi Hasan"), preview: "Use brand orange" }),
      thread(3, 0.8, 0.7, { resolvedAt: new Date().toISOString(), preview: "Fixed footer spacing" }),
    ],
  },
};
export default meta;

export const WithPins: StoryObj<typeof ImageViewer> = {};
export const ReadOnly: StoryObj<typeof ImageViewer> = { args: { canComment: false } };
