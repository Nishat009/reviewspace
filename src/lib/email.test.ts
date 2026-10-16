import { beforeEach, describe, expect, it, vi } from "vitest";

const { env, send } = vi.hoisted(() => ({
  env: { EMAIL_DRIVER: "resend", RESEND_API_KEY: "test-key", EMAIL_FROM: "sender@example.test", NODE_ENV: "production", APP_URL: "http://localhost:3111" },
  send: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

import { actionEmail, appUrl, sendEmail } from "./email";

const email = { to: "recipient@example.test", subject: "Review", text: "Open review", html: "<p>Open review</p>" };

beforeEach(() => {
  env.EMAIL_DRIVER = "resend";
  send.mockReset();
  vi.restoreAllMocks();
});

describe("email transport", () => {
  it("passes the sender and message to Resend", async () => {
    send.mockResolvedValue({ error: null });
    await expect(sendEmail(email)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith({ from: env.EMAIL_FROM, ...email });
  });

  it("reports provider rejection without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValue({ error: { name: "validation_error" } });
    await expect(sendEmail(email)).resolves.toBe(false);
  });

  it("reports network failure without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("network unavailable"));
    await expect(sendEmail(email)).resolves.toBe(false);
  });

  it("uses the explicit console transport without contacting Resend", async () => {
    env.EMAIL_DRIVER = "console";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(sendEmail(email)).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining(email.text));
  });

  it("builds links for the configured server and escapes email HTML", () => {
    expect(appUrl("/s/token")).toBe("http://localhost:3111/s/token");
    const message = actionEmail({ heading: "<script>", body: "A & B", actionLabel: "Open", url: 'https://example.test/?a="b"', footer: "Bye" });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toMatch(/(?:&lt;|&#60;)script(?:&gt;|&#62;)/);
    expect(message.html).toMatch(/A (?:&amp;|&#38;) B/);
    expect(message.text).toContain("<script>");
  });
});
