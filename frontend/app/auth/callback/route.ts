import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { saveGmailTokens } from "@/lib/gmail-storage";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const authErrorUrl = (
    reason: string,
    details?: { providerError?: string; providerDescription?: string | null }
  ) => {
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", reason);

    if (details?.providerError) {
      url.searchParams.set("provider_error", details.providerError.slice(0, 100));
    }

    if (details?.providerDescription) {
      url.searchParams.set(
        "provider_error_description",
        details.providerDescription.slice(0, 500)
      );
    }

    return url.toString();
  };

  const code = searchParams.get("code");
  const providerError = searchParams.get("error");
  const providerErrorDescription = searchParams.get("error_description");

  if (providerError) {
    console.error("OAuth provider error:", {
      error: providerError,
      description: providerErrorDescription,
    });

    const providerDescription = providerErrorDescription?.startsWith(
      "Unable to exchange external code"
    )
      ? "Supabase could not exchange the one-time Google authorization code. Check the Supabase Auth logs for the underlying provider error."
      : providerErrorDescription;

    return NextResponse.redirect(
      authErrorUrl(
        providerError === "access_denied"
          ? "google_access_denied"
          : "provider_sign_in_failed",
        {
          providerError,
          providerDescription,
        }
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(
      authErrorUrl("missing_code")
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
      authErrorUrl("session_exchange_failed")
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
      authErrorUrl("missing_gmail_permission")
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
      authErrorUrl("token_storage_failed")
    );
  }

  return NextResponse.redirect(
    `${origin}/dashboard`
  );
}
