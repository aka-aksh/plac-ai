import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { extractOpportunity } from "@/lib/gemini-extract";

const MODEL = "gemini-3.5-flash-lite";

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: message, error: messageError } =
      await supabase
        .from("gmail_messages")
        .select(
          `
          id,
          gmail_message_id,
          sender,
          subject,
          body_text,
          ai_relevant,
          ai_classified_at
          `
        )
        .eq("user_id", user.id)
        .eq("ai_relevant", true)
        .not("ai_classified_at", "is", null)
        .order("received_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (messageError) {
      throw new Error(messageError.message);
    }

    if (!message) {
      return NextResponse.json({
        success: true,
        extracted: false,
        message:
          "No classified relevant email is available.",
      });
    }

    const extraction =
      await extractOpportunity(
        message.sender,
        message.subject,
        message.body_text ?? ""
      );

    const normalizedCompany =
      normalize(extraction.company);

    const normalizedRole =
      normalize(extraction.role);

    const { data: candidates, error: candidateError } =
      await supabase
        .from("opportunities")
        .select("*")
        .eq("user_id", user.id);

    if (candidateError) {
      throw new Error(candidateError.message);
    }

    let opportunity = null;

    for (const candidate of candidates ?? []) {
      const sameCompany =
        normalize(candidate.company) ===
        normalizedCompany;

      const sameRole =
        normalize(candidate.role) ===
        normalizedRole;

      if (sameCompany && sameRole) {
        opportunity = candidate;
        break;
      }
    }

    if (opportunity) {
      const updates: Record<string, unknown> = {
        category: extraction.category,
        summary: extraction.summary,
        ai_confidence: extraction.confidence,
        ai_model: MODEL,
        next_action: extraction.next_action,
        updated_at: new Date().toISOString(),
      };

      if (extraction.role !== null) {
        updates.role = extraction.role;
      }

      if (extraction.deadline !== null) {
        updates.deadline = extraction.deadline;
      }

      if (extraction.apply_link !== null) {
        updates.apply_link =
          extraction.apply_link;
      }

      if (extraction.important_note !== null) {
        updates.important_note =
          extraction.important_note;
      }

      if (!opportunity.automatic_updates) {
        // Keep the existing status untouched.
      } else {
        updates.application_status =
          extraction.application_status;
      }

      const {
        data: updatedOpportunity,
        error: updateError,
      } = await supabase
        .from("opportunities")
        .update(updates)
        .eq("id", opportunity.id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      opportunity = updatedOpportunity;
    } else {
      const {
        data: newOpportunity,
        error: insertError,
      } = await supabase
        .from("opportunities")
        .insert({
          user_id: user.id,
          company: extraction.company,
          role: extraction.role,
          category: extraction.category,
          application_status:
            extraction.application_status,
          deadline: extraction.deadline,
          apply_link: extraction.apply_link,
          summary: extraction.summary,
          important_note:
            extraction.important_note,
          next_action:
            extraction.next_action,
          ai_confidence:
            extraction.confidence,
          ai_model: MODEL,
          automatic_updates: true,
          needs_review:
            extraction.confidence < 0.7,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      opportunity = newOpportunity;
    }

    const {
      error: linkError,
    } = await supabase
      .from("opportunity_messages")
      .upsert(
        {
          opportunity_id: opportunity.id,
          gmail_message_id: message.id,
        },
        {
          onConflict:
            "opportunity_id,gmail_message_id",
        }
      );

    if (linkError) {
      throw new Error(linkError.message);
    }

    return NextResponse.json({
      success: true,
      extracted: true,
      opportunity,
      extraction,
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
      { status: 500 }
    );
  }
}