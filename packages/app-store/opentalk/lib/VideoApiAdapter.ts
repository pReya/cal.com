import {
  APP_CREDENTIAL_SHARING_ENABLED,
  CREDENTIAL_SYNC_ENDPOINT,
  CREDENTIAL_SYNC_SECRET,
  CREDENTIAL_SYNC_SECRET_HEADER_NAME,
} from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";
import { z } from "zod";
import { invalidateCredential } from "../../_utils/invalidateCredential";
import { getTokenObjectFromCredential } from "../../_utils/oauth/getTokenObjectFromCredential";
import { markTokenAsExpired } from "../../_utils/oauth/markTokenAsExpired";
import { OAuthManager, TokenStatus } from "../../_utils/oauth/OAuthManager";
import { getOpenTalkAppKeys } from "./getOpenTalkAppKeys";

const log = logger.getSubLogger({ prefix: ["app-store/opentalk/lib/VideoApiAdapter"] });

const openTalkEventResultSchema = z.object({
  id: z.string(),
  room: z.object({
    id: z.string(),
  }),
});

const credentialKeySchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expiry_date: z.number(),
  token_endpoint: z.string(),
});

const OpenTalkVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  const tokenResponse = getTokenObjectFromCredential(credential);

  const fetchOpenTalkApi = async (endpoint: string, options?: RequestInit) => {
    const { base_url } = await getOpenTalkAppKeys();
    const credentialKey = credentialKeySchema.parse(credential.key);

    const auth = new OAuthManager({
      credentialSyncVariables: {
        APP_CREDENTIAL_SHARING_ENABLED,
        CREDENTIAL_SYNC_ENDPOINT,
        CREDENTIAL_SYNC_SECRET,
        CREDENTIAL_SYNC_SECRET_HEADER_NAME,
      },
      resourceOwner: {
        type: "user",
        id: credential.userId,
      },
      appSlug: "opentalk",
      currentTokenObject: tokenResponse,
      fetchNewTokenObject: async ({ refreshToken }) => {
        if (!refreshToken) return null;
        const { client_id, client_secret } = await getOpenTalkAppKeys();
        return fetch(credentialKey.token_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id,
            client_secret,
          }),
        });
      },
      isTokenObjectUnusable: async (response) => {
        if (!response.ok) {
          try {
            const body = (await response.json()) as { error?: string };
            if (body.error === "invalid_grant") {
              return { reason: body.error };
            }
          } catch (_) {
            // ignore parse errors
          }
        }
        return null;
      },
      isAccessTokenUnusable: async (response) => {
        if (response.status === 401) {
          return { reason: "Unauthorized" };
        }
        return null;
      },
      invalidateTokenObject: () => invalidateCredential(credential.id),
      expireAccessToken: () => markTokenAsExpired(credential),
      updateTokenObject: async (newTokenObject) => {
        await prisma.credential.update({
          where: { id: credential.id },
          data: { key: newTokenObject as unknown as Prisma.InputJsonValue },
        });
      },
    });

    const { json, tokenStatus } = await auth.request({
      url: `${base_url}/v1/${endpoint}`,
      options: {
        method: "GET",
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      },
    });

    if (tokenStatus === TokenStatus.UNUSABLE_TOKEN_OBJECT) {
      throw new Error("OpenTalk credentials are invalid. Please reconnect your OpenTalk account.");
    }
    if (tokenStatus === TokenStatus.UNUSABLE_ACCESS_TOKEN || tokenStatus === TokenStatus.INCONCLUSIVE) {
      throw new Error("OpenTalk access token is expired or invalid. Please reconnect your OpenTalk account and retry.");
    }

    return json;
  };

  return {
    getAvailability: async () => {
      // OpenTalk events are time-bound meetings, no free/busy concept to expose
      return [];
    },

    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      try {
        const { web_url } = await getOpenTalkAppKeys();
        const response = await fetchOpenTalkApi("events", {
          method: "POST",
          body: JSON.stringify({
            title: event.title,
            description: event.description ?? "",
            is_time_independent: false,
            is_all_day: false,
            starts_at: { datetime: new Date(event.startTime).toISOString(), timezone: event.organizer.timeZone },
            ends_at: { datetime: new Date(event.endTime).toISOString(), timezone: event.organizer.timeZone },
            suppress_email_notification: true,
          }),
        });

        const result = openTalkEventResultSchema.parse(response);
        return {
          type: "opentalk_video",
          id: result.id,
          password: "",
          url: `${web_url}/room/${result.room.id}`,
        };
      } catch (err) {
        log.error("OpenTalk meeting creation failed", safeStringify(err));
        throw new Error("Failed to create OpenTalk meeting");
      }
    },

    updateMeeting: async (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> => {
      try {
        const { web_url } = await getOpenTalkAppKeys();
        const response = await fetchOpenTalkApi(`events/${bookingRef.uid}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: event.title,
            description: event.description ?? "",
            starts_at: { datetime: new Date(event.startTime).toISOString(), timezone: event.organizer.timeZone },
            ends_at: { datetime: new Date(event.endTime).toISOString(), timezone: event.organizer.timeZone },
          }),
        });

        const result = openTalkEventResultSchema.parse(response);
        return {
          type: "opentalk_video",
          id: result.id,
          password: "",
          url: `${web_url}/room/${result.room.id}`,
        };
      } catch (err) {
        log.error("OpenTalk meeting update failed", safeStringify(err));
        return Promise.reject(new Error("Failed to update OpenTalk meeting"));
      }
    },

    deleteMeeting: async (uid: string): Promise<void> => {
      try {
        await fetchOpenTalkApi(`events/${uid}?suppress_email_notification=true`, {
          method: "DELETE",
        });
      } catch (err) {
        log.error("OpenTalk meeting deletion failed", safeStringify(err));
        return Promise.reject(new Error("Failed to delete OpenTalk meeting"));
      }
    },
  };
};

export default OpenTalkVideoApiAdapter;
