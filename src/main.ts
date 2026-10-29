import * as THREE from 'three';
import { createGrain, type GrainVariant } from './agents/grains';
import { getToken, labelsFor, loadConfig, loadDefaultRepos, loadSavedRepos, resolveRepos, saveRepos, setToken } from './config';
import { GitHubPoller, type PollerMeta } from './data/github';
import { FactoryWorld } from './scene/FactoryWorld';
import { Lighting } from './scene/Lighting';
import { Particles } from './scene/Particles';
import { addStars } from './scene/Planet';
import { World } from './scene/World';
import type { FactoryState } from './sim/factory';
import type { NormalizedRun } from './sim/runs';
import { DemoPanel } from './ui/DemoPanel';
import { LivePanel } from './ui/LivePanel';
import { ProductPanel } from './ui/ProductPanel';
import { motion } from './ui/motion';
import { sfx } from './ui/sfx';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  if (!webglAvailable()) {
    const fallback = document.getElementById('fallback');
    if (fallback) fallback.style.display = 'flex';
    return;
  }
  const config = loadConfig();
  const defaults = await loadDefaultRepos(import.meta.env.BASE_URL);
  let repos = resolveRepos(config.urlRepos, loadSavedRepos(), defaults);

  const container = document.getElementById('app') as HTMLElement;
  const world = new World(container);
  sfx.init();
  addStars(world.camera);
  const lighting = new Lighting(world.scene);
  const fx = new Particles();
  world.scene.add(fx.points);
  const factory = new FactoryWorld(world, lighting, fx);

  // --- live data -----------------------------------------------------------
  let latestRuns: NormalizedRun[] = [];
  let pollerMeta: PollerMeta | null = null;
  let live = config.live;

  /** Hands each repo's runs to its own bay. */
  const syncAll = (runs: NormalizedRun[]): void => {
    const now = Date.now();
    for (const u of factory.units) u.state.syncRuns(runs.filter((r) => r.repo === u.repo), now);
  };

  const poller = new GitHubPoller({
    repos: () => repos,
    token: getToken,
    isBusy: () => factory.mode !== 'idle',
    onRuns: (runs) => {
      latestRuns = runs;
      syncAll(runs);
    },
    onMeta: (m) => (pollerMeta = m),
  });

  // --- selection -----------------------------------------------------------
  let selectedKey: string | null = null;
  const select = (key: string | null): void => {
    selectedKey = key;
    factory.setSelected(key);
    // On phones the details panel replaces the demo panel while something is selected.
    document.body.classList.toggle('has-selection', key !== null);
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedKey && !(e.target instanceof HTMLInputElement)) select(null);
  });

  const livePanel = new LivePanel(
    document.body,
    repos,
    {
      onSelect: (key) => select(selectedKey === key ? null : key),
      onToggle: () => {
        live = !live;
        if (live) poller.start();
        else poller.stop();
        livePanel.setPaused(!live);
        return live;
      },
      onToken: () => {
        const entered = window.prompt('Optional: paste a read-only GitHub token to raise the API limit from 60 to 5000 requests/hour.\nIt stays in this browser only. Leave empty to remove a saved token.', '');
        if (entered === null) return;
        setToken(entered.trim() || null);
        poller.refresh();
      },
      onRepos: (list) => applyRepos(list, true),
    },
    live,
  );
  const productPanel = new ProductPanel(document.body, () => select(null));

  // --- demo panel ----------------------------------------------------------
  const target = (): FactoryState => (factory.units[panel.target] ?? factory.units[0]).state;
  let cycleTimers: number[] = [];
  const stopCycle = (): void => {
    cycleTimers.forEach(clearTimeout);
    cycleTimers = [];
  };
  const fullCycle = (): void => {
    stopCycle();
    const st = target();
    const steps: [number, () => void][] = [
      [0, () => st.spawn({ label: 'main#1' })],
      [6000, () => st.spawn({ failAt: 'build', label: 'pr-12' })],
      [12000, () => st.spawn({ failAt: 'test', label: 'pr-13' })],
      [18000, () => st.spawn({ failAt: 'lint', label: 'pr-14' })],
      [26000, () => st.spawn({ label: 'main#2' })],
      [34000, () => st.spawn({ label: 'pr-15' })],
      [36500, () => st.cancelAll()],
    ];
    cycleTimers = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
  };

  const panel = new DemoPanel(document.body, [
    { label: '▶ Success run', run: () => void target().spawn() },
    { label: '✖ Fail @ lint', run: () => void target().spawn({ failAt: 'lint' }) },
    { label: '✖ Fail @ build', run: () => void target().spawn({ failAt: 'build' }) },
    { label: '✖ Fail @ test', run: () => void target().spawn({ failAt: 'test' }) },
    { label: '🚁 PR drone run', run: () => void target().spawn({ pr: true, label: 'pr-drone' }) },
    { label: '⏹ Cancel all', run: () => target().cancelAll() },
    { label: '⚡ Speed ×2', run: () => void (target().speed = target().speed > 0.4 ? 0.35 : 0.8) },
    { label: '☔ Storm: off', run: () => ((factory.forceStorm = !factory.forceStorm), factory.forceStorm ? '☔ Storm: on' : '☔ Storm: off') },
    { label: sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on', run: () => (sfx.setMuted(!sfx.muted), sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on') },
    { label: motion.reduced ? '🐢 Motion: reduced' : '🎬 Motion: full', run: () => (motion.set(!motion.reduced), world.controls.enableDamping = !motion.reduced, motion.reduced ? '🐢 Motion: reduced' : '🎬 Motion: full') },
    { label: '🎬 Full cycle', run: fullCycle, wide: true },
  ]);

  // --- (re)building the factory for a list of repos --------------------------
  const debug = window as unknown as { __factory: FactoryState; __fw: FactoryWorld; __world: World; __poller: GitHubPoller };
  function applyRepos(list: string[], persist: boolean): void {
    repos = list;
    const labels = labelsFor(list);
    stopCycle();
    factory.rebuild(list.map((r, i) => ({ repo: r, label: labels[i] })));
    panel.setTargets(labels.map((l, i) => `BAY ${i + 1} · ${l}`));
    livePanel.setRepos(list);
    select(null);
    if (persist) {
      saveRepos(list);
      // The URL no longer decides the list once the user has chosen one.
      const url = new URL(location.href);
      if (url.searchParams.has('repos')) {
        url.searchParams.delete('repos');
        history.replaceState(null, '', url);
      }
    }
    debug.__factory = factory.units[0].state;
    syncAll(latestRuns);
    if (persist && live) poller.refresh();
  }
  debug.__fw = factory;
  debug.__world = world;
  debug.__poller = poller;
  applyRepos(repos, false);

  // --- input ---------------------------------------------------------------
  // Clicking a product selects it, a worker pokes them. A press that moves is an orbit drag, not a click.
  let down: { x: number; y: number; t: number } | null = null;
  const canvas = world.renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 400) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const key = factory.pickProduct(ndc, world.camera);
    if (key) return select(selectedKey === key ? null : key);
    const worker = factory.pickWorker(ndc, world.camera);
    if (worker) worker.poke();
    else select(null);
  });

  // `?lineup` parades every grain variant in front of the first bay (handy for checking the models).
  if (new URLSearchParams(location.search).has('lineup')) {
    const variants: GrainVariant[] = ['rice', 'corn', 'wheat', 'quinoa', 'millet', 'basmati', 'medic', 'hazmat'];
    variants.forEach((variant, i) => {
      const g = createGrain(variant);
      g.root.position.set(-6 + i * 1.8, 0.12, 6);
      g.root.rotation.y = Math.PI / 4;
      world.scene.add(g.root);
    });
  }

  // --- screen-reader summary -------------------------------------------------
  const srStatus = document.getElementById('sr-status');
  let lastSr = '';
  const announce = (): void => {
    if (!srStatus) return;
    const busy = factory.units.filter((u) => u.state.mode !== 'idle').length;
    const s = factory.stats;
    const text = `Factory ${factory.mode}. ${busy} of ${factory.units.length} bays busy. Launched ${s.succeeded}, failed ${s.failed}, cancelled ${s.cancelled}.`;
    if (text !== lastSr) {
      lastSr = text;
      srStatus.textContent = text;
    }
  };

  // --- main loop -----------------------------------------------------------
  let lastUiTick = 0;
  world.onUpdate((dt, elapsed) => {
    factory.update(dt, elapsed);
    fx.update(dt, world.camera, world.renderer);
    panel.update(factory.mode, factory.stats);

    if (elapsed - lastUiTick > 0.25) {
      lastUiTick = elapsed;
      announce();
      const now = Date.now();
      livePanel.update(pollerMeta, latestRuns, selectedKey, now);
      const found = factory.findProduct(selectedKey);
      const run = found?.product.run ?? latestRuns.find((r) => r.key === selectedKey) ?? null;
      productPanel.update(selectedKey, found?.product ?? null, run, now);
    }
  });

  world.start();
  if (live) poller.start();
}

void boot();
