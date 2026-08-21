import { createServerSupabaseClient } from "@/lib/supabase-server";
import { encryptSecret } from "@/lib/crypto";

type GmailTokenData = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
};

export async function saveGmailTokens(
  userId: string,
  tokenData: GmailTokenData
) {
  const supabase = await createServerSupabaseClient();

  const encryptedAccessToken = encryptSecret(
    tokenData.accessToken
  );

  let encryptedRefreshToken = null;

  if (tokenData.refreshToken) {
    encryptedRefreshToken = encryptSecret(
      tokenData.refreshToken
    );
  }

  const { error } = await supabase
    .from("gmail_connections")
    .upsert(
      {
        user_id: userId,

        access_token_encrypted:
          encryptedAccessToken.encrypted,

        access_token_iv:
          encryptedAccessToken.iv,

        access_token_auth_tag:
          encryptedAccessToken.authTag,

        refresh_token_encrypted:
          encryptedRefreshToken?.encrypted ?? null,

        refresh_token_iv:
          encryptedRefreshToken?.iv ?? null,

        refresh_token_auth_tag:
          encryptedRefreshToken?.authTag ?? null,

        access_token_expires_at:
          tokenData.expiresAt ?? null,

        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    throw new Error(
      `Failed to save Gmail tokens: ${error.message}`
    );
  }
}