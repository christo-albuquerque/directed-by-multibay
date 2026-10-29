export const DEFAULT_REPOS = ['christo-albuquerque/multibay-testlot'];

const TOKEN_KEY = 'multibay-token';

export interface AppConfig {
  repos: string[];
  /** Live polling can be switched off with `?live=0`. */
  live: boolean;
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/** Reads `?repos=owner/a,owner/b` and `?live=0` from the URL. */
export function loadConfig(search = location.search): AppConfig {
  const q = new URLSearchParams(search);
  const fromUrl = (q.get('repos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => REPO_RE.test(s));
  return { repos: fromUrl.length ? fromUrl : DEFAULT_REPOS, live: q.get('live') !== '0' };
}

/**
 * An optional read-only GitHub token, kept only in this browser's localStorage and sent only to
 * api.github.com. It raises the API limit from 60 to 5000 requests an hour. Never put it in the URL.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private window): the token just won't persist.
  }
}
