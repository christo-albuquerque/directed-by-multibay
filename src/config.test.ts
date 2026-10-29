import { describe, expect, it } from 'vitest';
import { DEFAULT_REPOS, labelsFor, loadConfig, parseRepoList, resolveRepos } from './config';

describe('parseRepoList', () => {
  it('keeps valid names, accepts objects, and drops junk and duplicates', () => {
    expect(parseRepoList(['a/b', { repo: 'c/d' }, 'not a repo', 'A/B', 42, '', 'x/y/z'])).toEqual(['a/b', 'c/d']);
  });

  it('is empty for non-arrays and caps the number of bays', () => {
    expect(parseRepoList('a/b')).toEqual([]);
    expect(parseRepoList(['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/6'])).toHaveLength(4);
  });
});

describe('loadConfig', () => {
  it('reads ?repos and ?live', () => {
    expect(loadConfig('?repos=a/b, c/d ,bad').urlRepos).toEqual(['a/b', 'c/d']);
    expect(loadConfig('?live=0').live).toBe(false);
    expect(loadConfig('').live).toBe(true);
    expect(loadConfig('').urlRepos).toEqual([]);
  });
});

describe('resolveRepos', () => {
  it('prefers the URL, then the saved list, then the defaults', () => {
    expect(resolveRepos(['u/r'], ['s/r'], ['d/r'])).toEqual(['u/r']);
    expect(resolveRepos([], ['s/r'], ['d/r'])).toEqual(['s/r']);
    expect(resolveRepos([], [], DEFAULT_REPOS)).toEqual(DEFAULT_REPOS);
  });
});

describe('labelsFor', () => {
  it('uses short names unless they collide', () => {
    expect(labelsFor(['me/app', 'me/lib'])).toEqual(['app', 'lib']);
    expect(labelsFor(['me/app', 'you/app'])).toEqual(['me/app', 'you/app']);
  });
});
