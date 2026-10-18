export function normalizeUzPhone(value: string): string | null {
  // Spaces (incl. no-break), any dash (iPhone autofill uses U+2011), dots, brackets; "00998…" and a leading 0 trunk prefix.
  const trimmed = value.trim().replace(/[\s()\-\u2010-\u2015\u2212.]/g, "");
  if (!/^(\+|00)?\d+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/^(\+|00)/, "");
  if (digits.length === 10 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 9) digits = `998${digits}`;
  if (digits.length !== 12 || !digits.startsWith("998")) return null;
  return `+${digits}`;
}

/** "+998901234567" → "+998 90 123 45 67" (shown back in the form). */
export const formatUzPhone = (phone: string) => phone.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4");
