import { parseBody } from "@/lib/mentions";

/**
 * Renders a comment body as text nodes only (never HTML), with mentions
 * styled. This is what rules out stored XSS through comments.
 */
export function CommentBody({ body }: { body: string }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parseBody(body).map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
            @{segment.name}
          </span>
        ),
      )}
    </p>
  );
}
