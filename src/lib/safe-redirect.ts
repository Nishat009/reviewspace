const FALLBACK = "/dashboard";

/**
 * Accepts only same-origin relative paths for post-login redirects, so a
 * crafted `?callbackUrl=https://evil.example` cannot bounce users off-site.
 */
export function safeCallbackUrl(value: unknown, fallback = FALLBACK): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return fallback;
  }
  // Must be a path: starts with a single "/" and not "//" or "/\" (protocol-relative).
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  // Reject control characters, which some browsers strip before parsing.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const url = new URL(value, "http://reviewspace.invalid");
    if (url.origin !== "http://reviewspace.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
