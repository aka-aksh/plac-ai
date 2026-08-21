import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { decryptSecret } from "@/lib/crypto";

const GMAIL_MESSAGES_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

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

    const { data: connection, error: connectionError } =
      await supabase
        .from("gmail_connections")
        .select(
          `
          access_token_encrypted,
          access_token_iv,
          access_token_auth_tag
          `
        )
        .eq("user_id", user.id)
        .maybeSingle();

    if (connectionError) {
      console.error(
        "Gmail connection lookup failed:",
        connectionError
      );

      return NextResponse.json(
        { error: "Failed to load Gmail connection" },
        { status: 500 }
      );
    }

    if (
      !connection?.access_token_encrypted ||
      !connection.access_token_iv ||
      !connection.access_token_auth_tag
    ) {
      return NextResponse.json(
        { error: "Gmail is not connected" },
        { status: 400 }
      );
    }

    const accessToken = decryptSecret(
      connection.access_token_encrypted,
      connection.access_token_iv,
      connection.access_token_auth_tag
    );

    const messagesResponse = await fetch(
      `${GMAIL_MESSAGES_URL}?maxResults=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();

      console.error(
        "Gmail API request failed:",
        messagesResponse.status,
        errorText
      );

      return NextResponse.json(
        {
          error: "Gmail API request failed",
          status: messagesResponse.status,
        },
        { status: 502 }
      );
    }

    const messagesData = await messagesResponse.json();
    const firstMessage = messagesData.messages?.[0];

    if (!firstMessage?.id) {
      return NextResponse.json({
        success: true,
        emailFound: false,
        message: "Gmail connected, but no messages were found.",
      });
    }

    return NextResponse.json({
      success: true,
      emailFound: true,
      messageId: firstMessage.id,
      threadId: firstMessage.threadId,
    });
  } catch (error) {
    console.error("Gmail test route error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}