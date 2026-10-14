import { describe, expect, it } from "vitest";
import { clientToNormalized, isValidPosition, normalizedToClient, toImagePixels, type ImageRect } from "./annotation";

/**
 * The image's rendered rect already reflects zoom, pan and letterboxing, so
 * these cases model "the same image point under different transforms".
 */
const IMAGE = { width: 1440, height: 1700 };

/** Rect of the image after fitting into a viewport, zooming by `scale` and panning by (dx, dy). */
function renderedRect(scale: number, dx = 0, dy = 0, offset = { left: 0, top: 0 }): ImageRect {
  return { left: offset.left + dx, top: offset.top + dy, width: IMAGE.width * scale, height: IMAGE.height * scale };
}

/** Where a given image pixel appears on screen for a rect. */
function screenPointOf(px: number, py: number, rect: ImageRect) {
  return { x: rect.left + (px / IMAGE.width) * rect.width, y: rect.top + (py / IMAGE.height) * rect.height };
}

describe("clientToNormalized", () => {
  it("maps the centre of the image to 0.5, 0.5", () => {
    const rect = renderedRect(0.5, 0, 0, { left: 100, top: 50 });
    expect(clientToNormalized(100 + 360, 50 + 425, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("gives the same position for the same image point at any zoom, pan or window offset", () => {
    const button = { px: 260, py: 500 }; // "Book Now"
    const transforms: ImageRect[] = [
      renderedRect(0.45, 0, 0, { left: 230, top: 130 }), // fit to screen on desktop
      renderedRect(1), // 100%
      renderedRect(2.5, -1800, -900), // zoomed in and panned
      renderedRect(0.23, 0, 0, { left: 30, top: 420 }), // phone
      renderedRect(0.8, 120, -40, { left: 500, top: 0 }), // resized window
    ];
    const positions = transforms.map((rect) => {
      const point = screenPointOf(button.px, button.py, rect);
      return clientToNormalized(point.x, point.y, rect)!;
    });
    for (const position of positions) {
      expect(position.x).toBeCloseTo(button.px / IMAGE.width, 5);
      expect(position.y).toBeCloseTo(button.py / IMAGE.height, 5);
    }
  });

  it("round-trips: a stored pin renders back on the same image point", () => {
    const rect = renderedRect(1.7, -320, -75, { left: 224, top: 132 });
    const stored = { x: 0.1806, y: 0.2941 };
    const onScreen = normalizedToClient(stored, rect);
    const back = clientToNormalized(onScreen.x, onScreen.y, rect)!;
    expect(back.x).toBeCloseTo(stored.x, 6);
    expect(back.y).toBeCloseTo(stored.y, 6);
  });

  it("returns null outside the image (letterbox or empty space), so no pin is created there", () => {
    const rect = renderedRect(0.5, 0, 0, { left: 100, top: 50 });
    expect(clientToNormalized(99, 200, rect)).toBeNull(); // left of the image
    expect(clientToNormalized(300, 49, rect)).toBeNull(); // above
    expect(clientToNormalized(100 + 721, 200, rect)).toBeNull(); // right of the image
    expect(clientToNormalized(300, 50 + 851, rect)).toBeNull(); // below
  });

  it("accepts the exact edges", () => {
    const rect = renderedRect(1);
    expect(clientToNormalized(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToNormalized(1440, 1700, rect)).toEqual({ x: 1, y: 1 });
  });

  it("returns null for a collapsed rect (image not laid out yet)", () => {
    expect(clientToNormalized(10, 10, { left: 0, top: 0, width: 0, height: 100 })).toBeNull();
  });

  it("rounds to 6 decimals", () => {
    const position = clientToNormalized(1 / 3, 2 / 3, { left: 0, top: 0, width: 1, height: 1 })!;
    expect(position).toEqual({ x: 0.333333, y: 0.666667 });
  });
});

describe("isValidPosition", () => {
  it("accepts 0–1 and rejects anything else", () => {
    expect(isValidPosition({ x: 0, y: 1 })).toBe(true);
    expect(isValidPosition({ x: -0.01, y: 0.5 })).toBe(false);
    expect(isValidPosition({ x: 0.5, y: 1.01 })).toBe(false);
    expect(isValidPosition({ x: Number.NaN, y: 0.5 })).toBe(false);
  });
});

describe("toImagePixels", () => {
  it("converts back to original image pixels", () => {
    expect(toImagePixels({ x: 0.5, y: 0.25 }, IMAGE)).toEqual({ x: 720, y: 425 });
  });
});
