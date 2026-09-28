export type HomeLeadOption = { id: string; label: string };

export function visibleLeadOptions(
  items: { id: string; title: string; isVisible: boolean; order: number }[],
): HomeLeadOption[] {
  return items
    .filter((item) => item.isVisible)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({ id: item.id, label: item.title }));
}
