import { ScreenTimeUpdateSchema } from "@kidlearn/types";
import type { z } from "zod";

export { ScreenTimeUpdateSchema as ScreenTimeBodySchema };

export type ScreenTimeBody = z.infer<typeof ScreenTimeUpdateSchema>;
