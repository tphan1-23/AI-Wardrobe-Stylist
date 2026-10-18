import { describe, expect, it } from "vitest";
import {
  MIN_FRAME,
  fitImage,
  fullFrame,
  isFullImage,
  moveFrame,
  resizeFrame,
  squareFrame,
  toImageRegion,
  type Rect,
} from "../frontend/src/services/crop.ts";

// A 3000x4000 photo shown in a 300x400 box fills it exactly (scale 0.1).
const IMAGE = { width: 3000, height: 4000 };
const BOX = { width: 300, height: 400 };
const SHOWN = fitImage(IMAGE, BOX);

describe("fitImage", () => {
  it("fills the box when the shapes match", () => {
    expect(SHOWN).toEqual({ x: 0, y: 0, width: 300, height: 400 });
  });

  it("centers a wide photo with bars above and below", () => {
    expect(fitImage({ width: 4000, height: 2000 }, { width: 300, height: 400 })).toEqual({ x: 0, y: 125, width: 300, height: 150 });
  });

  it("centers a tall photo with bars on the sides", () => {
    expect(fitImage({ width: 1000, height: 4000 }, { width: 300, height: 400 })).toEqual({ x: 100, y: 0, width: 100, height: 400 });
  });

  it("scales a small photo up to fit", () => {
    expect(fitImage({ width: 30, height: 40 }, BOX)).toEqual({ x: 0, y: 0, width: 300, height: 400 });
  });

  it("does not divide by zero for an empty photo or box", () => {
    expect(fitImage({ width: 0, height: 0 }, BOX)).toEqual({ x: 0, y: 0, width: 300, height: 400 });
    expect(fitImage(IMAGE, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(fitImage(IMAGE, { width: -5, height: 10 })).toEqual({ x: 0, y: 0, width: 0, height: 10 });
  });
});

describe("starting frames", () => {
  it("starts as the whole photo, as a separate copy", () => {
    const frame = fullFrame(SHOWN);
    expect(frame).toEqual(SHOWN);
    expect(frame).not.toBe(SHOWN);
  });

  it("offers the biggest centered square", () => {
    expect(squareFrame(SHOWN)).toEqual({ x: 0, y: 50, width: 300, height: 300 });
    expect(squareFrame({ x: 0, y: 125, width: 300, height: 150 })).toEqual({ x: 75, y: 125, width: 150, height: 150 });
  });
});

describe("moveFrame", () => {
  const frame: Rect = { x: 50, y: 100, width: 100, height: 120 };

  it("moves the frame without changing its size", () => {
    expect(moveFrame(frame, 20, -30, SHOWN)).toEqual({ x: 70, y: 70, width: 100, height: 120 });
  });

  it("stops at every edge of the photo", () => {
    expect(moveFrame(frame, -500, 0, SHOWN).x).toBe(0);
    expect(moveFrame(frame, 500, 0, SHOWN).x).toBe(200);
    expect(moveFrame(frame, 0, -500, SHOWN).y).toBe(0);
    expect(moveFrame(frame, 0, 500, SHOWN).y).toBe(280);
  });

  it("respects a photo that does not start at zero", () => {
    const bars = { x: 100, y: 0, width: 100, height: 400 };
    const inside = { x: 120, y: 10, width: 50, height: 50 };
    expect(moveFrame(inside, -500, 0, bars).x).toBe(100);
    expect(moveFrame(inside, 500, 0, bars).x).toBe(150);
  });

  it("does not change the frame it was given", () => {
    moveFrame(frame, 20, 20, SHOWN);
    expect(frame).toEqual({ x: 50, y: 100, width: 100, height: 120 });
  });
});

describe("resizeFrame", () => {
  const frame: Rect = { x: 100, y: 100, width: 100, height: 100 };

  it("drags the top-left corner and keeps the bottom-right where it was", () => {
    expect(resizeFrame(frame, "topLeft", -40, -30, SHOWN)).toEqual({ x: 60, y: 70, width: 140, height: 130 });
  });

  it("drags the top-right corner", () => {
    expect(resizeFrame(frame, "topRight", 40, -30, SHOWN)).toEqual({ x: 100, y: 70, width: 140, height: 130 });
  });

  it("drags the bottom-left corner", () => {
    expect(resizeFrame(frame, "bottomLeft", -40, 30, SHOWN)).toEqual({ x: 60, y: 100, width: 140, height: 130 });
  });

  it("drags the bottom-right corner", () => {
    expect(resizeFrame(frame, "bottomRight", 40, 30, SHOWN)).toEqual({ x: 100, y: 100, width: 140, height: 130 });
  });

  it("can shrink the frame by dragging a corner inward", () => {
    expect(resizeFrame(frame, "bottomRight", -30, -20, SHOWN)).toEqual({ x: 100, y: 100, width: 70, height: 80 });
    expect(resizeFrame(frame, "topLeft", 30, 20, SHOWN)).toEqual({ x: 130, y: 120, width: 70, height: 80 });
  });

  it("never leaves the photo", () => {
    expect(resizeFrame(frame, "topLeft", -999, -999, SHOWN)).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    expect(resizeFrame(frame, "bottomRight", 999, 999, SHOWN)).toEqual({ x: 100, y: 100, width: 200, height: 300 });
  });

  it("never gets smaller than the minimum, and never flips over", () => {
    expect(resizeFrame(frame, "bottomRight", -999, -999, SHOWN)).toEqual({ x: 100, y: 100, width: MIN_FRAME, height: MIN_FRAME });
    expect(resizeFrame(frame, "topLeft", 999, 999, SHOWN)).toEqual({ x: 200 - MIN_FRAME, y: 200 - MIN_FRAME, width: MIN_FRAME, height: MIN_FRAME });
    expect(resizeFrame(frame, "topRight", -999, 999, SHOWN)).toEqual({ x: 100, y: 200 - MIN_FRAME, width: MIN_FRAME, height: MIN_FRAME });
    expect(resizeFrame(frame, "bottomLeft", 999, -999, SHOWN)).toEqual({ x: 200 - MIN_FRAME, y: 100, width: MIN_FRAME, height: MIN_FRAME });
  });

  it("uses a smaller minimum when the photo itself is smaller", () => {
    const tiny = { x: 0, y: 0, width: 40, height: 30 };
    expect(resizeFrame({ x: 0, y: 0, width: 40, height: 30 }, "bottomRight", -999, -999, tiny)).toEqual({ x: 0, y: 0, width: 40, height: 30 });
  });

  it("honors a custom minimum", () => {
    expect(resizeFrame(frame, "bottomRight", -999, -999, SHOWN, 20)).toEqual({ x: 100, y: 100, width: 20, height: 20 });
  });

  it("does not change the frame it was given", () => {
    resizeFrame(frame, "topLeft", -10, -10, SHOWN);
    expect(frame).toEqual({ x: 100, y: 100, width: 100, height: 100 });
  });
});

describe("toImageRegion", () => {
  it("turns the frame into pixels of the real picture", () => {
    expect(toImageRegion({ x: 50, y: 100, width: 100, height: 120 }, SHOWN, IMAGE)).toEqual({
      originX: 500,
      originY: 1000,
      width: 1000,
      height: 1200,
    });
  });

  it("takes the bars around the photo into account", () => {
    const wide = { width: 4000, height: 2000 };
    const shown = fitImage(wide, { width: 300, height: 400 }); // x 0, y 125, 300 x 150 (scale 0.075)
    expect(toImageRegion({ x: 75, y: 125, width: 150, height: 150 }, shown, wide)).toEqual({
      originX: 1000,
      originY: 0,
      width: 2000,
      height: 2000,
    });
  });

  it("covers the whole picture for the full frame", () => {
    expect(toImageRegion(fullFrame(SHOWN), SHOWN, IMAGE)).toEqual({ originX: 0, originY: 0, width: 3000, height: 4000 });
  });

  it("stays inside the picture, with at least one pixel, even for a frame that is slightly off", () => {
    expect(toImageRegion({ x: -20, y: -20, width: 500, height: 600 }, SHOWN, IMAGE)).toEqual({ originX: 0, originY: 0, width: 3000, height: 4000 });
    expect(toImageRegion({ x: 299.9, y: 399.9, width: 0.01, height: 0.01 }, SHOWN, IMAGE)).toEqual({ originX: 2999, originY: 3999, width: 1, height: 1 });
  });

  it("falls back to the whole picture when the photo was not shown yet", () => {
    expect(toImageRegion({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 0 }, IMAGE)).toEqual({
      originX: 0,
      originY: 0,
      width: 3000,
      height: 4000,
    });
  });

  it("rounds to whole pixels", () => {
    const region = toImageRegion({ x: 33.3, y: 41.7, width: 99.9, height: 77.7 }, SHOWN, IMAGE);
    for (const value of Object.values(region)) expect(Number.isInteger(value)).toBe(true);
  });
});

describe("isFullImage", () => {
  const full = { originX: 0, originY: 0, width: 3000, height: 4000 };

  it("is true when nothing was cropped, so the photo is used as taken", () => {
    expect(isFullImage(full, IMAGE)).toBe(true);
  });

  it("allows a pixel or two of rounding", () => {
    expect(isFullImage({ originX: 1, originY: 2, width: 2998, height: 3998 }, IMAGE)).toBe(true);
  });

  it("is false when any side was cropped", () => {
    expect(isFullImage({ ...full, originX: 100, width: 2900 }, IMAGE)).toBe(false);
    expect(isFullImage({ ...full, originY: 100, height: 3900 }, IMAGE)).toBe(false);
    expect(isFullImage({ ...full, width: 2900 }, IMAGE)).toBe(false);
    expect(isFullImage({ ...full, height: 3900 }, IMAGE)).toBe(false);
  });

  it("honors a custom tolerance", () => {
    expect(isFullImage({ originX: 10, originY: 0, width: 2990, height: 4000 }, IMAGE, 10)).toBe(true);
    expect(isFullImage({ originX: 11, originY: 0, width: 2989, height: 4000 }, IMAGE, 10)).toBe(false);
  });

  it("agrees with toImageRegion for the starting frame and for a real crop", () => {
    expect(isFullImage(toImageRegion(fullFrame(SHOWN), SHOWN, IMAGE), IMAGE)).toBe(true);
    expect(isFullImage(toImageRegion(squareFrame(SHOWN), SHOWN, IMAGE), IMAGE)).toBe(false);
  });
});
