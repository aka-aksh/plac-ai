import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// POST: Create a new opportunity manually
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      company,
      role,
      source_type = "Non-CDC",
      category = "Full-Time",
      status = "New",
      application_status = "Not Decided",
      deadline,
      apply_link,
      eligibility,
      next_action,
      notes,
    } = body;

    if (!company || typeof company !== "string" || !company.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const { data: newOpportunity, error: insertError } = await supabase
      .from("opportunities")
      .insert({
        user_id: user.id,
        company: company.trim(),
        role: role?.trim() || null,
        source_type: source_type === "CDC" ? "CDC" : "Non-CDC",
        category: category?.trim() || "Full-Time",
        status: status || "New",
        application_status: application_status || "Not Decided",
        deadline: deadline || null,
        apply_link: apply_link?.trim() || null,
        eligibility: eligibility?.trim() || null,
        next_action: next_action?.trim() || null,
        notes: notes?.trim() || null,
        automatic_updates: false,
        needs_review: false,
        ai_confidence: 1.0,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return NextResponse.json({ success: true, opportunity: newOpportunity }, { status: 201 });
  } catch (error) {
    console.error("Failed to create opportunity:", error);
    return NextResponse.json(
      { error: "Failed to create opportunity" },
      { status: 500 }
    );
  }
}

// PATCH: Update opportunity fields (status, application_status, deadline, etc.)
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Opportunity ID is required" }, { status: 400 });
    }

    // Filter allowed fields to update
    const allowedFields = [
      "company",
      "role",
      "source_type",
      "category",
      "status",
      "application_status",
      "deadline",
      "apply_link",
      "eligibility",
      "next_action",
      "notes",
      "automatic_updates",
    ];

    const sanitizedUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const key of allowedFields) {
      if (key in updates) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    const { data: updatedOpportunity, error: updateError } = await supabase
      .from("opportunities")
      .update(sanitizedUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ success: true, opportunity: updatedOpportunity });
  } catch (error) {
    console.error("Failed to update opportunity:", error);
    return NextResponse.json(
      { error: "Failed to update opportunity" },
      { status: 500 }
    );
  }
}

// DELETE: Delete an opportunity
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Opportunity ID is required" }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Failed to delete opportunity:", error);
    return NextResponse.json(
      { error: "Failed to delete opportunity" },
      { status: 500 }
    );
  }
}
