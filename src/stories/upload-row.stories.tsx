import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UploadRow } from "@/components/upload/upload-row";
import type { UploadItem } from "@/components/upload/use-uploads";

const file = new File(["x"], "homepage-v2.png", { type: "image/png" });
const item = (patch: Partial<UploadItem>): UploadItem => ({ key: "1", file, status: "uploading", progress: 42, ...patch });

const meta: Meta<typeof UploadRow> = {
  title: "Upload/UploadRow",
  component: UploadRow,
  args: { onRetry: () => {}, onDismiss: () => {} },
  decorators: [(Story) => <ul className="w-[28rem]"><Story /></ul>],
};
export default meta;
type Story = StoryObj<typeof UploadRow>;

export const Uploading: Story = { args: { item: item({}) } };
export const Processing: Story = { args: { item: item({ status: "processing", progress: 100 }) } };
export const Done: Story = {
  args: { item: item({ status: "done", progress: 100, result: { assetId: "a", versionId: "v", versionNumber: 2 } }) },
};
export const Failed: Story = { args: { item: item({ status: "failed", error: "Network error while uploading. Check your connection and retry." }) } };
