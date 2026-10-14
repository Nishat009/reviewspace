import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./safe-redirect";

describe("safeCallbackUrl()", () => {
  it.each([
    ["/w/acme", "/w/acme"],
    ["/w/acme/projects/1?version=2#thread-3", "/w/acme/projects/1?version=2#thread-3"],
    ["/invite/abc", "/invite/abc"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/\t/evil.example",
    "",
    undefined,
    ["/w/acme"],
  ])("rejects %j", (input) => {
    expect(safeCallbackUrl(input)).toBe("/dashboard");
  });

  it("uses the provided fallback", () => {
    expect(safeCallbackUrl("https://evil.example", "/onboarding")).toBe("/onboarding");
  });
});
