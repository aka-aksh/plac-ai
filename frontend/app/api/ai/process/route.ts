import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { classifyAndExtract, UnifiedProcessingResult } from "@/lib/gemini";

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
  role: string | null | undefined
) {
  const sameCompany =
    normalizeCompany(candidate.company) === normalizeCompany(company);

  if (!sameCompany) return false;

  const existingRole = normalize(candidate.role);
  const newRole = normalize(role);

  if (!existingRole || !newRole) return false;

  return existingRole === newRole;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchSize = Math.min(10, Math.max(1, Number(searchParams.get("batch") || 5)));

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Pick messages that still have no opportunity link. This includes messages
    // previously handled by the classify-only route: they are already known to
    // be relevant, but still need structured extraction for the dashboard.
    const { data: candidateMessages, error: messageError } = await supabase
      .from("gmail_messages")
      .select(`
        id,
        gmail_message_id,
        gmail_thread_id,
        sender,
        subject,
        body_text,
        relevance_status,
        ai_classified_at,
        received_at
      `)
      .eq("user_id", user.id)
      .in("relevance_status", ["relevant", "pending"])
      .or("ai_classified_at.is.null,ai_relevant.eq.true")
      .order("received_at", { ascending: false })
      .limit(batchSize * 5);

    if (messageError) {
      throw new Error(messageError.message);
    }

    if (!candidateMessages || candidateMessages.length === 0) {
      return NextResponse.json({
        success: true,
        processed: false,
        count: 0,
        message: "No new eligible email needs processing.",
      });
    }

    const candidateIds = candidateMessages.map((message) => message.id);
    const { data: existingLinks, error: linkError } = await supabase
      .from("opportunity_messages")
      .select("gmail_message_id")
      .in("gmail_message_id", candidateIds);

    if (linkError) {
      throw new Error(linkError.message);
    }

    const linkedMessageIds = new Set(
      (existingLinks ?? []).map((link) => link.gmail_message_id)
    );
    const messages = candidateMessages
      .filter((message) => !linkedMessageIds.has(message.id))
      .slice(0, batchSize);

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        processed: false,
        count: 0,
        message: "All relevant emails have already been extracted.",
      });
    }

    // Load existing opportunities for deduplication
    const { data: candidates } = await supabase
      .from("opportunities")
      .select("id, company, role")
      .eq("user_id", user.id);

    const liveCandidates: OpportunityCandidate[] = candidates ?? [];

    // Process all emails in this batch in parallel with Gemini AI
    const results = await Promise.all(
      messages.map(async (message) => {
        try {
          const body = (message.body_text ?? "").slice(0, 30000);
          const result: UnifiedProcessingResult = await classifyAndExtract(
            message.sender,
            message.subject,
            body
          );

          const safeConfidence = Math.max(0, Math.min(1, result.confidence ?? 0.8));

          // Save classification to message record
          await supabase
            .from("gmail_messages")
            .update({
              ai_relevant: result.relevant,
              ai_category: result.category,
              ai_confidence: safeConfidence,
              ai_reason: result.reason,
              ai_classified_at: new Date().toISOString(),
              ai_model: MODEL,
              updated_at: new Date().toISOString(),
            })
            .eq("id", message.id)
            .eq("user_id", user.id);

          if (!result.relevant || !result.company?.trim()) {
            return { id: message.id, relevant: false, result };
          }

          // Compute combined role and category
          const combinedRole =
            result.roles && result.roles.length > 0
              ? result.roles.join(" • ")
              : result.role?.trim() || null;

          const finalCategory =
            result.is_hackathon || result.category === "Hackathon"
              ? "Hackathon"
              : result.opportunity_category || result.category || "Full-Time";

          const ctcInfo = [
            result.ctc ? `CTC: ${result.ctc}` : "",
            result.stipend ? `Stipend: ${result.stipend}` : "",
          ]
            .filter(Boolean)
            .join(" • ");

          // Deduplicate or insert opportunity
          let opportunity = liveCandidates.find((c) =>
            isSameOpportunity(c, result.company!, combinedRole)
          );

          if (opportunity) {
            const updates: Record<string, unknown> = {
              company: result.company,
              role: combinedRole ?? undefined,
              source_type: result.source_type || "Non-CDC",
              category: finalCategory,
              status: result.status || "New",
              ai_confidence: safeConfidence,
              ai_model: MODEL,
              updated_at: new Date().toISOString(),
            };

            if (result.deadline) updates.deadline = result.deadline;
            if (result.apply_link) updates.apply_link = result.apply_link;
            if (result.eligibility) updates.eligibility = result.eligibility;
            if (result.next_action) updates.next_action = result.next_action;
            if (ctcInfo) updates.notes = ctcInfo;

            await supabase
              .from("opportunities")
              .update(updates)
              .eq("id", opportunity.id)
              .eq("user_id", user.id);
          } else {
            const { data: newOpp } = await supabase
              .from("opportunities")
              .insert({
                user_id: user.id,
                company: result.company.trim(),
                role: combinedRole,
                source_type: result.source_type || "Non-CDC",
                category: finalCategory,
                status: result.status || "New",
                application_status: "Not Decided",
                deadline: result.deadline || null,
                apply_link: result.apply_link || null,
                eligibility: result.eligibility || null,
                next_action: result.next_action || null,
                notes: ctcInfo || null,
                ai_confidence: safeConfidence,
                ai_model: MODEL,
                automatic_updates: true,
                needs_review: safeConfidence < 0.7,
              })
              .select("id, company, role")
              .single();

            if (newOpp) {
              opportunity = newOpp;
              liveCandidates.push(newOpp);
            }
          }

          if (opportunity) {
            await supabase
              .from("opportunity_messages")
              .upsert(
                {
                  opportunity_id: opportunity.id,
                  gmail_message_id: message.id,
                },
                { onConflict: "opportunity_id,gmail_message_id" }
              );
          }

          return { id: message.id, relevant: true, result, opportunity };
        } catch (err) {
          console.error(`Error processing email ${message.id}:`, err);
          return { id: message.id, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    return NextResponse.json({
      success: true,
      processed: true,
      count: messages.length,
      results,
    });
  } catch (error) {
    console.error("AI batch processing error:", error);
    return NextResponse.json(
      {
        error: "AI email processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
