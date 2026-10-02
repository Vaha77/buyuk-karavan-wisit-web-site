import { z } from "zod";
import { getStaffSession } from "@/lib/auth/session";
import { confirmProductPreview, verifyPreview } from "@/lib/ai-office/product-agent-preview";
import { rejectUnauthorizedProductAgentTool } from "@/lib/ai-office/product-agent";

const editSchema = z.object({ id: z.string(), name: z.string().trim().min(3).max(160), categoryName: z.string().trim().min(3).max(120), finalPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/), seoTitle: z.string().trim().min(20).max(160), seoDescription: z.string().trim().min(80).max(500) });
const inputSchema = z.object({ previewToken: z.string().min(100).max(500_000), confirmationAction: z.literal("confirm-product-preview"), agentId: z.literal("product-agent-01"), edits: z.array(editSchema).max(50).optional() });

export async function POST(request: Request) {
  const session = await getStaffSession(); if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Explicit tasdiqlash ma’lumoti noto‘g‘ri." }, { status: 400 });
  try {
    await rejectUnauthorizedProductAgentTool("createProduct", session.user);
    await rejectUnauthorizedProductAgentTool("updateProduct", session.user);
    const payload = verifyPreview(parsed.data.previewToken, session.user.id, session.id, session.tokenHash);
    for (const edit of parsed.data.edits || []) { const row = payload.rows.find(item => item.id === edit.id); if (!row) throw new Error("PREVIEW_EDIT_INVALID"); row.name = edit.name; row.finalPrice = edit.finalPrice; row.seoTitle = edit.seoTitle; row.seoDescription = edit.seoDescription; if (edit.categoryName !== row.categoryName) { row.categoryName = edit.categoryName; row.categoryId = null; row.newCategoryName = edit.categoryName; row.existingProductId = null; row.oldPrice = null; row.status = "YANGI"; } }
    const completed = await confirmProductPreview(payload, session.user); const results = completed.results;
    const counts = { created: results.filter(item => item.action === "CREATE").length, updated: results.filter(item => item.action === "UPDATE").length, skipped: results.filter(item => item.action === "SKIP").length, failed: results.filter(item => item.action === "FAIL").length };
    return Response.json({ results, counts, categoriesCreated: completed.categoriesCreated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONFIRM_FAILED";
    const status = code === "PREVIEW_ALREADY_CONFIRMED" ? 409 : code === "PREVIEW_TOKEN_INVALID" ? 403 : 500;
    return Response.json({ error: code === "PREVIEW_ALREADY_CONFIRMED" ? "Bu preview avval tasdiqlangan." : code === "PREVIEW_TOKEN_INVALID" ? "Preview token yaroqsiz yoki muddati tugagan." : "Tasdiqlash bajarilmadi." }, { status });
  }
}
