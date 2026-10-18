// Cropping a photo before it is added: the frame the person drags over the photo, and how that
// frame maps back to pixels of the real picture. Pure TypeScript (no React Native), unit-tested in
// tests/crop.test.ts. The crop itself is done by expo-image-manipulator; this file only does the
// geometry, so the screen can stay thin.
//
// Two coordinate systems: the "box" is the area on screen the photo is shown in (the photo is
// scaled to fit inside it, with empty bars if the shapes differ), and the "image" is the real
// picture in pixels.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

// What expo-image-manipulator's `crop` action takes, in image pixels.
export interface CropRegion {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

// The frame can never be dragged smaller than this (on screen), so it stays easy to grab.
export const MIN_FRAME = 60;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Where the photo sits inside the box when it is scaled to fit (centered, nothing cut off).
export function fitImage(image: Size, box: Size): Rect {
  if (image.width <= 0 || image.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { x: 0, y: 0, width: Math.max(box.width, 0), height: Math.max(box.height, 0) };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

// The frame that shows the whole photo (the starting point: nothing is cropped yet).
export const fullFrame = (shown: Rect): Rect => ({ ...shown });

// The biggest centered square inside the photo.
export function squareFrame(shown: Rect): Rect {
  const side = Math.min(shown.width, shown.height);
  return { x: shown.x + (shown.width - side) / 2, y: shown.y + (shown.height - side) / 2, width: side, height: side };
}

// Drags the whole frame: same size, kept inside the photo.
export function moveFrame(start: Rect, dx: number, dy: number, bounds: Rect): Rect {
  return {
    x: clamp(start.x + dx, bounds.x, bounds.x + bounds.width - start.width),
    y: clamp(start.y + dy, bounds.y, bounds.y + bounds.height - start.height),
    width: start.width,
    height: start.height,
  };
}

// Drags one corner; the opposite corner stays where it is. The frame stays inside the photo and
// at least `min` in each direction (or the whole photo's size, if that is smaller).
export function resizeFrame(start: Rect, corner: Corner, dx: number, dy: number, bounds: Rect, min: number = MIN_FRAME): Rect {
  const minWidth = Math.min(min, bounds.width);
  const minHeight = Math.min(min, bounds.height);
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (corner === "topLeft" || corner === "bottomLeft") left = clamp(start.x + dx, bounds.x, right - minWidth);
  else right = clamp(right + dx, left + minWidth, bounds.x + bounds.width);

  if (corner === "topLeft" || corner === "topRight") top = clamp(start.y + dy, bounds.y, bottom - minHeight);
  else bottom = clamp(bottom + dy, top + minHeight, bounds.y + bounds.height);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

// The frame, turned into the pixels of the real picture to cut out.
export function toImageRegion(frame: Rect, shown: Rect, image: Size): CropRegion {
  if (shown.width <= 0 || shown.height <= 0) return { originX: 0, originY: 0, width: image.width, height: image.height };
  const scaleX = image.width / shown.width;
  const scaleY = image.height / shown.height;
  const originX = clamp(Math.round((frame.x - shown.x) * scaleX), 0, Math.max(image.width - 1, 0));
  const originY = clamp(Math.round((frame.y - shown.y) * scaleY), 0, Math.max(image.height - 1, 0));
  return {
    originX,
    originY,
    width: clamp(Math.round(frame.width * scaleX), 1, Math.max(image.width - originX, 1)),
    height: clamp(Math.round(frame.height * scaleY), 1, Math.max(image.height - originY, 1)),
  };
}

// True when the frame still covers the whole picture (give or take a pixel or two), so there is
// nothing to crop and the photo can be used exactly as it was taken.
export function isFullImage(region: CropRegion, image: Size, tolerance: number = 2): boolean {
  return (
    region.originX <= tolerance &&
    region.originY <= tolerance &&
    region.width >= image.width - tolerance - region.originX &&
    region.height >= image.height - tolerance - region.originY
  );
}
