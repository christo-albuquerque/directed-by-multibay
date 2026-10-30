import { describe, expect, it } from 'vitest';
import { MAX_LINES, ZONES } from './globe/zones';
import { LOOKS } from './world/crowd';
import { STATIONS } from './world/line/layout';

/** Every module baseline file (docs/modules/NN-name.md plus the README index), as raw text. */
const docs = import.meta.glob('../docs/modules/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const byName = new Map(Object.entries(docs).map(([path, text]) => [path.split('/').pop()!, text]));
const moduleFiles = [...byName.keys()].filter((f) => /^\d\d-.*\.md$/.test(f));

describe('module baseline files', () => {
  it('has a file for every module in the index', () => {
    const index = byName.get('README.md') ?? '';
    const linked = [...index.matchAll(/\]\((\d\d-[^)]+\.md)\)/g)].map((m) => m[1]);
    expect(linked.length).toBeGreaterThanOrEqual(20);
    for (const f of linked) expect(moduleFiles, `missing ${f}`).toContain(f);
  });

  it('every module file keeps its required sections', () => {
    for (const f of moduleFiles) {
      const text = byName.get(f) ?? '';
      expect(text, `${f} purpose`).toContain('## Purpose');
      expect(text, `${f} invariants`).toContain('## Invariants');
      expect(text, `${f} requirements`).toContain('## Requirements');
    }
  });
});

describe('invariants named in the module files still hold in code', () => {
  it('world (01): six lines and one of each district', () => {
    expect(MAX_LINES).toBe(6);
    for (const kind of ['city', 'port', 'farm', 'mine', 'power'] as const) expect(ZONES.filter((z) => z.kind === kind)).toHaveLength(1);
    expect(ZONES.filter((z) => z.kind === 'line')).toHaveLength(6);
  });

  it('factory stations (07-11): depot, lint, build, test, dispatch with the documented hidden/open split', () => {
    expect(STATIONS.map((s) => s.stage)).toEqual(['depot', 'lint', 'build', 'test', 'dispatch']);
    expect(STATIONS.map((s) => s.hidden)).toEqual([true, false, true, false, true]);
    expect(STATIONS.map((s) => s.label)).toEqual(['DEPENDENCIES', 'LINT', 'BUILD', 'TESTING GROUNDS', 'DISPATCH']);
  });

  it('grains (02): every documented look exists, with outfits where documented', () => {
    for (const name of ['rice', 'corn', 'wheat', 'quinoa', 'millet', 'basmati', 'medic', 'hazmat', 'punk', 'neon']) expect(LOOKS, name).toHaveProperty(name);
    expect(LOOKS.rice.outfit).toBe('overalls');
    expect(LOOKS.corn.outfit).toBe('husk');
    expect(LOOKS.basmati.outfit).toBe('goggles');
    expect(LOOKS.hazmat.outfit).toBe('hazmat');
    expect(LOOKS.medic.outfit).toBe('cross');
  });
});
