/** The temperature scale shown on the home page; the wizard derives its placeholder from the same values. */
export const temperatureRanges = [
  { value: "−40° / −18°", label: "Shok muzlatish" },
  { value: "−18° / −5°", label: "Chuqur muzlatish" },
  { value: "−5° / 0°", label: "Muzlatish chegarasi" },
  { value: "0° / +5°", label: "Sovutish va saqlash" },
] as const;

export function temperaturePlaceholderFor(item?: { id: string; title: string; icon: string }) {
  if (!item) return `Masalan: ${temperatureRanges[3].value}C`;
  const text = `${item.id} ${item.title} ${item.icon}`.toLocaleLowerCase("uz-UZ");
  const range = /shok|shock|snow|muzqaymoq|ice/u.test(text) ? temperatureRanges[0]
    : /go.?sht|meat|baliq|muzlat/u.test(text) ? temperatureRanges[1]
    : /meva|sabzavot|fruit|moon|sut|gul/u.test(text) ? temperatureRanges[3]
    : null;
  return range ? `Masalan: ${range.value}C (${range.label.toLocaleLowerCase("uz-UZ")})` : `Masalan: ${temperatureRanges[0].value.split(" / ")[0]}C … ${temperatureRanges[3].value.split(" / ")[1]}C`;
}
