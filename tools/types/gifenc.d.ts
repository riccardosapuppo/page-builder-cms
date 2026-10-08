// What tools/lib/gif.ts uses of gifenc 1.0.3, which ships no types. Its
// package entry is a CommonJS bundle, so Node gives it as the default
// import, not as named ones.
declare module "gifenc" {
  type Color = [number, number, number] | [number, number, number, number];
  type Format = "rgb565" | "rgb444" | "rgba4444";

  interface FrameOptions {
    transparent?: boolean;
    transparentIndex?: number;
    // Milliseconds; the file keeps hundredths of a second.
    delay?: number;
    palette?: Color[] | null;
    // -1 plays once, 0 forever, n times.
    repeat?: number;
    colorDepth?: number;
    // 1 leaves the frame in place for the next one to draw over.
    dispose?: number;
  }

  interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  interface Gifenc {
    GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): Encoder;
    // The pixels' buffer must hold exactly the image: gifenc reads the
    // whole ArrayBuffer, not the view's slice of it.
    quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: Format }): Color[];
    applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Color[], format?: Format): Uint8Array;
  }

  const gifenc: Gifenc;
  export default gifenc;
}
