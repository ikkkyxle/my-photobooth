/**
 * Photostrip compositor.
 *
 * The previous implementation stacked absolutely-positioned <img> elements and
 * rasterised them with html2canvas. That had three defects:
 *
 *   1. One hardcoded set of pixel offsets was used for all four frames, but the
 *      frames do not share slot geometry (measured slot aspect ranges from
 *      1.323 to 1.477), so photos never lined up.
 *   2. The canvas was 400x600 (aspect 0.6667) while every frame PNG is aspect
 *      0.6713. With objectFit:'contain' the frame was letterboxed a couple of
 *      pixels, shifting it away from the photo boxes underneath.
 *   3. html2canvas re-rasterises the DOM, so the export could differ from the
 *      preview and was capped at screen resolution.
 *
 * This module draws everything with the Canvas 2D API instead, using the slot
 * rectangles measured from each frame's alpha channel (see
 * scripts/extract-frame-slots.py). The same function renders the preview and
 * the print file, only the output resolution differs, so what you see is
 * exactly what you save.
 *
 * Photos are cover-cropped into their slot: scaled to fill and centre-cropped,
 * never stretched. That is what makes a 3:2 DSLR frame and a 16:9 webcam frame
 * both sit correctly in a ~1.48 slot.
 */

const imageCache = new Map();

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    // Frames are bundled assets and photos are data URLs, so this is same-origin,
    // but setting it keeps the canvas untainted if a photo ever comes from the
    // bridge over HTTP.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src.slice(0, 64)}`));
    img.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

/**
 * Compute source rectangle for a centre-weighted cover crop.
 * Mirrors CSS object-fit: cover.
 *
 * Exported so the geometry can be unit tested without a canvas.
 */
export function coverCrop(imageWidth, imageHeight, targetWidth, targetHeight) {
  const imageAspect = imageWidth / imageHeight;
  const targetAspect = targetWidth / targetHeight;

  if (imageAspect > targetAspect) {
    // Source is wider than the slot: trim the left and right edges.
    const sw = imageHeight * targetAspect;
    return { sx: (imageWidth - sw) / 2, sy: 0, sw, sh: imageHeight };
  }
  // Source is taller than the slot: trim top and bottom.
  const sh = imageWidth / targetAspect;
  return { sx: 0, sy: (imageHeight - sh) / 2, sw: imageWidth, sh };
}

/**
 * Draw a complete photostrip.
 *
 * @param {HTMLCanvasElement} canvas   target canvas (resized in place)
 * @param {object}   frame             entry from frameSlots.js
 * @param {object[]} photos            [{ dataUrl, mirrored }]
 * @param {object}   options
 * @param {number}   options.width     output width in px
 * @param {string}   options.background paper colour behind everything
 */
export async function drawPhotostrip(canvas, frame, photos, options = {}) {
  const width = Math.max(1, Math.round(options.width || 400));
  // Height follows the frame's true aspect so the overlay is never letterboxed.
  const height = Math.round(width / frame.aspectRatio);
  const background = options.background || frame.background || '#ffffff';

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // Photos first: the frame art sits on top and its transparent holes reveal them.
  for (let index = 0; index < frame.slots.length; index += 1) {
    const photo = photos[index];
    if (!photo || !photo.dataUrl) continue;

    const slot = frame.slots[index];
    const dx = (slot.left / 100) * width;
    const dy = (slot.top / 100) * height;
    const dw = (slot.width / 100) * width;
    const dh = (slot.height / 100) * height;

    let img;
    try {
      img = await loadImage(photo.dataUrl);
    } catch (err) {
      // A single unreadable photo should not abort the whole strip.
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(dx, dy, dw, dh);
      continue;
    }

    const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, dw, dh);

    ctx.save();
    // Bleed half a pixel outward so antialiasing on the slot edge cannot leave
    // a hairline of paper showing between photo and frame.
    const bleed = 0.5;
    ctx.beginPath();
    ctx.rect(dx - bleed, dy - bleed, dw + bleed * 2, dh + bleed * 2);
    ctx.clip();

    if (photo.mirrored) {
      // Webcam previews are mirrored so the operator sees themselves naturally;
      // flip on the way in so the saved strip matches that preview.
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, -bleed, -bleed, dw + bleed * 2, dh + bleed * 2);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx - bleed, dy - bleed, dw + bleed * 2, dh + bleed * 2);
    }
    ctx.restore();
  }

  // Frame overlay last, drawn edge to edge at the frame's own aspect ratio.
  if (frame.src) {
    const frameImg = await loadImage(frame.src);
    ctx.drawImage(frameImg, 0, 0, width, height);
  }

  return { width, height };
}

/**
 * Render at print resolution and hand back a PNG blob URL.
 *
 * 4R paper is 4x6in; at 300dpi that is 1200x1800px. We drive the width from the
 * frame's native pixel width when it is larger, so a high resolution frame is
 * never downsampled.
 */
export async function exportPhotostrip(frame, photos, { dpi = 300 } = {}) {
  const printWidth = Math.max(Math.round(4 * dpi), frame.naturalWidth || 0);
  const canvas = document.createElement('canvas');
  await drawPhotostrip(canvas, frame, photos, { width: printWidth });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Gagal membuat file PNG.');

  return {
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}
