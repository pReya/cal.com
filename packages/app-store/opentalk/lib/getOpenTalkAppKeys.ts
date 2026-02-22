import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import { appKeysSchema } from "../zod";

export const getOpenTalkAppKeys = async () => {
  const appKeys = await getAppKeysFromSlug("opentalk");
  return appKeysSchema.parse(appKeys);
};
