export function normalizeCatalogSearch(value: string) {
  return value.toLocaleLowerCase("uz-UZ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 120);
}

export function decodeCatalogCursor(value?: string | null) {
  const offset = Number(value || 0);
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000 ? offset : 0;
}
