import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ReviewStateBadge } from "@/components/review-state-badge";

const meta: Meta<typeof ReviewStateBadge> = {
  title: "Review/ReviewStateBadge",
  component: ReviewStateBadge,
  args: { state: "IN_REVIEW" },
  argTypes: { state: { control: "select", options: ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"] } },
};
export default meta;
type Story = StoryObj<typeof ReviewStateBadge>;

export const InReview: Story = {};

/** Every state pairs an icon with text, so it never relies on colour alone. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ReviewStateBadge state="DRAFT" />
      <ReviewStateBadge state="IN_REVIEW" />
      <ReviewStateBadge state="CHANGES_REQUESTED" />
      <ReviewStateBadge state="APPROVED" />
    </div>
  ),
};
