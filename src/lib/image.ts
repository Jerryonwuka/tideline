/** Longest edge we keep for photos (BUILD_SPEC §8: max 1600 px, ~70% JPEG). */
export const MAX_IMAGE_EDGE = 1600;
export const JPEG_QUALITY = 0.7;

/** Target size that fits within maxEdge on the longest side, keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number; resized: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, resized: false };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale), resized: true };
}

/**
 * Shrinks a photo on the device before upload (saves the user's data). PDFs and images that
 * already fit pass through untouched; anything the browser can't decode is sent as-is.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const target = fitWithin(bitmap.width, bitmap.height);
  if (!target.resized && file.type === "image/jpeg") {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
