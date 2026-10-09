// Input of the status buttons on /admin/seh. Pure (zod only), so the tests parse exactly what the server action parses.
import { z } from "zod";
import { ORDER_ACTIONS, type OrderAction } from "./rules";

export const transitionInputSchema = z.object({
  id: z.string().min(1, "Zakaz tanlanmagan.").max(40),
  action: z.enum(ORDER_ACTIONS as [OrderAction, ...OrderAction[]], { error: issue => `Noma’lum amal: ${String(issue.input)}.` }),
  issuedQty: z.record(z.string().max(40), z.number().int("Berilgan son butun bo‘lsin.").min(0).max(9999)).optional(),
});

/** First problem of a rejected button press, in words (instead of a bare "So‘rov noto‘g‘ri"). */
export function transitionInputError(error: z.ZodError) {
  return error.issues[0]?.message || "So‘rov noto‘g‘ri.";
}
