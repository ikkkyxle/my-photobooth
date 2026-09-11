/**
 * Geometry tests for the photostrip compositor and the frame slot data.
 *
 * These guard the exact defects that made "frame foto tidak sesuai frame":
 * mismatched aspect ratios, per-frame slot differences, and stretched crops.
 */

import { coverCrop } from './photostrip';
import { FRAMES, PLAIN_FRAME, TOTAL_PHOTOS, slotAspectRatio } from './frameSlots';

describe('coverCrop', () => {
  test('never stretches: the crop keeps the target aspect ratio', () => {
    const cases = [
      // [imageW, imageH, targetW, targetH]
      [6000, 4000, 400, 270], // M100 3:2 into a ~1.48 slot
      [1920, 1080, 400, 270], // webcam 16:9 into the same slot
      [1000, 1000, 400, 270], // square source
      [500, 2000, 400, 270], // extreme portrait
      [4000, 300, 400, 270], // extreme panorama
    ];

    cases.forEach(([iw, ih, tw, th]) => {
      const { sw, sh } = coverCrop(iw, ih, tw, th);
      expect(sw / sh).toBeCloseTo(tw / th, 5);
    });
  });

  test('crop window stays inside the source image', () => {
    [
      [6000, 4000, 400, 270],
      [1920, 1080, 400, 270],
      [800, 600, 1000, 100],
    ].forEach(([iw, ih, tw, th]) => {
      const { sx, sy, sw, sh } = coverCrop(iw, ih, tw, th);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sx + sw).toBeLessThanOrEqual(iw + 1e-6);
      expect(sy + sh).toBeLessThanOrEqual(ih + 1e-6);
    });
  });

  test('crop is centred, so trimming is symmetric', () => {
    // 16:9 source into a 1.48 slot must lose equal slices left and right.
    const { sx, sw } = coverCrop(1920, 1080, 400, 270);
    expect(sx).toBeCloseTo((1920 - sw) / 2, 5);

    // A tall source loses equal slices top and bottom.
    const { sy, sh } = coverCrop(1000, 3000, 400, 270);
    expect(sy).toBeCloseTo((3000 - sh) / 2, 5);
  });

  test('one full dimension is always used (true cover, no letterboxing)', () => {
    [
      [6000, 4000, 400, 270],
      [1920, 1080, 400, 270],
      [500, 2000, 400, 270],
    ].forEach(([iw, ih, tw, th]) => {
      const { sw, sh } = coverCrop(iw, ih, tw, th);
      const usesFullWidth = Math.abs(sw - iw) < 1e-6;
      const usesFullHeight = Math.abs(sh - ih) < 1e-6;
      expect(usesFullWidth || usesFullHeight).toBe(true);
    });
  });
});

describe('frame slot data', () => {
  test('every frame exposes exactly the photo count the booth captures', () => {
    expect(TOTAL_PHOTOS).toBe(6);
    FRAMES.forEach((frame) => {
      expect(frame.slots).toHaveLength(TOTAL_PHOTOS);
    });
    expect(PLAIN_FRAME.slots).toHaveLength(TOTAL_PHOTOS);
  });

  test('slots stay inside the frame bounds', () => {
    FRAMES.forEach((frame) => {
      frame.slots.forEach((slot, index) => {
        expect(slot.left).toBeGreaterThanOrEqual(0);
        expect(slot.top).toBeGreaterThanOrEqual(0);
        expect(slot.left + slot.width).toBeLessThanOrEqual(100.5);
        expect(slot.top + slot.height).toBeLessThanOrEqual(100.5);
        expect(slot.width).toBeGreaterThan(0);
        expect(slot.height).toBeGreaterThan(0);
        // guards against a mis-detected hole swallowing the whole frame
        expect(slot.width).toBeLessThan(60);
      });
    });
  });

  test('slots do not overlap each other', () => {
    FRAMES.forEach((frame) => {
      for (let a = 0; a < frame.slots.length; a += 1) {
        for (let b = a + 1; b < frame.slots.length; b += 1) {
          const s1 = frame.slots[a];
          const s2 = frame.slots[b];
          const disjoint =
            s1.left + s1.width <= s2.left + 0.01 ||
            s2.left + s2.width <= s1.left + 0.01 ||
            s1.top + s1.height <= s2.top + 0.01 ||
            s2.top + s2.height <= s1.top + 0.01;
          expect(disjoint).toBe(true);
        }
      }
    });
  });

  test('slots form 3 rows of 2 columns in reading order', () => {
    FRAMES.forEach((frame) => {
      for (let row = 0; row < 3; row += 1) {
        const left = frame.slots[row * 2];
        const right = frame.slots[row * 2 + 1];
        // same row: tops agree within a small tolerance
        expect(Math.abs(left.top - right.top)).toBeLessThan(2);
        // left really is left of right
        expect(left.left).toBeLessThan(right.left);
      }
      // rows descend
      expect(frame.slots[0].top).toBeLessThan(frame.slots[2].top);
      expect(frame.slots[2].top).toBeLessThan(frame.slots[4].top);
    });
  });

  test('aspect ratio is taken from the artwork, not assumed to be 400x600', () => {
    // The old canvas was 400x600 = 0.6667, which letterboxed every frame.
    FRAMES.forEach((frame) => {
      expect(frame.aspectRatio).toBeCloseTo(frame.naturalWidth / frame.naturalHeight, 4);
      expect(frame.aspectRatio).not.toBeCloseTo(400 / 600, 3);
    });
  });

  test('slot aspect is landscape and near the 3:2 sensor shape', () => {
    FRAMES.forEach((frame) => {
      const aspect = slotAspectRatio(frame);
      expect(aspect).toBeGreaterThan(1.2);
      expect(aspect).toBeLessThan(1.6);
    });
  });
});
