import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { verifyPayload } from "@/lib/signed-token";
import { LOCAL_UPLOAD_PURPOSE, localFilePath, storageDriverName } from "@/lib/storage";

/**
 * Local-driver stand-in for a signed upload URL. The token names the exact
 * object key, content type and byte limit; the body is streamed to disk and
 * the write is aborted as soon as it exceeds the limit. The file is still
 * untrusted until the finalize step re-validates it.
 */
export async function PUT(request: Request) {
  if (storageDriverName() !== "local") return new Response("Not found", { status: 404 });

  const token = new URL(request.url).searchParams.get("t");
  const claims = verifyPayload<{ p: string; ct: string; max: number }>(LOCAL_UPLOAD_PURPOSE, token);
  if (!claims) return Response.json({ error: "This upload link is invalid or has expired." }, { status: 403 });

  if (request.headers.get("content-type") !== claims.ct) {
    return Response.json({ error: "Unexpected content type." }, { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > claims.max) return Response.json({ error: "File is too large." }, { status: 413 });
  if (!request.body) return Response.json({ error: "Empty upload." }, { status: 400 });

  let file: string;
  try {
    file = localFilePath(claims.p);
  } catch {
    return Response.json({ error: "Invalid object key." }, { status: 400 });
  }
  await mkdir(path.dirname(file), { recursive: true });

  let handle;
  try {
    handle = await open(file, "wx"); // a signed URL uploads once, never overwrites
  } catch {
    return Response.json({ error: "This file was already uploaded." }, { status: 409 });
  }

  let written = 0;
  try {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > claims.max) {
        await reader.cancel();
        throw new Error("too-large");
      }
      await handle.write(value);
    }
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(file, { force: true });
    const tooLarge = (error as Error).message === "too-large";
    return Response.json({ error: tooLarge ? "File is too large." : "Upload failed." }, { status: tooLarge ? 413 : 500 });
  }

  return new Response(null, { status: 200 });
}
