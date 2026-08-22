export type GmailAttachmentPart = {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailAttachmentPart[];
};

export type DetectedGmailAttachment = {
  filename: string;
  mimeType: string;
  attachmentId: string | null;
  sizeBytes: number | null;
};

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

function walkParts(
  part: GmailAttachmentPart | undefined,
  result: DetectedGmailAttachment[]
) {
  if (!part) {
    return;
  }

  const mimeType =
    part.mimeType?.toLowerCase() ?? "";

  const filename =
    part.filename?.trim() ?? "";

  if (
    filename &&
    SUPPORTED_MIME_TYPES.has(mimeType)
  ) {
    result.push({
      filename,
      mimeType,
      attachmentId:
        part.body?.attachmentId ?? null,
      sizeBytes:
        typeof part.body?.size === "number"
          ? part.body.size
          : null,
    });
  }

  for (const child of part.parts ?? []) {
    walkParts(child, result);
  }
}

export function extractSupportedAttachments(
  payload:
    | GmailAttachmentPart
    | undefined
): DetectedGmailAttachment[] {
  const result: DetectedGmailAttachment[] = [];

  walkParts(payload, result);

  const unique = new Map<
    string,
    DetectedGmailAttachment
  >();

  for (const attachment of result) {
    const key =
      attachment.attachmentId ??
      `${attachment.filename}:${attachment.mimeType}`;

    if (!unique.has(key)) {
      unique.set(key, attachment);
    }
  }

  return Array.from(unique.values());
}