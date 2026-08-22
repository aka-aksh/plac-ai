import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { downloadGmailAttachment } from "@/lib/gmail-attachment-download";
import { extractFromAttachment } from "@/lib/gemini-attachment";
import mammoth from "mammoth";

const MAX_EXTRACTED_TEXT = 100_000;

async function extractPdfText(
  buffer: Buffer
): Promise<string> {
  const { PDFParse } =
    await import("pdf-parse");

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const result =
      await parser.getText();

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
     * Download the original file
     * securely through Gmail.
     */
    const buffer =
      await downloadGmailAttachment(
        user.id,
        attachment.gmail_message_id,
        attachment.gmail_attachment_id!,
        attachment.mime_type,
        attachment.size_bytes
      );

    /*
     * Extract text locally.
     */
    let extractedText = "";

    if (
      attachment.mime_type ===
      "application/pdf"
    ) {
      extractedText =
        await extractPdfText(
          buffer
        );
    } else if (
      attachment.mime_type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extractedText =
        await extractDocxText(
          buffer
        );
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
     * Ask Gemini to extract only facts
     * explicitly supported by the document.
     */
    const attachmentExtraction =
      await extractFromAttachment(
        attachment.filename,
        attachment.mime_type,
        extractedText
      );

    /*
     * Mark the attachment as processed
     * and preserve the extracted text.
     */
    const {
      error: attachmentUpdateError,
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

    if (attachmentUpdateError) {
      throw new Error(
        attachmentUpdateError.message
      );
    }

    /*
     * Find the Gmail message and its
     * corresponding opportunity.
     */
    const {
      data: opportunityLink,
      error: opportunityLinkError,
    } =
      await supabase
        .from(
          "opportunity_messages"
        )
        .select(
          `
          opportunity_id
          `
        )
        .eq(
          "gmail_message_id",
          attachment.gmail_message_id
        )
        .maybeSingle();

    if (opportunityLinkError) {
      throw new Error(
        opportunityLinkError.message
      );
    }

    let updatedOpportunity = null;

    /*
     * The attachment may be processed before
     * its email has been connected to an opportunity.
     *
     * In that case, keep the attachment processed
     * and don't invent an opportunity.
     */
    if (opportunityLink) {
      /*
       * Load the opportunity belonging
       * to this authenticated user.
       */
      const {
        data: opportunity,
        error: opportunityError,
      } =
        await supabase
          .from("opportunities")
          .select(
            `
            id,
            company,
            role,
            deadline,
            apply_link,
            eligibility,
            next_action,
            status
            `
          )
          .eq(
            "id",
            opportunityLink.opportunity_id
          )
          .eq(
            "user_id",
            user.id
          )
          .single();

      if (opportunityError) {
        throw new Error(
          opportunityError.message
        );
      }

      /*
       * Only update fields that the attachment
       * actually contains.
       *
       * Existing email information is preserved
       * when the attachment doesn't mention it.
       */
      const updates: Record<
        string,
        unknown
      > = {
        ai_confidence:
          attachmentExtraction.confidence,

        ai_model:
          "gemini-3.5-flash-lite",

        updated_at:
          new Date().toISOString(),
      };

      if (
        attachmentExtraction.company &&
        !opportunity.company
      ) {
        updates.company =
          attachmentExtraction.company;
      }

      if (
        attachmentExtraction.role &&
        !opportunity.role
      ) {
        updates.role =
          attachmentExtraction.role;
      }

      if (
        attachmentExtraction.deadline
      ) {
        updates.deadline =
          attachmentExtraction.deadline;
      }

      if (
        attachmentExtraction.apply_link
      ) {
        updates.apply_link =
          attachmentExtraction.apply_link;
      }

      if (
        attachmentExtraction.eligibility
      ) {
        updates.eligibility =
          attachmentExtraction.eligibility;
      }

      if (
        attachmentExtraction.next_action
      ) {
        updates.next_action =
          attachmentExtraction.next_action;
      }

      /*
       * Attachment status can update the
       * recruitment stage when it explicitly
       * indicates one.
       */
      if (
        attachmentExtraction.status
      ) {
        updates.status =
          attachmentExtraction.status;
      }

      /*
       * Never change application_status here.
       * The student controls that field.
       */
      const {
        data: savedOpportunity,
        error: opportunityUpdateError,
      } =
        await supabase
          .from("opportunities")
          .update(updates)
          .eq(
            "id",
            opportunity.id
          )
          .eq(
            "user_id",
            user.id
          )
          .select()
          .single();

      if (opportunityUpdateError) {
        throw new Error(
          opportunityUpdateError.message
        );
      }

      updatedOpportunity =
        savedOpportunity;
    }

    return NextResponse.json({
      success: true,
      processed: true,

      attachment: {
        id:
          attachment.id,

        filename:
          attachment.filename,

        mime_type:
          attachment.mime_type,

        size_bytes:
          buffer.length,
      },

      extraction:
        attachmentExtraction,

      opportunity:
        updatedOpportunity,

      extractedTextLength:
        extractedText.length,

      preview:
        extractedText.slice(
          0,
          2000
        ),
    });
  } catch (error) {
    console.error(
      "Attachment processing error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Attachment processing failed",

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