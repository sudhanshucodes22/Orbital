import type { ArtifactId, Timestamp } from "./ids";

/** The eight ways in, per the product definition. Text is one of them, not
 *  the entry fee. */
export type InputKind =
  | "text"
  | "voice"
  | "sketch"
  | "handwriting"
  | "screenshot"
  | "pdf"
  | "camera"
  | "image";

/** Inputs that carry a file live in object storage; text lives inline. The
 *  union keeps that difference explicit rather than leaving a nullable blob
 *  field on every input. */
export type InputArtifact =
  | {
      id: ArtifactId;
      kind: "text";
      text: string;
      createdAt: Timestamp;
    }
  | {
      id: ArtifactId;
      kind: Exclude<InputKind, "text">;
      /** Storage key, not a URL. URLs are minted on read and expire. */
      storageKey: string;
      mimeType: string;
      byteSize: number;
      /** Transcript for voice, OCR for handwriting; absent until processed. */
      extractedText: string | null;
      createdAt: Timestamp;
    };

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_MIME: Readonly<Record<Exclude<InputKind, "text">, readonly string[]>> = {
  voice: ["audio/webm", "audio/mpeg", "audio/wav", "audio/mp4"],
  sketch: ["image/png", "image/jpeg", "image/webp"],
  handwriting: ["image/png", "image/jpeg", "image/webp"],
  screenshot: ["image/png", "image/jpeg", "image/webp"],
  camera: ["image/png", "image/jpeg", "image/webp"],
  image: ["image/png", "image/jpeg", "image/webp", "image/avif"],
  pdf: ["application/pdf"],
};
