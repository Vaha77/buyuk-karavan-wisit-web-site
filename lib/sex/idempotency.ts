// Same form submit twice (double click, retry, two tabs racing): one order. Pure; the store calls are passed in.

/**
 * Creates once per requestId. When two submits race past the "already exists?" check, the database's unique
 * requestId makes the second insert fail; that failure is answered with the order the first one created.
 */
export async function createOnce<T>(requestId: string | null, find: (requestId: string) => Promise<T | null>, create: () => Promise<T>, isUniqueViolation: (error: unknown) => boolean): Promise<{ value: T; repeated: boolean }> {
  if (requestId) {
    const existing = await find(requestId);
    if (existing) return { value: existing, repeated: true };
  }
  try {
    return { value: await create(), repeated: false };
  } catch (error) {
    if (requestId && isUniqueViolation(error)) {
      const existing = await find(requestId);
      if (existing) return { value: existing, repeated: true };
    }
    throw error;
  }
}
