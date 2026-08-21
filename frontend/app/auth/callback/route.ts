import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { saveGmailTokens } from "@/lib/gmail-storage";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/error`
    );
  }

  const supabase =
    await createServerSupabaseClient();

  const { data, error } =
    await supabase.auth.exchangeCodeForSession(
      code
    );

  if (error || !data.session) {
    console.error(
      "OAuth callback error:",
      error
    );

    return NextResponse.redirect(
      `${origin}/auth/error`
    );
  }

  const user = data.session.user;

  const providerToken =
    data.session.provider_token;

  const providerRefreshToken =
    data.session.provider_refresh_token;

  // Gmail access requires a Google provider token.
  if (!providerToken) {
    console.error(
      "Google provider token was not returned."
    );

    return NextResponse.redirect(
      `${origin}/auth/error`
    );
  }

  try {
    await saveGmailTokens(user.id, {
      accessToken: providerToken,
      refreshToken: providerRefreshToken,
    });
  } catch (storageError) {
    console.error(
      "Failed to securely store Gmail tokens:",
      storageError
    );

    return NextResponse.redirect(
      `${origin}/auth/error`
    );
  }

  return NextResponse.redirect(
    `${origin}/dashboard`
  );
}