import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "The sign-in response did not include an authorization code.",
  google_access_denied:
    "Google denied the requested permissions. Confirm this account is a test user for the same Google Cloud project configured in Supabase, then try again.",
  provider_sign_in_failed:
    "Google could not complete the sign-in request. Check the callback URL and Google OAuth configuration, then try again.",
  session_exchange_failed:
    "We could not complete your Google sign-in session.",
  missing_gmail_permission:
    "Google did not grant the Gmail read permission Placement AI needs.",
  token_storage_failed:
    "Your Gmail connection could not be saved securely. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{
    reason?: string | string[];
    provider_error?: string | string[];
    provider_error_description?: string | string[];
  }>;
}) {
  const { reason, provider_error: providerError, provider_error_description: providerDescription } =
    await searchParams;
  const message =
    typeof reason === "string" && ERROR_MESSAGES[reason]
      ? ERROR_MESSAGES[reason]
      : "We could not connect your Google account. Please try again.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-black px-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-red-900/70 p-8 text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-400">
          Connection failed
        </p>
        <h1 className="mb-3 text-3xl font-bold">Couldn&apos;t connect Gmail</h1>
        <p className="mb-8 text-gray-300">{message}</p>
        {typeof providerError === "string" && (
          <div className="mb-8 rounded-lg border border-gray-800 bg-gray-950 p-4 text-left text-sm text-gray-300">
            <p className="font-semibold text-white">Provider diagnostic</p>
            <p className="mt-1 break-words">{providerError}</p>
            {typeof providerDescription === "string" && (
              <p className="mt-2 break-words text-gray-400">
                {providerDescription}
              </p>
            )}
          </div>
        )}
        <Link
          className="inline-flex w-full justify-center rounded-lg bg-white px-5 py-3 font-semibold text-black hover:bg-gray-200"
          href="/"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
