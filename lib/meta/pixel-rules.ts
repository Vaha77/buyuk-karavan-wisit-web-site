// Meta Pixel rules shared by the browser and the server (no Node imports).

/** Pixel only on public pages: never under /admin (nor /api). */
export const pixelAllowed = (pathname: string | null | undefined) => !!pathname && !/^\/(?:admin|api)(?:\/|$)/.test(pathname);
/** Browser Pixel and server event share this id so Meta counts the Lead once. */
export const isEventId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
