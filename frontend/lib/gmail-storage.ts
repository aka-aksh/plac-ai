import { createServerSupabaseClient } from "@/lib/supabase-server";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

type GmailTokenData = {
  accessToken: string;
  refreshToken?: string | null;
};

type StoredGmailTokens = {
  accessToken: string;
  refreshToken: string | null;
};

export async function saveGmailTokens(
  userId: string,
  tokenData: GmailTokenData
) {
  const supabase = await createServerSupabaseClient();

  const encryptedAccessToken = encryptSecret(
    tokenData.accessToken
  );

  const values: Record<string, string | null> = {
    user_id: userId,

    access_token_encrypted:
      encryptedAccessToken.encrypted,

    access_token_iv:
      encryptedAccessToken.iv,

    access_token_auth_tag:
      encryptedAccessToken.authTag,

    updated_at: new Date().toISOString(),
  };

  // Only replace the refresh token when Google actually
  // returned a new one. Otherwise preserve the existing one.
  if (tokenData.refreshToken) {
    const encryptedRefreshToken = encryptSecret(
      tokenData.refreshToken
    );

    values.refresh_token_encrypted =
      encryptedRefreshToken.encrypted;

    values.refresh_token_iv =
      encryptedRefreshToken.iv;

    values.refresh_token_auth_tag =
      encryptedRefreshToken.authTag;
  }

  const { error } = await supabase
    .from("gmail_connections")
    .upsert(values, {
      onConflict: "user_id",
    });

  if (error) {
    throw new Error(
      `Failed to save Gmail tokens: ${error.message}`
    );
  }
}

export async function getGmailTokens(
  userId: string
): Promise<StoredGmailTokens> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("gmail_connections")
    .select(
      `
      access_token_encrypted,
      access_token_iv,
      access_token_auth_tag,
      refresh_token_encrypted,
      refresh_token_iv,
      refresh_token_auth_tag
      `
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load Gmail tokens: ${error.message}`
    );
  }

  if (
    !data?.access_token_encrypted ||
    !data.access_token_iv ||
    !data.access_token_auth_tag
  ) {
    throw new Error("Gmail is not connected. Please log out and sign in with Google.");
  }

  try {
    const accessToken = decryptSecret(
      data.access_token_encrypted,
      data.access_token_iv,
      data.access_token_auth_tag
    );

    let refreshToken: string | null = null;

    if (
      data.refresh_token_encrypted &&
      data.refresh_token_iv &&
      data.refresh_token_auth_tag
    ) {
      refreshToken = decryptSecret(
        data.refresh_token_encrypted,
        data.refresh_token_iv,
        data.refresh_token_auth_tag
      );
    }

    return {
      accessToken,
      refreshToken,
    };
  } catch (decryptError) {
    console.error("Token decryption failed:", decryptError);
    throw new Error(
      "Gmail session token could not be decrypted (ENCRYPTION_KEY was updated). Please log out and sign in again with Google."
    );
  }
}

export async function updateGmailAccessToken(
  userId: string,
  accessToken: string
) {
  const supabase = await createServerSupabaseClient();

  const encryptedAccessToken =
    encryptSecret(accessToken);

  const { error } = await supabase
    .from("gmail_connections")
    .update({
      access_token_encrypted:
        encryptedAccessToken.encrypted,

      access_token_iv:
        encryptedAccessToken.iv,

      access_token_auth_tag:
        encryptedAccessToken.authTag,

      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Failed to update Gmail access token: ${error.message}`
    );
  }
}