import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { downloadGmailAttachment } from "@/lib/gmail-attachment-download";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const supabase =
      await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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

    const { id } = await context.params;
    const download = new URL(request.url).searchParams.get("download") === "1";

    if (!id) {
      return NextResponse.json(
        {
          error: "Attachment ID is required",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Fetch the attachment only if it belongs
     * to the authenticated user.
     */
    const {
      data: attachment,
      error: attachmentError,
    } = await supabase
      .from("gmail_attachments")
      .select(
        `
        id,
        gmail_message_id,
        gmail_attachment_id,
        filename,
        mime_type,
        size_bytes
        `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (attachmentError) {
      throw new Error(
        attachmentError.message
      );
    }

    if (!attachment) {
      return NextResponse.json(
        {
          error:
            "Attachment not found",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !attachment.gmail_attachment_id
    ) {
      return NextResponse.json(
        {
          error:
            "Gmail attachment ID is missing",
        },
        {
          status: 404,
        }
      );
    }

    const buffer =
      await downloadGmailAttachment(
        user.id,
        attachment.gmail_message_id,
        attachment.gmail_attachment_id,
        attachment.mime_type,
        attachment.size_bytes
      );

    const headers = new Headers();

    headers.set(
      "Content-Type",
      attachment.mime_type
    );

    headers.set(
      "Content-Length",
      String(buffer.length)
    );

    headers.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${attachment.filename.replace(/["\\]/g, "_")}"`
    );

    /*
     * Prevent MIME sniffing.
     */
    headers.set(
      "X-Content-Type-Options",
      "nosniff"
    );

    /*
     * Prevent the browser from caching
     * sensitive Gmail content.
     */
    headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return new Response(
      new Uint8Array(buffer),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    console.error(
      "Attachment download error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to load attachment",
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
