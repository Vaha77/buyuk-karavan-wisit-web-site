"use server";
import { createProductCategory, updateProductCategory, deleteProductCategory, CategoryInUseError, CategoryValidationError } from "@/lib/product-categories/mutations";
import { requireAdmin } from "@/lib/auth/require-admin";

type Result = { error?: string; category?: { id: string; name: string; slug: string; isActive: boolean; order: number } };
const errorMessage = (error: unknown) => error instanceof CategoryInUseError || error instanceof CategoryValidationError ? error.message : "Kategoriya amalini bajarib bo‘lmadi.";
export async function createCategoryAction(name: string): Promise<Result> { await requireAdmin(); try { return { category: await createProductCategory(name) }; } catch (error) { return { error: errorMessage(error) }; } }
export async function updateCategoryAction(id: string, input: { name: string; isActive: boolean; order: number }): Promise<Result> { await requireAdmin(); try { return { category: await updateProductCategory(id, input) }; } catch (error) { return { error: errorMessage(error) }; } }
export async function deleteCategoryAction(id: string, moveToId?: string): Promise<Result> { await requireAdmin(); try { await deleteProductCategory(id, moveToId); return {}; } catch (error) { return { error: errorMessage(error) }; } }
