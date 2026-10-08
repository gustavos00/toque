// What scanning a tag does to its task. A task can have several tags, e.g. the
// washing machine ("start") and the clothes rack ("complete" = laundry hung).

import { z } from "zod";

export const TAG_ACTIONS = [
  "start", // the normal scan: starts / acknowledges / marks done, depending on the kind
  "complete", // marks the task handled (e.g. timer: "roupa estendida")
] as const;
export const tagActionSchema = z.enum(TAG_ACTIONS);
export type TagAction = z.infer<typeof tagActionSchema>;
