import { gmailFetch } from "@/lib/gmail-client";

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

type GmailAttachmentResponse = {
  size?: number;
  data?: string;
};

function decodeBase64UrlToBuffer(
  value: string
): Buffer {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized +
    "=".repeat(
      (4 - (normalized.length % 4)) % 4
    );

  return Buffer.from(
    padded,
    "base64"
  );
}

export async function downloadGmailAttachment(
  userId: string,
  messageId: string,
  attachmentId: string,
  mimeType: string,
  expectedSize: number | null
): Promise<Buffer> {
  const normalizedMimeType =
    mimeType.toLowerCase();

  if (
    !ALLOWED_MIME_TYPES.has(
      normalizedMimeType
    )
  ) {
    throw new Error(
      "Unsupported attachment type"
    );
  }

  if (
    expectedSize !== null &&
    expectedSize > MAX_ATTACHMENT_SIZE
  ) {
    throw new Error(
      "Attachment exceeds the 10 MB size limit"
    );
  }

  const result = await gmailFetch(
    userId,
    `/messages/${encodeURIComponent(
      messageId
    )}/attachments/${encodeURIComponent(
      attachmentId
    )}`
  );

  if (!result.response.ok) {
    const errorText =
      await result.response.text();

    throw new Error(
      `Failed to download Gmail attachment: ${errorText}`
    );
  }

  const data =
    (await result.response.json()) as GmailAttachmentResponse;

  if (!data.data) {
    throw new Error(
      "Gmail attachment did not contain file data"
    );
  }

  const buffer =
    decodeBase64UrlToBuffer(data.data);

  if (
    buffer.length >
    MAX_ATTACHMENT_SIZE
  ) {
    throw new Error(
      "Downloaded attachment exceeds the 10 MB size limit"
    );
  }

  if (
    expectedSize !== null &&
    buffer.length !== expectedSize
  ) {
    throw new Error(
      "Downloaded attachment size does not match Gmail metadata"
    );
  }

  return buffer;
}