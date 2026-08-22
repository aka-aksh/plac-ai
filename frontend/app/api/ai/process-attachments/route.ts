import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { downloadGmailAttachment } from "@/lib/gmail-attachment-download";
const { PDFParse } = await import("pdf-parse");
import mammoth from "mammoth";

const MAX_EXTRACTED_TEXT = 100_000;

async function extractPdfText(
  buffer: Buffer
): Promise<string> {
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const result = await parser.getText();

    return result.text
      .slice(0, MAX_EXTRACTED_TEXT)
      .trim();
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(
  buffer: Buffer
): Promise<string> {
  const result =
    await mammoth.extractRawText({
      buffer,
    });

  return result.value
    .slice(0, MAX_EXTRACTED_TEXT)
    .trim();
}

export async function GET() {
  try {
    const supabase =
      await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Find one unprocessed attachment
     * belonging to this user.
     */
    const {
      data: attachment,
      error: attachmentError,
    } =
      await supabase
        .from("gmail_attachments")
        .select(
          `
          id,
          gmail_message_id,
          gmail_attachment_id,
          filename,
          mime_type,
          size_bytes,
          processed
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "processed",
          false
        )
        .not(
          "gmail_attachment_id",
          "is",
          null
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (attachmentError) {
      throw new Error(
        attachmentError.message
      );
    }

    if (!attachment) {
      return NextResponse.json({
        success: true,
        processed: false,
        message:
          "No unprocessed attachment found.",
      });
    }

    /*
     * Download through the authenticated
     * Gmail connection.
     */
    const buffer =
      await downloadGmailAttachment(
        user.id,
        attachment.gmail_message_id,
        attachment.gmail_attachment_id!,
        attachment.mime_type,
        attachment.size_bytes
      );

    let extractedText = "";

    if (
      attachment.mime_type ===
      "application/pdf"
    ) {
      extractedText =
        await extractPdfText(buffer);
    } else if (
      attachment.mime_type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extractedText =
        await extractDocxText(buffer);
    } else {
      throw new Error(
        `Unsupported attachment type: ${attachment.mime_type}`
      );
    }

    if (!extractedText) {
      throw new Error(
        "No readable text was extracted from the attachment"
      );
    }

    /*
     * Save the extracted text.
     */
    const {
      error: updateError,
    } =
      await supabase
        .from("gmail_attachments")
        .update({
          extracted_text:
            extractedText,

          processed:
            true,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          attachment.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (updateError) {
      throw new Error(
        updateError.message
      );
    }

    /*
     * Find the source Gmail message.
     */
    const {
      data: message,
      error: messageError,
    } =
      await supabase
        .from("gmail_messages")
        .select(
          `
          id,
          gmail_message_id,
          sender,
          subject
          `
        )
        .eq(
          "id",
          attachment.gmail_message_id
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (messageError) {
      throw new Error(
        messageError.message
      );
    }

    /*
     * Return the extracted text for the next
     * AI stage.
     */
    return NextResponse.json({
      success: true,
      processed: true,

      attachment: {
        id: attachment.id,
        filename:
          attachment.filename,
        mime_type:
          attachment.mime_type,
        size_bytes:
          buffer.length,
      },

      sourceMessage:
        message ?? null,

      extractedTextLength:
        extractedText.length,

      preview:
        extractedText.slice(
          0,
          3000
        ),
    });
  } catch (error) {
    console.error(
      "AI attachment processing error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "AI attachment processing failed",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}