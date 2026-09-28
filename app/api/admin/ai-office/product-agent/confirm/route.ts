import { z } from "zod";
import { getAdminSession } from "@/lib/auth/session";
import { confirmProductPreview, verifyPreview } from "@/lib/ai-office/product-agent-preview";
import { rejectUnauthorizedProductAgentTool } from "@/lib/ai-office/product-agent";

const inputSchema = z.object({ previewToken: z.string().min(100).max(500_000), confirmationAction: z.literal("confirm-product-preview"), agentId: z.literal("product-agent-01") });

export async function POST(request: Request) {
  const session = await getAdminSession(); if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Explicit tasdiqlash ma’lumoti noto‘g‘ri." }, { status: 400 });
  try {
    await rejectUnauthorizedProductAgentTool("createProduct", session.user);
    await rejectUnauthorizedProductAgentTool("updateProduct", session.user);
    const payload = verifyPreview(parsed.data.previewToken, session.user.id, session.id, session.tokenHash);
    const results = await confirmProductPreview(payload, session.user);
    const counts = { created: results.filter(item => item.action === "CREATE").length, updated: results.filter(item => item.action === "UPDATE").length, skipped: results.filter(item => item.action === "SKIP").length, failed: results.filter(item => item.action === "FAIL").length };
    return Response.json({ results, counts });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONFIRM_FAILED";
    const status = code === "PREVIEW_ALREADY_CONFIRMED" ? 409 : code === "PREVIEW_TOKEN_INVALID" ? 403 : 500;
    return Response.json({ error: code === "PREVIEW_ALREADY_CONFIRMED" ? "Bu preview avval tasdiqlangan." : code === "PREVIEW_TOKEN_INVALID" ? "Preview token yaroqsiz yoki muddati tugagan." : "Tasdiqlash bajarilmadi." }, { status });
  }
}
