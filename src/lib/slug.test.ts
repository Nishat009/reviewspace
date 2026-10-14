import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify()", () => {
  it.each([
    ["Acme Design Co.", "acme-design-co"],
    ["  Café Créatif  ", "cafe-creatif"],
    ["---", ""],
    ["নিশাত Studio", "studio"],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps length without a trailing dash", () => {
    const slug = slugify(`${"a".repeat(47)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});
