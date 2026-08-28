import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { classifyEmail } from "@/lib/gemini";

const MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

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
     * Only classify emails that have survived
     * the user relevance filter.
     *
     * We intentionally do not send known
     * irrelevant emails to Gemini.
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
          subject,
          body_text,
          relevance_status
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .in(
          "relevance_status",
          ["relevant", "pending"]
        )
        .is(
          "ai_classified_at",
          null
        )
        .order(
          "received_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (messageError) {
      console.error(
        "Message lookup error:",
        messageError
      );

      return NextResponse.json(
        {
          error:
            "Failed to load email for AI classification",
        },
        {
          status: 500,
        }
      );
    }

    if (!message) {
      return NextResponse.json({
        success: true,
        classified: false,
        message:
          "No unclassified relevant email found.",
      });
    }

    /*
     * Limit the amount of email content sent
     * to the model for this first implementation.
     */
    const body =
      (message.body_text ?? "").slice(
        0,
        30_000
      );

    const classification =
      await classifyEmail(
        message.sender,
        message.subject,
        body
      );

    /*
     * Safety check before writing model output.
     */
    const safeConfidence =
      Math.max(
        0,
        Math.min(
          1,
          classification.confidence
        )
      );

    const { error: updateError } =
      await supabase
        .from("gmail_messages")
        .update({
          ai_relevant:
            classification.relevant,

          relevance_status:
            classification.relevant
              ? "relevant"
              : "irrelevant",

          ai_category:
            classification.category,

          ai_confidence:
            safeConfidence,

          ai_reason:
            classification.reason,

          ai_classified_at:
            new Date().toISOString(),

          ai_model:
            MODEL,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          message.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (updateError) {
      console.error(
        "AI result save error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Failed to save AI classification",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      classified: true,

      message: {
        id:
          message.id,

        gmailMessageId:
          message.gmail_message_id,

        sender:
          message.sender,

        subject:
          message.subject,
      },

      classification,
    });
  } catch (error) {
    console.error(
      "AI classification error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "AI classification failed",
      },
      {
        status: 500,
      }
    );
  }
}
