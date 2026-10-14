/**
 * Pin positions are stored normalized to the image (0–1 on both axes), never
 * in screen pixels, so a pin stays on the same image location across zoom,
 * pan, window size and device.
 */
export type AnnotationPosition = { x: number; y: number };

/** The image's on-screen box, e.g. from `getBoundingClientRect()`. */
export type ImageRect = { left: number; top: number; width: number; height: number };

/**
 * Converts a pointer position to normalized image coordinates. The rect is
 * the image's *rendered* box, which already includes zoom, pan and any
 * letterboxing around it. Returns null when the point is outside the image,
 * so no pin is ever created on the empty space around it.
 */
export function clientToNormalized(clientX: number, clientY: number, rect: ImageRect): AnnotationPosition | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: round(x), y: round(y) };
}

/** Inverse of `clientToNormalized`: where a stored pin appears on screen. */
export function normalizedToClient(position: AnnotationPosition, rect: ImageRect) {
  return { x: rect.left + position.x * rect.width, y: rect.top + position.y * rect.height };
}

export function isValidPosition(position: AnnotationPosition) {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
  );
}

// 6 decimals ≈ 0.016 px on a 16 000 px image: exact enough, stable in JSON.
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Pixel position on the original image, for display ("at 512 × 310 px"). */
export function toImagePixels(position: AnnotationPosition, size: { width: number; height: number }) {
  return { x: Math.round(position.x * size.width), y: Math.round(position.y * size.height) };
}
