import { getEnv } from "./env";

export const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "gif",
  "heic",
  "jpeg",
  "jpg",
  "json",
  "md",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "rtf",
  "txt",
  "webp",
  "xls",
  "xlsx",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/csv",
  "application/json",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/json",
  "text/markdown",
  "text/plain",
  "text/rtf",
]);

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function getUploadMaxBytes(): number {
  const configured = Number(getEnv("PORTAL_UPLOAD_MAX_BYTES") || "");
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_UPLOAD_MAX_BYTES;
}

export function getUploadAcceptAttribute(): string {
  return Array.from(ALLOWED_EXTENSIONS)
    .sort()
    .map((extension) => `.${extension}`)
    .join(",");
}

export function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function fileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name.toLowerCase());
  return match?.[1] || "";
}

export function validatePortalUpload(file: File): UploadValidationResult {
  const maxBytes = getUploadMaxBytes();

  if (file.size <= 0) {
    return { ok: false, status: 400, error: "The uploaded file is empty." };
  }

  if (file.size > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `File is too large. Maximum upload size is ${formatUploadSize(maxBytes)}.`,
    };
  }

  const extension = fileExtension(file.name);
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      status: 415,
      error: "File type is not allowed. Upload a PDF, image, text, CSV, JSON, or Office document.",
    };
  }

  const mimeType = (file.type || "").toLowerCase();
  if (!GENERIC_MIME_TYPES.has(mimeType) && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      status: 415,
      error: "File type is not allowed. Upload a PDF, image, text, CSV, JSON, or Office document.",
    };
  }

  return { ok: true };
}
