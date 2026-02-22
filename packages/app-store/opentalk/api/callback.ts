import { WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import setDefaultConferencingApp from "../../_utils/setDefaultConferencingApp";
import { getOpenTalkAppKeys } from "../lib/getOpenTalkAppKeys";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = decodeOAuthState(req);
  const userId = req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "No user found" });
  }

  const { code } = req.query;
  if (typeof code !== "string") {
    return res.status(400).json({ message: "Missing or invalid code parameter" });
  }

  const { base_url, client_id, client_secret } = await getOpenTalkAppKeys();
  const redirectUri = `${WEBAPP_URL_FOR_OAUTH}/api/integrations/opentalk/callback`;

  // Re-discover token_endpoint so we can store it for later token refreshes
  const loginRes = await fetch(`${base_url}/v1/auth/login`);
  if (!loginRes.ok) {
    return res.status(502).json({ message: "OpenTalk OIDC discovery failed" });
  }
  const loginData = (await loginRes.json()) as { oidc: { url: string } };
  const oidcProvider = loginData.oidc.url;

  const wellKnownRes = await fetch(`${oidcProvider}/.well-known/openid-configuration`);
  if (!wellKnownRes.ok) {
    return res.status(502).json({ message: "OIDC well-known fetch failed" });
  }
  const wellKnown = (await wellKnownRes.json()) as { token_endpoint: string };
  const tokenEndpoint = wellKnown.token_endpoint;

  // Exchange the authorization code for tokens
  const tokenRes = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id,
      client_secret,
    }),
  });

  if (!tokenRes.ok) {
    let errorMessage = "Token exchange failed";
    try {
      const body = (await tokenRes.json()) as { error_description?: string; error?: string };
      errorMessage = body.error_description ?? body.error ?? errorMessage;
    } catch (_) {
      // ignore parse error, use default message
    }
    return res.status(400).json({ message: errorMessage });
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  if (!tokenData.access_token) {
    return res.status(400).json({ message: "No access token in response" });
  }

  const credentialKey = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: Math.round(Date.now() + tokenData.expires_in * 1000),
    // Store token_endpoint so the adapter can refresh without re-discovery
    token_endpoint: tokenEndpoint,
  };

  // Delete any existing opentalk_video credentials to prevent duplicates
  const existingCredentials = await prisma.credential.findMany({
    select: { id: true },
    where: { type: "opentalk_video", userId, appId: "opentalk" },
  });
  const idsToDelete = existingCredentials.map((c) => c.id);
  if (idsToDelete.length > 0) {
    await prisma.credential.deleteMany({ where: { id: { in: idsToDelete }, userId } });
  }

  await createOAuthAppCredential({ appId: "opentalk", type: "opentalk_video" }, credentialKey, req);

  if (state?.defaultInstall) {
    await setDefaultConferencingApp(userId, "opentalk");
  }

  res.redirect(
    getSafeRedirectUrl(state?.returnTo) ?? getInstalledAppPath({ variant: "conferencing", slug: "opentalk" })
  );
}
