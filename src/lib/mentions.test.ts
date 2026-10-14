import { describe, expect, it } from "vitest";
import { bodyToPlainText, editableToMarkup, extractMentionIds, markupToEditable, mentionMarkup, parseBody } from "./mentions";

const sara = { id: "cmsara0000000000000000001", name: "Sara Ahmed" };
const ann = { id: "cmann00000000000000000001", name: "Ann" };
const anna = { id: "cmanna0000000000000000001", name: "Anna Lee" };

describe("mention markup", () => {
  it("parses text and mentions into segments", () => {
    const body = `Hi ${mentionMarkup(sara)}, thoughts?`;
    expect(parseBody(body)).toEqual([
      { type: "text", text: "Hi " },
      { type: "mention", name: "Sara Ahmed", userId: sara.id },
      { type: "text", text: ", thoughts?" },
    ]);
    expect(extractMentionIds(body)).toEqual([sara.id]);
    expect(bodyToPlainText(body)).toBe("Hi @Sara Ahmed, thoughts?");
  });

  it("treats HTML as plain text (it is never rendered as markup)", () => {
    const body = `<img src=x onerror=alert(1)> ${mentionMarkup(sara)}`;
    expect(parseBody(body)[0]).toEqual({ type: "text", text: "<img src=x onerror=alert(1)> " });
  });

  it("ignores malformed mention markup", () => {
    expect(extractMentionIds("@[Sara](not an id) and @[](cm1234567890)")).toEqual([]);
  });

  it("de-duplicates repeated mentions", () => {
    expect(extractMentionIds(`${mentionMarkup(sara)} ${mentionMarkup(sara)}`)).toEqual([sara.id]);
  });

  it("strips characters that would break the markup from names", () => {
    expect(mentionMarkup({ id: sara.id, name: "Sara ]Ahmed\n" })).toBe(`@[Sara Ahmed](${sara.id})`);
  });
});

describe("editable text ↔ markup", () => {
  it("round-trips", () => {
    const body = `${mentionMarkup(sara)} can you check with ${mentionMarkup(anna)}?`;
    const { text, mentions } = markupToEditable(body);
    expect(text).toBe("@Sara Ahmed can you check with @Anna Lee?");
    expect(editableToMarkup(text, mentions)).toBe(body);
  });

  it("matches whole names only and prefers the longest", () => {
    const mentions = new Map([
      [ann.name, ann.id],
      [anna.name, anna.id],
    ]);
    const markup = editableToMarkup("@Anna Lee and @Ann, not @Annabel", mentions);
    expect(extractMentionIds(markup).sort()).toEqual([ann.id, anna.id].sort());
    expect(markup).toContain("not @Annabel");
  });

  it("leaves names that weren't picked from the list as plain text", () => {
    expect(editableToMarkup("@Someone hello", new Map())).toBe("@Someone hello");
  });
});
