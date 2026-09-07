/**
 * escposRaster.js
 *
 * Pure, dependency-free functions that convert a raw RGBA bitmap
 * (as produced by Electron's webContents.capturePage() -> NativeImage.toBitmap())
 * into ESC/POS "GS v 0" raster print commands.
 *
 * No Electron APIs are used here on purpose — this file should be testable
 * with plain Node (`node -e "require('./escposRaster')..."`) before it's
 * ever wired into an IPC handler.
 */

/**
 * Converts an RGBA buffer to a 1-bit monochrome bit-packed buffer using a
 * fixed luminance threshold (no dithering — thermal receipts are text/lines,
 * dithering just adds noise and slows printing).
 *
 * @param {Buffer} rgba - raw RGBA pixels, 4 bytes per pixel, row-major
 * @param {number} width
 * @param {number} height
 * @param {number} threshold - 0-255 luminance cutoff, pixels darker than
 *   this print as black. Default 160 works well for black-text-on-white
 *   receipt renders; lower it if output looks too sparse/light.
 * @returns {{ bytesPerRow: number, packed: Buffer }}
 */
export function rgbaToMonochromePacked(rgba, width, height, threshold = 160) {
  const bytesPerRow = Math.ceil(width / 8);
  const packed = Buffer.alloc(bytesPerRow * height, 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * 4;
      const r = rgba[pixelOffset];
      const g = rgba[pixelOffset + 1];
      const b = rgba[pixelOffset + 2];
      const a = rgba[pixelOffset + 3];

      // Treat fully/partially transparent pixels as white (unprinted).
      const luminance = a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
      const isBlack = luminance < threshold;

      if (isBlack) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        const bitIndex = 7 - (x & 7); // MSB-first, as ESC/POS expects
        packed[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  return { bytesPerRow, packed };
}

/**
 * Wraps a packed monochrome bitmap in the ESC/POS "GS v 0" raster command.
 * This is the actual byte sequence the printer firmware interprets — no
 * driver, no Windows GDI rendering involved, matching how the Windows RAW
 * print job type is meant to be used (bytes passed straight through).
 *
 * Command layout: GS v 0 m xL xH yL yH d1...dk
 *   m  = 0 (normal mode)
 *   xL/xH = bytesPerRow, little-endian 16-bit
 *   yL/yH = height in dots, little-endian 16-bit
 *
 * @param {Buffer} packed
 * @param {number} bytesPerRow
 * @param {number} height
 * @returns {Buffer}
 */
export function buildRasterCommand(packed, bytesPerRow, height) {
  const header = Buffer.from([
    0x1d,
    0x76,
    0x30,
    0x00, // GS v 0, m=0
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff, // xL xH
    height & 0xff,
    (height >> 8) & 0xff, // yL yH
  ]);
  return Buffer.concat([header, packed]);
}

/**
 * ESC/POS init sequence, sent before every job so each print starts from a
 * known clean state.
 */
const ESC_INIT = Buffer.from([0x1b, 0x40]); // ESC @  (initialize printer)

/**
 * For printers WITH a cutter: a short feed (just enough to clear the print
 * head) followed by the full-cut command.
 */
const FEED_AND_CUT = Buffer.from([
  0x0a,
  0x0a,
  0x0a, // a few line feeds so the cut doesn't clip content
  0x1d,
  0x56,
  0x00, // GS V 0 (full cut)
]);

/**
 * For printers WITHOUT a cutter (tear-bar only — confirmed on the
 * PT80KM/POS80 hardware this was built against): NO cut command at all.
 * Sending GS V 0 to a printer with no cutter mechanism either does nothing
 * or eats feed distance that should go to the customer instead, which is
 * exactly the "have to manually pull it out" symptom this fixes. Feeds
 * substantially further (8 lines) so the printed content physically clears
 * the tear bar and can be torn without pulling.
 */
const FEED_ONLY = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a]);

/**
 * Full pipeline: RGBA bitmap -> complete ESC/POS byte buffer ready to send
 * as a Windows RAW print job.
 *
 * @param {Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {number} [options.threshold] - luminance cutoff, see rgbaToMonochromePacked
 * @param {boolean} [options.hasCutter] - true sends the full-cut command
 *   (FEED_AND_CUT); false skips it entirely and feeds further instead
 *   (FEED_ONLY). Defaults to true — callers printing to an unconfirmed
 *   printer should explicitly pass false rather than relying on this
 *   default, since sending a cut command to a cutterless printer is the
 *   bug this option exists to avoid.
 * @returns {Buffer}
 */
export function rgbaToEscposReceipt(rgba, width, height, options = {}) {
  const { threshold = 160, hasCutter = true } = options;

  const { bytesPerRow, packed } = rgbaToMonochromePacked(
    rgba,
    width,
    height,
    threshold,
  );
  const raster = buildRasterCommand(packed, bytesPerRow, height);
  const ending = hasCutter ? FEED_AND_CUT : FEED_ONLY;
  return Buffer.concat([ESC_INIT, raster, ending]);
}

export { ESC_INIT, FEED_AND_CUT, FEED_ONLY };
