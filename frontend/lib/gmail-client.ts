import {
  getGmailTokens,
  updateGmailAccessToken,
} from "@/lib/gmail-storage";

const GOOGLE_TOKEN_URL =
  "https://oauth2.googleapis.com/token";

const GMAIL_BASE_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailFetchResult = {
  response: Response;
  accessToken: string;
};

async function refreshAccessToken(
  userId: string,
  refreshToken: string
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth server credentials are missing"
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Google token refresh failed: ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(
      "Google did not return a new access token"
    );
  }

  await updateGmailAccessToken(
    userId,
    data.access_token
  );

  return data.access_token;
}

export async function gmailFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<GmailFetchResult> {
  const tokens = await getGmailTokens(userId);

  const makeRequest = async (
    accessToken: string
  ) => {
    return fetch(
      `${GMAIL_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          Authorization:
            `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );
  };

  let accessToken = tokens.accessToken;

  let response = await makeRequest(
    accessToken
  );

  // Access token expired → use refresh token.
  if (
    response.status === 401 &&
    tokens.refreshToken
  ) {
    accessToken = await refreshAccessToken(
      userId,
      tokens.refreshToken
    );

    response = await makeRequest(
      accessToken
    );
  }

  return {
    response,
    accessToken,
  };
}