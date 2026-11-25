// ID document upload rules, enforced in the browser and again in the intake edge function.

export const ID_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const ID_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type IdUploadMime = (typeof ID_UPLOAD_MIME_TYPES)[number];

export const ID_UPLOAD_ACCEPT = ID_UPLOAD_MIME_TYPES.join(",");

export const ID_UPLOAD_EXTENSION: Record<IdUploadMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function checkIdUploadMeta(file: { type: string; size: number }): string | null {
  if (!(ID_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Upload a JPG, PNG, WEBP image or a PDF.";
  }
  if (file.size <= 0) return "The file is empty.";
  if (file.size > ID_UPLOAD_MAX_BYTES) return "The file is larger than 8 MB.";
  return null;
}

/** Detects the real type from the first bytes so a renamed file cannot bypass the MIME check. */
export function sniffIdUploadMime(head: Uint8Array): IdUploadMime | null {
  const b = head;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return "application/pdf";
  }
  return null;
}
