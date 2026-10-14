import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PersonAvatar } from "@/components/person-avatar";
import { CommentBody } from "@/components/review/comment-body";
import { mentionMarkup } from "@/lib/mentions";

const meta: Meta<typeof CommentBody> = {
  title: "Review/CommentBody",
  component: CommentBody,
  decorators: [(Story) => <div className="w-80"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof CommentBody>;

export const Plain: Story = { args: { body: "Can the Book Now button stand out more?" } };

export const WithMention: Story = {
  args: { body: `${mentionMarkup({ id: "cmsara0000000000000000001", name: "Sara Ahmed" })} does the price wording work for you?` },
};

/** Bodies render as text nodes only: markup in a comment is shown, never executed. */
export const HtmlIsInert: Story = { args: { body: `<img src=x onerror="alert('xss')"> stays text` } };

export const Avatars: StoryObj<typeof PersonAvatar> = {
  render: () => (
    <div className="flex gap-2">
      <PersonAvatar person={{ name: "Sara Ahmed" }} />
      <PersonAvatar person={{ name: "Rafi Hasan" }} className="size-9" />
      <PersonAvatar person={{ name: "Board Member" }} className="size-12" />
    </div>
  ),
};
