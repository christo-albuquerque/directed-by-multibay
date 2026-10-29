const KEY = 'multibay-reduced-motion';

function saved(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Reduced motion: no strobing lights or screen glitches, calmer camera, fewer particles.
 * Follows the OS setting until the user picks one with the Demo Panel toggle.
 */
export const motion = {
  reduced: saved() ?? !!query?.matches,

  set(reduced: boolean): void {
    this.reduced = reduced;
    try {
      localStorage.setItem(KEY, reduced ? '1' : '0');
    } catch {
      // Preference just won't persist.
    }
  },
};

query?.addEventListener('change', (e) => {
  if (saved() === null) motion.reduced = e.matches;
});
