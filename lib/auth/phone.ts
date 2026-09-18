export function normalizeUzPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[+\d\s()\-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 9) digits = `998${digits}`;
  if (digits.length !== 12 || !digits.startsWith("998")) return null;
  return `+${digits}`;
}
