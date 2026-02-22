import { stringify } from "node:querystring";
import { WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import type { NextApiRequest } from "next";
import { encodeOAuthState } from "../../_utils/oauth/encodeOAuthState";
import { getOpenTalkAppKeys } from "../lib/getOpenTalkAppKeys";

async function handler(req: NextApiRequest) {
  const user = req.session?.user;
  if (!user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const { base_url, client_id } = await getOpenTalkAppKeys();

  // Discover the OIDC provider URL from the OpenTalk instance
  const loginRes = await fetch(`${base_url}/v1/auth/login`);
  if (!loginRes.ok) {
    throw new Error(`OpenTalk OIDC discovery failed: ${loginRes.status}`);
  }
  const loginData = (await loginRes.json()) as { oidc: { url: string } };
  const oidcProvider = loginData.oidc.url;

  // Fetch the OpenID Connect well-known configuration to get authorization_endpoint
  const wellKnownRes = await fetch(`${oidcProvider}/.well-known/openid-configuration`);
  if (!wellKnownRes.ok) {
    throw new Error(`OIDC well-known fetch failed: ${wellKnownRes.status}`);
  }
  const wellKnown = (await wellKnownRes.json()) as { authorization_endpoint: string };
  const authorizationEndpoint = wellKnown.authorization_endpoint;

  const state = encodeOAuthState(req);
  const params = {
    response_type: "code",
    client_id,
    redirect_uri: `${WEBAPP_URL_FOR_OAUTH}/api/integrations/opentalk/callback`,
    scope: "openid",
    state,
  };

  const url = `${authorizationEndpoint}?${stringify(params)}`;
  return { url };
}

export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(handler) }),
});
