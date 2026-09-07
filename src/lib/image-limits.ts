// Keep multipart overhead below Vercel's 4.5 MB function request limit.
// Original pixels are preserved: crop/select fewer photos instead of silently downsampling.
export const MAX_TOTAL_UPLOAD_BYTES = 4_000_000;
export const MAX_CAPTURE_IMAGES = 6;
export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateImageSet(files: ReadonlyArray<{ size: number; type: string }>): string | null {
  if (!files.length) return "Capture o suba una imagen primero.";
  if (files.length > MAX_CAPTURE_IMAGES) return "Use un maximo de 6 fotos por inspeccion.";
  if (files.some(file => !IMAGE_TYPES.has(file.type) || file.size <= 0)) {
    return "Use imagenes JPEG, PNG o WebP validas.";
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_UPLOAD_BYTES) {
    return "El set supera 4 MB. Use menos fotos o recortes del defecto con una foto de contexto; conservamos los pixeles originales.";
  }
  return null;
}
