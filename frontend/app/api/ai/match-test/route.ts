import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { extractOpportunity } from "@/lib/gemini-extract";

const TEST_COMPANY = "PlacementAI Test Corp";
const TEST_ROLE = "Software Engineer";

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameOpportunity(
  companyA: string | null,
  roleA: string | null,
  companyB: string,
  roleB: string | null
) {
  return (
    normalize(companyA) === normalize(companyB) &&
    normalize(roleA) === normalize(roleB)
  );
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
     * EMAIL 1
     * Initial opportunity.
     */
    const emailOne = await extractOpportunity(
      "careers@placementaitest.com",
      "Application Open - Software Engineer",
      `
PlacementAI Test Corp is hiring Software Engineers.

Role: Software Engineer
For the 2027 graduating batch.

Apply before 27 August 2026.

Eligibility:
B.Tech CSE/IT
CGPA 7.5+
No active backlogs

Application link:
https://example.com/test-apply

This is a campus placement opportunity.
`
    );

    /*
     * EMAIL 2
     * Same company + same role,
     * but now the student has reached
     * the interview stage.
     */
    const emailTwo = await extractOpportunity(
      "careers@placementaitest.com",
      "Interview Invitation - Software Engineer",
      `
PlacementAI Test Corp has reviewed your application.

You have been shortlisted for the Software Engineer role.

Your interview is scheduled for 30 August 2026.

Please prepare for the technical interview.

This is part of the same campus recruitment process.
`
    );

    /*
     * Force the same test identity.
     * This removes any variation in how
     * Gemini might write the company/role.
     */
    const first = {
      ...emailOne,
      company: TEST_COMPANY,
      role: TEST_ROLE,
    };

    const second = {
      ...emailTwo,
      company: TEST_COMPANY,
      role: TEST_ROLE,
    };

    /*
     * Delete only previous test opportunities.
     * Real opportunities are untouched.
     */
    const {
      error: deleteError,
    } = await supabase
      .from("opportunities")
      .delete()
      .eq("user_id", user.id)
      .eq("company", TEST_COMPANY);

    if (deleteError) {
      throw new Error(
        deleteError.message
      );
    }

    /*
     * STEP 1
     * Create the first opportunity.
     *
     * IMPORTANT:
     * application_status is NOT the recruitment stage.
     *
     * application_status:
     * Not Decided / I Apply / I Applied
     *
     * status:
     * New / Assessment / Interview / Selected...
     */
    const {
      data: created,
      error: createError,
    } = await supabase
      .from("opportunities")
      .insert({
        user_id: user.id,

        company:
          first.company,

        role:
          first.role,

        source_type:
          first.source_type,

        category:
          first.category,

        status:
          first.status,

        application_status:
          "Not Decided",

        deadline:
          first.deadline,

        apply_link:
          first.apply_link,

        eligibility:
          first.eligibility,

        next_action:
          first.next_action,

        ai_confidence:
          first.confidence,

        ai_model:
          "gemini-3.5-flash-lite",

        automatic_updates:
          true,

        needs_review:
          first.confidence < 0.7,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(
        createError.message
      );
    }

    /*
     * STEP 2
     * Find the existing opportunity
     * using company + role.
     */
    const {
      data: candidates,
      error: lookupError,
    } = await supabase
      .from("opportunities")
      .select(
        `
        id,
        company,
        role,
        source_type,
        category,
        status,
        application_status,
        deadline
        `
      )
      .eq("user_id", user.id)
      .eq("company", TEST_COMPANY);

    if (lookupError) {
      throw new Error(
        lookupError.message
      );
    }

    const existing =
      candidates?.find(
        (candidate) =>
          sameOpportunity(
            candidate.company,
            candidate.role,
            second.company,
            second.role
          )
      );

    if (!existing) {
      throw new Error(
        "Matching opportunity was not found."
      );
    }

    /*
     * STEP 3
     * Update the SAME opportunity.
     *
     * Notice:
     * application_status remains untouched.
     * Only the recruitment status changes.
     */
    const {
      data: updated,
      error: updateError,
    } = await supabase
      .from("opportunities")
      .update({
        source_type:
          second.source_type,

        category:
          second.category,

        status:
          second.status,

        deadline:
          second.deadline,

        apply_link:
          second.apply_link,

        eligibility:
          second.eligibility,

        next_action:
          second.next_action,

        ai_confidence:
          second.confidence,

        ai_model:
          "gemini-3.5-flash-lite",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        existing.id
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

    /*
     * STEP 4
     * Verify that only ONE test opportunity
     * exists after both emails.
     */
    const {
      data: finalRows,
      error: finalError,
    } = await supabase
      .from("opportunities")
      .select(
        `
        id,
        company,
        role,
        source_type,
        category,
        status,
        application_status,
        deadline
        `
      )
      .eq("user_id", user.id)
      .eq("company", TEST_COMPANY);

    if (finalError) {
      throw new Error(
        finalError.message
      );
    }

    const finalCount =
      finalRows?.length ?? 0;

    return NextResponse.json({
      success: true,

      test: {
        firstEmail: first,
        secondEmail: second,
      },

      createdOpportunity:
        created,

      updatedOpportunity:
        updated,

      finalOpportunityCount:
        finalCount,

      duplicatePrevented:
        finalCount === 1,
    });
  } catch (error) {
    console.error(
      "Match test error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Opportunity matching test failed",

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
