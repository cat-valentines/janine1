declare module 'gifenc' {
  export interface GifEncoder {
    writeFrame(index: Uint8Array | number[], width: number, height: number, opts?: { palette?: number[][]; delay?: number; transparent?: boolean; [key: string]: unknown }): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(): GifEncoder;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: unknown): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}
