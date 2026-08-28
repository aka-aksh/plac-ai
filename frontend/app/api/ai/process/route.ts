import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { classifyEmail } from "@/lib/gemini";
import { extractOpportunity } from "@/lib/gemini-extract";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

type OpportunityCandidate = {
  id: string;
  company: string | null;
  role: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompany(
  value: string | null | undefined
) {
  return normalize(value)
    .replace(
      /\b(ltd|limited|inc|incorporated|llc|corp|corporation|pvt|private|technologies|technology|company|co)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function isSameOpportunity(
  candidate: OpportunityCandidate,
  company: string,
  role: string | null
) {
  const sameCompany =
    normalizeCompany(candidate.company) ===
    normalizeCompany(company);

  if (!sameCompany) {
    return false;
  }

  const existingRole = normalize(candidate.role);
  const newRole = normalize(role);

  if (!existingRole || !newRole) {
    return false;
  }

  return existingRole === newRole;
}

export async function GET() {
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

    /*
     * Find one Gmail message that:
     * 1. Passed the user's sender/domain filter
     * 2. Has not been AI classified yet
     */
    const {
      data: message,
      error: messageError,
    } = await supabase
      .from("gmail_messages")
      .select(
        `
        id,
        gmail_message_id,
        gmail_thread_id,
        sender,
        subject,
        body_text,
        relevance_status,
        ai_classified_at,
        received_at
        `
      )
      .eq("user_id", user.id)
      .in(
        "relevance_status",
        ["relevant", "pending"]
      )
      .is("ai_classified_at", null)
      .order("received_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (messageError) {
      throw new Error(
        messageError.message
      );
    }

    if (!message) {
      return NextResponse.json({
        success: true,
        processed: false,
        message:
          "No new eligible email needs processing.",
      });
    }

    /*
     * STEP 1 — AI CLASSIFICATION
     */
    const classification =
      await classifyEmail(
        message.sender,
        message.subject,
        (message.body_text ?? "").slice(
          0,
          30000
        )
      );

    const safeConfidence =
      Math.max(
        0,
        Math.min(
          1,
          classification.confidence
        )
      );

    const {
      error: classificationSaveError,
    } = await supabase
      .from("gmail_messages")
      .update({
        ai_relevant:
          classification.relevant,

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
      .eq("id", message.id)
      .eq("user_id", user.id);

    if (classificationSaveError) {
      throw new Error(
        classificationSaveError.message
      );
    }

    /*
     * If Gemini says the email is irrelevant,
     * stop here.
     */
    if (!classification.relevant) {
      return NextResponse.json({
        success: true,
        processed: true,
        stage: "classification",
        result: "irrelevant",
        message: {
          id: message.id,
          sender: message.sender,
          subject: message.subject,
        },
        classification,
      });
    }

    /*
     * STEP 2 — AI OPPORTUNITY EXTRACTION
     */
    const extraction =
      await extractOpportunity(
        message.sender,
        message.subject,
        (message.body_text ?? "").slice(
          0,
          30000
        )
      );

    /*
     * STEP 3 — FIND EXISTING OPPORTUNITY
     */
    const {
      data: candidates,
      error: candidateError,
    } = await supabase
      .from("opportunities")
      .select(
        `
        id,
        company,
        role
        `
      )
      .eq("user_id", user.id);

    if (candidateError) {
      throw new Error(
        candidateError.message
      );
    }

    let opportunity:
      | OpportunityCandidate
      | null = null;

    for (const candidate of
      candidates ?? []) {
      if (
        isSameOpportunity(
          candidate,
          extraction.company,
          extraction.role
        )
      ) {
        opportunity = candidate;
        break;
      }
    }

    /*
     * STEP 4 — CREATE OR UPDATE
     */
    if (opportunity) {
      const updates: Record<
        string,
        unknown
      > = {
        company:
          extraction.company,

        role:
          extraction.role,

        source_type:
          extraction.source_type,

        category:
          extraction.category,

        status:
          extraction.status,

        ai_confidence:
          extraction.confidence,

        ai_model:
          MODEL,

        updated_at:
          new Date().toISOString(),
      };

      /*
       * Never erase existing information
       * with null from a later email.
       */
      if (
        extraction.deadline !== null
      ) {
        updates.deadline =
          extraction.deadline;
      }

      if (
        extraction.apply_link !== null
      ) {
        updates.apply_link =
          extraction.apply_link;
      }

      if (
        extraction.eligibility !== null
      ) {
        updates.eligibility =
          extraction.eligibility;
      }

      if (
        extraction.next_action !== null
      ) {
        updates.next_action =
          extraction.next_action;
      }

      const {
        data: updatedOpportunity,
        error: updateError,
      } = await supabase
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

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      opportunity =
        updatedOpportunity;
    } else {
      const {
        data: newOpportunity,
        error: insertError,
      } = await supabase
        .from("opportunities")
        .insert({
          user_id:
            user.id,

          company:
            extraction.company,

          role:
            extraction.role,

          source_type:
            extraction.source_type,

          category:
            extraction.category,

          status:
            extraction.status,

          application_status:
            "Not Decided",

          deadline:
            extraction.deadline,

          apply_link:
            extraction.apply_link,

          eligibility:
            extraction.eligibility,

          next_action:
            extraction.next_action,

          ai_confidence:
            extraction.confidence,

          ai_model:
            MODEL,

          automatic_updates:
            true,

          needs_review:
            extraction.confidence < 0.7,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(
          insertError.message
        );
      }

      opportunity =
        newOpportunity;
    }

    /*
     * STEP 5 — LINK SOURCE EMAIL
     */
    if (!opportunity) {
      throw new Error(
        "Opportunity could not be created or loaded"
      );
    }

    const {
      error: linkError,
    } = await supabase
      .from(
        "opportunity_messages"
      )
      .upsert(
        {
          opportunity_id:
            opportunity.id,

          gmail_message_id:
            message.id,
        },
        {
          onConflict:
            "opportunity_id,gmail_message_id",
        }
      );

    if (linkError) {
      throw new Error(
        linkError.message
      );
    }

    return NextResponse.json({
      success: true,
      processed: true,
      stage: "complete",

      message: {
        id:
          message.id,

        gmail_message_id:
          message.gmail_message_id,

        gmail_thread_id:
          message.gmail_thread_id,

        sender:
          message.sender,

        subject:
          message.subject,
      },

      classification,

      extraction,

      opportunity,
    });
  } catch (error) {
    console.error(
      "AI processing error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "AI email processing failed",

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
