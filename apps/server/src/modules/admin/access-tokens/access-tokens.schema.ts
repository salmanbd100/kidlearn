import { z } from "zod";

export { CreateAdminAccessTokenSchema } from "@kidlearn/types";

export const AccessTokenIdParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();
