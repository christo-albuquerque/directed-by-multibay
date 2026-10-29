import { MAX_BAYS } from './scene/layoutPlan';

/** Used when there is no `?repos=`, no saved list and no repos.json. */
export const DEFAULT_REPOS = ['christo-albuquerque/multibay-testlot'];

const TOKEN_KEY = 'multibay-token';
const REPOS_KEY = 'multibay-repos';
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function isRepoName(s: string): boolean {
  return REPO_RE.test(s);
}

/** Accepts `owner/name` strings or `{ repo: 'owner/name' }` objects; drops anything invalid or repeated. */
export function parseRepoList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const name = typeof item === 'string' ? item : typeof item === 'object' && item && typeof (item as { repo?: unknown }).repo === 'string' ? (item as { repo: string }).repo : '';
    const trimmed = name.trim();
    if (isRepoName(trimmed) && !out.some((r) => r.toLowerCase() === trimmed.toLowerCase())) out.push(trimmed);
    if (out.length >= MAX_BAYS) break;
  }
  return out;
}

export interface AppConfig {
  /** Repos named in the URL (`?repos=a/b,c/d`), which win over everything else. */
  urlRepos: string[];
  /** Live polling can be switched off with `?live=0`. */
  live: boolean;
}

export function loadConfig(search = location.search): AppConfig {
  const q = new URLSearchParams(search);
  return { urlRepos: parseRepoList((q.get('repos') ?? '').split(',')), live: q.get('live') !== '0' };
}

export function loadSavedRepos(): string[] {
  try {
    return parseRepoList(JSON.parse(localStorage.getItem(REPOS_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveRepos(repos: string[]): void {
  try {
    localStorage.setItem(REPOS_KEY, JSON.stringify(repos));
  } catch {
    // Storage unavailable (private window): the list just won't persist.
  }
}

/** The repos shipped with the site (`public/repos.json`), so the default can change without a rebuild. */
export async function loadDefaultRepos(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}repos.json`, { cache: 'no-cache' });
    if (!res.ok) return DEFAULT_REPOS;
    const body = (await res.json()) as { repos?: unknown };
    const list = parseRepoList(body.repos);
    return list.length ? list : DEFAULT_REPOS;
  } catch {
    return DEFAULT_REPOS;
  }
}

/** URL beats the saved list, which beats the shipped default. */
export function resolveRepos(urlRepos: string[], saved: string[], defaults: string[]): string[] {
  return urlRepos.length ? urlRepos : saved.length ? saved : defaults;
}

/** Short display names: the repo name, or `owner/name` when two repos share a name. */
export function labelsFor(repos: string[]): string[] {
  const names = repos.map((r) => r.split('/')[1]);
  return repos.map((r, i) => (names.filter((n) => n.toLowerCase() === names[i].toLowerCase()).length > 1 ? r : names[i]));
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
