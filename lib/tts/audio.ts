// Joining the audio of several TTS requests into one file, and its duration. MP3: the MPEG frames of every part are
// concatenated (ID3 tags and the Xing/Info header frame dropped, so players read the real length). WAV: the PCM data is
// concatenated under one new header (all parts must share the sample format). Pure — no Node APIs.

export type AudioFormat = "mp3" | "wav";
export type ParsedAudio = { format: AudioFormat; durationMs: number; body: Uint8Array };
export const MIME: Record<AudioFormat, string> = { mp3: "audio/mpeg", wav: "audio/wav" };

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));

// ---- MP3 ------------------------------------------------------------------------------------------------------------
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MPEG-1/2/2.5 Layer III frame header at `at` → its length, samples and sample rate; null when it is not one. */
export function mp3Frame(bytes: Uint8Array, at: number) {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[at + 1] >> 3) & 3, layer = (bytes[at + 1] >> 1) & 3;
  const bitrateIndex = bytes[at + 2] >> 4, rateIndex = (bytes[at + 2] >> 2) & 3, padding = (bytes[at + 2] >> 1) & 1;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const sampleRate = RATES[version][rateIndex], bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex] * 1000;
  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(samples / 8 * bitrate / sampleRate) + padding;
  return { length, samples, sampleRate };
}

function skipId3(bytes: Uint8Array) {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return 0;
  const size = (bytes[6] & 0x7f) << 21 | (bytes[7] & 0x7f) << 14 | (bytes[8] & 0x7f) << 7 | (bytes[9] & 0x7f);
  return 10 + size + (bytes[5] & 0x10 ? 10 : 0);
}

/** The audio frames of an MP3 (no tags, no Xing/Info/VBRI header frame) and their total duration; null when none. */
export function parseMp3(bytes: Uint8Array): ParsedAudio | null {
  const frames: Array<[number, number]> = [];
  let at = skipId3(bytes), seconds = 0, first = true;
  while (at + 4 <= bytes.length) {
    if (ascii(bytes, at, 3) === "TAG" && bytes.length - at <= 128) break;
    const frame = mp3Frame(bytes, at);
    if (!frame || frame.length < 4) { at++; continue; }
    // A real frame is followed by another frame (or the end); otherwise it was a false sync inside some other data.
    const next = at + frame.length;
    if (next < bytes.length - 4 && !mp3Frame(bytes, next) && ascii(bytes, next, 3) !== "TAG") { at++; continue; }
    const end = Math.min(next, bytes.length);
    const head = ascii(bytes, at, Math.min(frame.length, 64, end - at));
    const isInfo = first && /Xing|Info|VBRI/.test(head);
    if (!isInfo) { frames.push([at, end]); seconds += frame.samples / frame.sampleRate; }
    first = false;
    at = end;
  }
  if (!frames.length) return null;
  const size = frames.reduce((sum, [start, end]) => sum + end - start, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const [start, end] of frames) { body.set(bytes.subarray(start, end), offset); offset += end - start; }
  return { format: "mp3", durationMs: Math.round(seconds * 1000), body };
}

// ---- WAV ------------------------------------------------------------------------------------------------------------
export type WavInfo = { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number; blockAlign: number; byteRate: number; data: Uint8Array };

export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12, fmt: Omit<WavInfo, "data"> | null = null;
  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at, 4), size = view.getUint32(at + 4, true), body = at + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      fmt = { audioFormat: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), byteRate: view.getUint32(body + 8, true), blockAlign: view.getUint16(body + 12, true), bitsPerSample: view.getUint16(body + 14, true) };
    } else if (id === "data" && fmt) {
      // Streamed WAVs may say 0 or 0xFFFFFFFF here: then the data runs to the end of the file.
      const end = size === 0 || body + size > bytes.length ? bytes.length : body + size;
      const length = end - body - (end - body) % Math.max(1, fmt.blockAlign);
      return fmt.byteRate > 0 ? { ...fmt, data: bytes.subarray(body, body + length) } : null;
    }
    at = body + size + (size % 2);
  }
  return null;
}

export function wavHeader(info: Omit<WavInfo, "data">, dataLength: number) {
  const header = new Uint8Array(44), view = new DataView(header.buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) header[at + i] = value.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, 36 + dataLength, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, info.audioFormat, true); view.setUint16(22, info.channels, true);
  view.setUint32(24, info.sampleRate, true); view.setUint32(28, info.byteRate, true); view.setUint16(32, info.blockAlign, true); view.setUint16(34, info.bitsPerSample, true);
  text(36, "data"); view.setUint32(40, dataLength, true);
  return header;
}

// ---- Both -----------------------------------------------------------------------------------------------------------
export const detectFormat = (bytes: Uint8Array): AudioFormat | null => parseWav(bytes) ? "wav" : parseMp3(bytes) ? "mp3" : null;

/** One file from the parts (in order) and its duration. Throws when a part is not audio or the parts do not match. */
export function mergeAudio(parts: Uint8Array[], format: AudioFormat): { bytes: Uint8Array; durationMs: number } {
  if (!parts.length) throw new Error("No audio");
  if (format === "wav") {
    const wavs = parts.map(parseWav);
    if (wavs.some(wav => !wav)) throw new Error("Not a WAV file");
    const [first] = wavs as WavInfo[];
    if ((wavs as WavInfo[]).some(wav => wav.sampleRate !== first.sampleRate || wav.channels !== first.channels || wav.bitsPerSample !== first.bitsPerSample || wav.audioFormat !== first.audioFormat)) throw new Error("WAV parts differ");
    const length = (wavs as WavInfo[]).reduce((sum, wav) => sum + wav.data.length, 0);
    const bytes = new Uint8Array(44 + length);
    bytes.set(wavHeader(first, length), 0);
    let offset = 44;
    for (const wav of wavs as WavInfo[]) { bytes.set(wav.data, offset); offset += wav.data.length; }
    return { bytes, durationMs: Math.round(length / first.byteRate * 1000) };
  }
  const mp3s = parts.map(parseMp3);
  if (mp3s.some(mp3 => !mp3)) throw new Error("Not an MP3 file");
  const length = (mp3s as ParsedAudio[]).reduce((sum, mp3) => sum + mp3.body.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const mp3 of mp3s as ParsedAudio[]) { bytes.set(mp3.body, offset); offset += mp3.body.length; }
  return { bytes, durationMs: (mp3s as ParsedAudio[]).reduce((sum, mp3) => sum + mp3.durationMs, 0) };
}
