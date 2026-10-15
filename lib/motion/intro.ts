// The preloader hands the stage to the hero mid-exit, so the two timelines overlap into one reveal.
let released = false;
const listeners = new Set<() => void>();

export function releaseIntro() {
  if (released) return;
  released = true;
  listeners.forEach((listener) => listener());
  listeners.clear();
}

/** Runs `start` once the preloader lets go (immediately if it already has). Returns an unsubscribe. */
export function onIntroRelease(start: () => void) {
  if (released) {
    start();
    return () => {};
  }
  listeners.add(start);
  return () => { listeners.delete(start); };
}
