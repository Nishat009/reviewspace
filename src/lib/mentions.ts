/**
 * Mentions are stored inside the plain-text comment body as
 * `@[Display Name](userId)`. Bodies are always rendered as text nodes, never
 * HTML, so the markup is parsed here into segments instead of being injected.
 */
const MENTION = /@\[([^\]\n]{1,80})\]\(([a-z0-9]{10,40})\)/g;

export type BodySegment = { type: "text"; text: string } | { type: "mention"; name: string; userId: string };

export function parseBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", text: body.slice(last, index) });
    segments.push({ type: "mention", name: match[1]!, userId: match[2]! });
    last = index + match[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

export function extractMentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION)].map((m) => m[2]!))];
}

export function mentionMarkup(user: { id: string; name: string }) {
  return `@[${user.name.replace(/[\]\n]/g, "")}](${user.id})`;
}

/** Plain-text rendering, e.g. for email and notification previews. */
export function bodyToPlainText(body: string) {
  return parseBody(body)
    .map((s) => (s.type === "text" ? s.text : `@${s.name}`))
    .join("");
}

/** Converts stored markup to editable text plus the mentions it contains. */
export function markupToEditable(body: string) {
  const mentions = new Map<string, string>();
  const text = parseBody(body)
    .map((segment) => {
      if (segment.type === "text") return segment.text;
      mentions.set(segment.name, segment.userId);
      return `@${segment.name}`;
    })
    .join("");
  return { text, mentions };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turns "@Name" back into mention markup for names picked from the list. */
export function editableToMarkup(text: string, mentions: Map<string, string>) {
  let result = text;
  // Longest names first so "Ann" never eats part of "Anna Lee", and only
  // whole names: "@Ann" must not match inside "@Annabel".
  for (const [name, id] of [...mentions].sort((a, b) => b[0].length - a[0].length)) {
    const pattern = new RegExp(`@${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "gu");
    result = result.replace(pattern, () => mentionMarkup({ id, name }));
  }
  return result;
}

