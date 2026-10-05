// Rules for approving a PENDING self-registration on /admin/users. Pure, so the tests can run them without a database.
export const APPROVAL_ROLES = ["SELLER", "WORKSHOP", "MANAGER", "ADMIN"] as const;
export type ApprovalRole = (typeof APPROVAL_ROLES)[number];
/** Most registrations come from sellers. SUPER_ADMIN is never granted from the approval list. */
export const DEFAULT_APPROVAL_ROLE: ApprovalRole = "SELLER";
export const SELLER_TAKEN = "Bu sotuvchi boshqa foydalanuvchiga bog‘langan.";

export type ApprovalPerson = { id: string; userId: string | null } | null;
export type ApprovalResult = { error: string } | { role: ApprovalRole; salesPersonId: string | null };

/**
 * `person` is the SalesPerson looked up by `salesPersonId` (null when not found or not requested).
 * A SELLER must be linked to a SalesPerson no other user owns; other roles never carry a link.
 */
export function checkApproval(role: string, salesPersonId: string, person: ApprovalPerson, userId: string): ApprovalResult {
  if (!(APPROVAL_ROLES as readonly string[]).includes(role)) return { error: "Bu rolni tasdiqlashda berib bo‘lmaydi." };
  if (role !== "SELLER") return { role: role as ApprovalRole, salesPersonId: null };
  if (!salesPersonId) return { error: "Sotuvchini tanlang." };
  if (!person || person.id !== salesPersonId) return { error: "Tanlangan sotuvchi topilmadi." };
  if (person.userId && person.userId !== userId) return { error: SELLER_TAKEN };
  return { role: "SELLER", salesPersonId: person.id };
}
