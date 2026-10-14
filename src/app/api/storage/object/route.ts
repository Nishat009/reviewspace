import { readFile } from "node:fs/promises";
import { verifyPayload } from "@/lib/signed-token";
import { LOCAL_READ_PURPOSE, localFilePath, storageDriverName } from "@/lib/storage";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Local-driver stand-in for a signed read URL. */
export async function GET(request: Request) {
  if (storageDriverName() !== "local") return new Response("Not found", { status: 404 });

  const claims = verifyPayload<{ p: string }>(LOCAL_READ_PURPOSE, new URL(request.url).searchParams.get("t"));
  if (!claims) return new Response("This link is invalid or has expired.", { status: 403 });

  try {
    const body = await readFile(localFilePath(claims.p));
    const ext = claims.p.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "content-length": String(body.byteLength),
        // Private: the URL itself is the capability and expires.
        "cache-control": "private, max-age=600",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
