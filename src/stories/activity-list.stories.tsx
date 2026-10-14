import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ActivityList } from "@/components/activity-list";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 12, minutes));

const meta: Meta<typeof ActivityList> = {
  title: "Projects/ActivityList",
  component: ActivityList,
  decorators: [(Story) => <div className="w-96"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof ActivityList>;

export const History: Story = {
  args: {
    events: [
      { id: "1", type: "review.decided", createdAt: at(40), actor: { name: "Sara Ahmed" }, metadata: { decision: "APPROVED", label: "Checkout V2" } },
      { id: "2", type: "review.requested", createdAt: at(30), actor: { name: "Nadia Rahman" }, metadata: { label: "Checkout V2" } },
      { id: "3", type: "version.added", createdAt: at(20), actor: { name: "Rafi Hasan" }, metadata: { assetName: "Checkout", versionNumber: 2 } },
      { id: "4", type: "member.invited", createdAt: at(10), actor: { name: "Nadia Rahman" }, metadata: { email: "sara@example.com", role: "CLIENT" } },
    ],
  },
};

export const Empty: Story = { args: { events: [] } };
