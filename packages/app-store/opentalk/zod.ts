import { z } from "zod";

export const appDataSchema = z.object({});

export const appKeysSchema = z.object({
  base_url: z.string().url().describe("OpenTalk Controller API URL (e.g. https://controller.example.com)"),
  web_url: z.string().url().describe("OpenTalk Web Frontend URL for meeting join links (e.g. https://talk.example.com)"),
  client_id: z.string().min(1).describe("OAuth Client ID from Keycloak"),
  client_secret: z.string().min(1).describe("OAuth Client Secret from Keycloak"),
});
