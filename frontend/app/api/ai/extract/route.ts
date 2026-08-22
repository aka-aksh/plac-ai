import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { extractOpportunity } from "@/lib/gemini-extract";

const MODEL = "gemini-3.5-flash-lite";

type OpportunityCandidate = {
  id: string;
  company: string | null;
  role: string | null;
  source_type: string | null;
  application_status: string | null;
  automatic_updates: boolean | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompany(value: string | null | undefined) {
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

  const existingRole =
    normalize(candidate.role);

  const newRole =
    normalize(role);

  /*
   * If either side has no role, do not merge
   * purely on company name.
   *
   * This prevents two different jobs from the
   * same company from accidentally becoming one.
   */
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
     * Get one AI-classified relevant email that
     * has not yet been attached to an opportunity.
     *
     * Using opportunity_messages here prevents
     * the same Gmail message from being extracted
     * repeatedly.
     */
    const {
      data: messages,
      error: messageError,
    } =
      await supabase
        .from("gmail_messages")
        .select(
          `
          id,
          gmail_message_id,
          gmail_thread_id,
          sender,
          subject,
          body_text,
          ai_relevant,
          ai_classified_at,
          received_at
          `
        )
        .eq("user_id", user.id)
        .eq("ai_relevant", true)
        .not("ai_classified_at", "is", null)
        .order("received_at", {
          ascending: false,
        })
        .limit(20);

    if (messageError) {
      throw new Error(
        messageError.message
      );
    }

    if (!messages?.length) {
      return NextResponse.json({
        success: true,
        extracted: false,
        message:
          "No classified relevant email is available.",
      });
    }

    let message = null;

    for (const candidate of messages) {
      const {
        data: existingLink,
        error: linkLookupError,
      } = await supabase
        .from("opportunity_messages")
        .select("id")
        .eq(
          "gmail_message_id",
          candidate.id
        )
        .maybeSingle();

      if (linkLookupError) {
        throw new Error(
          linkLookupError.message
        );
      }

      if (!existingLink) {
        message = candidate;
        break;
      }
    }

    if (!message) {
      return NextResponse.json({
        success: true,
        extracted: false,
        message:
          "All currently classified relevant emails have already been extracted.",
      });
    }

    const extraction =
      await extractOpportunity(
        message.sender,
        message.subject,
        message.body_text ?? ""
      );

    /*
     * Load existing opportunities belonging
     * ONLY to this authenticated user.
     */
    const {
      data: candidates,
      error: candidateError,
    } =
      await supabase
        .from("opportunities")
        .select(
          `
          id,
          company,
          role,
          source_type,
          application_status,
          automatic_updates
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

    /*
     * First matching pass:
     * company + role.
     *
     * This prevents different roles at the
     * same company from being merged.
     */
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

    if (opportunity) {
      /*
       * Existing opportunity:
       * update only fields that contain useful
       * information from the new email.
       */
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

        ai_confidence:
          extraction.confidence,

        ai_model:
          MODEL,

        updated_at:
          new Date().toISOString(),

        automatic_updates:
          opportunity.automatic_updates ??
          true,
      };

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

      /*
       * Never overwrite a manually controlled
       * status.
       */
      if (
        opportunity.automatic_updates
      ) {
        updates.application_status =
          extraction.status;
      }

      const {
        data: updatedOpportunity,
        error: updateError,
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

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      opportunity =
        updatedOpportunity;
    } else {
      /*
       * No matching opportunity:
       * create a new one.
       */
      const {
        data: newOpportunity,
        error: insertError,
      } =
        await supabase
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

            application_status:
              extraction.status,

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
     * Link the Gmail message to the opportunity.
     *
     * This gives us:
     *
     * ONE opportunity
     *        ↑
     * email 1
     * email 2
     * email 3
     */
    const {
      error: linkError,
    } =
      await supabase
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
      extracted: true,

      message: {
        id: message.id,
        gmail_message_id:
          message.gmail_message_id,
        gmail_thread_id:
          message.gmail_thread_id,
        sender:
          message.sender,
        subject:
          message.subject,
      },

      extraction,

      opportunity,
    });
  } catch (error) {
    console.error(
      "Opportunity extraction error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Opportunity extraction failed",
      },
      {
        status: 500,
      }
    );
  }
}