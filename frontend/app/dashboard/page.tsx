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

/**
 * Relevant placement mail must remain actionable even when the model fails to
 * populate its optional `company` field. Subjects from CDC forwards normally
 * name the company, so retain that information rather than dropping the mail.
 */
function companyFromSubject(subject: string | null, gmailMessageId: string) {
  const cleaned = (subject ?? "")
    .replace(/^\s*((re|fwd?)\s*:\s*)+/i, "")
    .replace(/^\s*(update|notification|announcement)\s*:\s*/i, "")
    .replace(/\s*[-–—:]?\s*(super dream\s+)?internship\b.*$/i, "")
    .replace(/\s*[-–—:]?\s*(placement|recruitment|registration)\b.*$/i, "")
    .trim();

  return cleaned || `Placement opportunity ${gmailMessageId.slice(-8)}`;
}

/**
 * A model response is not allowed to silently discard an email that plainly
 * advertises a placement event. It is retained as Needs Review so the user can
 * see it on the dashboard even when Gemini returns a false negative.
 */
function hasStrongPlacementSignal(
  subject: string | null,
  body: string | null
) {
  return /\b(job|internship|hiring|campus\s+drive|placement|assessment|interview|shortlist(?:ed)?|selection|recruit(?:ment|ing)?|\bctc\b|stipend|apply|registration)\b/i.test(
    `${subject ?? ""}\n${body ?? ""}`
  );
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
      // A prior classify-only run can mark a message as AI-relevant while its
      // legacy relevance_status remains "irrelevant". Always retry those
      // messages so a relevant email cannot be stranded in Activity only.
      // Unclassified mail still respects the relevance pre-filter.
      .or(
        "ai_relevant.eq.true,and(ai_classified_at.is.null,relevance_status.in.(relevant,pending))"
      )
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

    // Process emails sequentially instead of using Promise.all().
    // This avoids sending multiple Gemini requests at the same time and
    // lets us stop immediately when the free-tier quota is exhausted.
    const results: Array<Record<string, unknown>> = [];
    let quotaExhausted = false;

    for (const message of messages) {
      try {
        const body = (message.body_text ?? "").slice(0, 30000);
        let result: UnifiedProcessingResult = await classifyAndExtract(
          message.sender,
          message.subject,
          body
        );

        const forcedNeedsReview =
          !result.relevant && hasStrongPlacementSignal(message.subject, body);

        if (forcedNeedsReview) {
          result = {
            ...result,
            relevant: true,
            category: "Needs Review",
            reason: `Needs review: Gemini marked this email irrelevant, but it contains strong placement signals. ${result.reason}`,
          };
        }

        const safeConfidence = Math.max(
          0,
          Math.min(1, result.confidence ?? 0.8)
        );

        const { error: classificationUpdateError } = await supabase
          .from("gmail_messages")
          .update({
            ai_relevant: result.relevant,
            relevance_status: result.relevant ? "relevant" : "irrelevant",
            ai_category: result.category,
            ai_confidence: safeConfidence,
            ai_reason: result.reason,
            ai_classified_at: new Date().toISOString(),
            ai_model: MODEL,
            updated_at: new Date().toISOString(),
          })
          .eq("id", message.id)
          .eq("user_id", user.id);

        if (classificationUpdateError) {
          throw new Error(
            `Failed to save AI classification: ${classificationUpdateError.message}`
          );
        }

        if (!result.relevant) {
          results.push({
            messageId: message.id,
            gmailMessageId: message.gmail_message_id,
            status: "not_relevant",
            classification: {
              relevant: false,
              category: result.category,
              confidence: safeConfidence,
              reason: result.reason,
            },
            extraction: result,
            opportunityId: null,
            failureReason: null,
          });
          continue;
        }

        const usedCompanyFallback = !result.company?.trim();
        const company =
          result.company?.trim() ||
          companyFromSubject(message.subject, message.gmail_message_id);

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

        let opportunity = liveCandidates.find((candidate) =>
          isSameOpportunity(candidate, company, combinedRole)
        );

        const opportunityAction = opportunity ? "updated" : "created";

        if (opportunity) {
          const updates: Record<string, unknown> = {
            company,
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

          const { error: opportunityUpdateError } = await supabase
            .from("opportunities")
            .update(updates)
            .eq("id", opportunity.id)
            .eq("user_id", user.id);

          if (opportunityUpdateError) {
            throw new Error(
              `Failed to update opportunity: ${opportunityUpdateError.message}`
            );
          }
        } else {
          const { data: newOpp, error: opportunityInsertError } = await supabase
            .from("opportunities")
            .insert({
              user_id: user.id,
              company,
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
              needs_review:
                safeConfidence < 0.7 ||
                usedCompanyFallback ||
                forcedNeedsReview,
            })
            .select("id, company, role")
            .single();

          if (opportunityInsertError) {
            throw new Error(
              `Failed to create opportunity: ${opportunityInsertError.message}`
            );
          }

          if (newOpp) {
            opportunity = newOpp;
            liveCandidates.push(newOpp);
          }
        }

        if (opportunity) {
          const { error: opportunityLinkError } = await supabase
            .from("opportunity_messages")
            .upsert(
              {
                opportunity_id: opportunity.id,
                gmail_message_id: message.id,
              },
              { onConflict: "opportunity_id,gmail_message_id" }
            );

          if (opportunityLinkError) {
            throw new Error(
              `Failed to link email to opportunity: ${opportunityLinkError.message}`
            );
          }
        }

        results.push({
          messageId: message.id,
          gmailMessageId: message.gmail_message_id,
          status: opportunityAction,
          classification: {
            relevant: true,
            category: result.category,
            confidence: safeConfidence,
            reason: result.reason,
          },
          extraction: result,
          opportunityId: opportunity?.id ?? null,
          failureReason: null,
          usedCompanyFallback,
          forcedNeedsReview,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (/429/.test(error.message) ||
            /RESOURCE_EXHAUSTED/i.test(error.message) ||
            /quota exceeded/i.test(error.message) ||
            /GenerateRequestsPerDayPerModel-FreeTier/i.test(error.message) ||
            /GenerateRequestsPerDayPerModel/i.test(error.message))
        ) {
          quotaExhausted = true;
          console.warn(
            `Gemini quota exhausted while processing ${message.id}. Stopping current batch.`
          );
          break;
        }

        console.error(`Error processing email ${message.id}:`, error);
        results.push({
          messageId: message.id,
          gmailMessageId: message.gmail_message_id,
          status: "failed",
          classification: null,
          extraction: null,
          opportunityId: null,
          failureReason:
            error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = results.reduce(
  (
    totals: {
      created: number;
      updated: number;
      notCreated: number;
      needsReview: number;
      failed: number;
    },
    item
  ) => {
    if (item.status === "failed") {
      totals.failed += 1;
    } else if (item.status === "created") {
      totals.created += 1;
    } else if (item.status === "updated") {
      totals.updated += 1;
    } else {
      totals.notCreated += 1;
    }

    if (item.forcedNeedsReview) {
      totals.needsReview += 1;
    }

    return totals;
  },
  {
    created: 0,
    updated: 0,
    notCreated: 0,
    needsReview: 0,
    failed: 0,
  }
);

    return NextResponse.json({
      success: true,
      processed: results.length > 0,
      count: results.length,
      selected: messages.length,
      attempted: results.length,
      hasMore: quotaExhausted || messages.length < candidateMessages.length,
      quotaExhausted,
      summary,
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
