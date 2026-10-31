import * as THREE from 'three';
import { auditCorridors } from './world/corridors';
import { getToken, labelsFor, loadConfig, loadDefaultRepos, loadSavedRepos, resolveRepos, saveRepos, setToken } from './config';
import { GitHubPoller, type PollerMeta } from './data/github';
import { GlobeWorld } from './globe/GlobeWorld';
import { lonLatDir, R } from './globe/surface';
import type { FactoryMode, FactoryStats, Product } from './sim/factory';
import type { JobInfo, NormalizedRun } from './sim/runs';
import { DemoPanel } from './ui/DemoPanel';
import { LivePanel } from './ui/LivePanel';
import { motion } from './ui/motion';
import { NavPanel } from './ui/NavPanel';
import { ProductPanel } from './ui/ProductPanel';
import { sfx } from './ui/sfx';
import { TimeDial } from './ui/TimeDial';
import { PlanetWorld } from './world/PlanetWorld';
import { WEATHER_MODES, type WeatherMode } from './world/weather';

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
  const world = new GlobeWorld(container);
  sfx.init();
  const planet = new PlanetWorld(world);

  // --- live data -----------------------------------------------------------
  let latestRuns: NormalizedRun[] = [];
  let pollerMeta: PollerMeta | null = null;
  let live = config.live;

  /** Hands each repo's runs to the build line it is assigned to. */
  const syncAll = (runs: NormalizedRun[]): void => {
    const now = Date.now();
    for (const l of planet.lines) if (l.repo) l.state.syncRuns(runs.filter((r) => r.repo === l.repo), now);
  };

  const busy = (): boolean => planet.lines.some((l) => l.state.mode !== 'idle');
  const poller = new GitHubPoller({
    repos: () => repos,
    token: getToken,
    isBusy: busy,
    onRuns: (runs) => {
      latestRuns = runs;
      syncAll(runs);
    },
    onMeta: (m) => (pollerMeta = m),
  });

  // --- selection -----------------------------------------------------------
  let selectedKey: string | null = null;
  const select = (key: string | null, fly = false): void => {
    selectedKey = key;
    planet.setSelected(key);
    document.body.classList.toggle('has-selection', key !== null);
    const found = planet.findProduct(key);
    const line = found?.line ?? (key ? planet.lines.find((l) => l.repo && key.startsWith(`${l.repo}#`)) : undefined);
    if (key && found) startFollow('box', () => planet.productPosition(key));
    else if (!key) world.controls.stopFollow();
    else if (fly && line) world.controls.flyTo({ dir: line.chart.center, dist: 78, tilt: 0.62, heading: 0 }, 1.8);
  };
  // A small chip shows while the camera follows something; it ends when the target leaves the world.
  const chip = document.createElement('button');
  chip.className = 'follow-chip';
  chip.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:6px 14px;border-radius:16px;border:1px solid #35e0ff;background:rgba(10,16,28,.85);color:#bff6ff;font:600 13px system-ui,sans-serif;cursor:pointer;display:none;z-index:20';
  document.body.appendChild(chip);
  chip.addEventListener('click', () => world.controls.stopFollow());
  world.controls.onFollowEnd = () => (chip.style.display = 'none');
  const startFollow = (what: string, fn: () => THREE.Vector3 | null): void => {
    world.controls.follow(fn, 42);
    chip.textContent = `🎥 Following the ${what} · tap to stop`;
    chip.style.display = 'block';
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedKey && !(e.target instanceof HTMLInputElement)) select(null);
  });

  const livePanel = new LivePanel(
    document.body,
    repos,
    {
      onSelect: (key) => select(selectedKey === key ? null : key, true),
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
  const target = () => planet.lines[Math.min(panel.target, planet.lines.length - 1)].state;
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
      [14000, () => st.spawn({ failAt: 'build', label: 'pr-12' })],
      [30000, () => st.spawn({ failAt: 'test', label: 'pr-13' })],
      [46000, () => st.spawn({ failAt: 'lint', label: 'pr-14' })],
      [64000, () => st.spawn({ label: 'main#2' })],
      [80000, () => st.spawn({ pr: true, label: 'pr-15' })],
    ];
    cycleTimers = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
  };

  const WEATHER_NAMES: Record<WeatherMode, string> = { dynamic: '🌦 Weather: Dynamic', clear: '☀ Weather: Clear', rain: '🌧 Weather: Rainy', snow: '❄ Weather: Snow', overcast: '☁ Weather: Overcast', off: '⛔ Weather: Off' };
  const weatherLabel = (): string => WEATHER_NAMES[planet.weather.mode];
  const job = (name: string, steps: { name: string; number: number; status: string; conclusion: string | null }[] = []): JobInfo => ({ id: Math.floor(Math.random() * 1e9), name, status: 'completed', conclusion: 'success', startedAt: 0, completedAt: 1, steps });
  /** Gives a demo product the job list a real run would carry, so matrix convoys and cache zips can be shown. */
  const withJobs = (p: Product, jobs: JobInfo[]): void => void ((p as unknown as { run: { jobs: JobInfo[] } }).run = { jobs });

  const panel = new DemoPanel(document.body, [
    { label: '▶ Success run', run: () => void target().spawn() },
    { label: '✖ Fail @ lint', run: () => void target().spawn({ failAt: 'lint' }) },
    { label: '✖ Fail @ build', run: () => void target().spawn({ failAt: 'build' }) },
    { label: '✖ Fail @ test', run: () => void target().spawn({ failAt: 'test' }) },
    { label: '🚁 PR drone run', run: () => void target().spawn({ pr: true, label: 'pr-drone' }) },
    { label: '⏹ Cancel all', run: () => target().cancelAll() },
    { label: '⚡ Speed ×2', run: () => void (target().speed = target().speed > 0.4 ? 0.35 : 0.8) },
    { label: sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on', run: () => (sfx.setMuted(!sfx.muted), sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on') },
    { label: motion.reduced ? '🐢 Motion: reduced' : '🎬 Motion: full', run: () => (motion.set(!motion.reduced), (world.controls.inertia = !motion.reduced), motion.reduced ? '🐢 Motion: reduced' : '🎬 Motion: full') },
    { label: '🧩 Matrix build', run: () => void withJobs(target().spawn({ label: 'matrix' }), [job('test (node 18)'), job('test (node 20)'), job('test (node 22)')]) },
    { label: '⚡ Cache hit run', run: () => void withJobs(target().spawn({ label: 'cache-hit' }), [job('build', [{ name: 'Restore cache', number: 1, status: 'completed', conclusion: 'success' }])]) },
    { label: weatherLabel(), run: () => (planet.weather.setMode(WEATHER_MODES[(WEATHER_MODES.indexOf(planet.weather.mode) + 1) % WEATHER_MODES.length]), weatherLabel()), wide: true },
    { label: '🎬 Full cycle', run: fullCycle, wide: true },
  ]);

  // --- assigning repos to lines --------------------------------------------------
  function applyRepos(list: string[], persist: boolean): void {
    repos = list;
    const labels = labelsFor(list);
    stopCycle();
    planet.lines.forEach((line, i) => {
      const repo = list[i] ?? null;
      if (line.repo !== repo) line.resetRuns();
      line.setLabel(repo ? labels[i] : line.zone.label, repo);
    });
    panel.setTargets(planet.lines.map((l, i) => `Line ${i + 1} · ${l.repo ? l.label : 'unassigned'}`));
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
    syncAll(latestRuns);
    if (persist && live) poller.refresh();
  }
  applyRepos(repos, false);

  // --- navigation ----------------------------------------------------------------
  const presets: Record<string, { dir: THREE.Vector3; dist: number; tilt: number }> = {
    all: { dir: lonLatDir(0, 18), dist: 430, tilt: 0 },
    factory: { dir: lonLatDir(-19, 12), dist: 105, tilt: 0.75 },
    city: { dir: lonLatDir(0, -8), dist: 120, tilt: 0.85 },
    port: { dir: lonLatDir(62, 26), dist: 140, tilt: 0.85 },
    farm: { dir: lonLatDir(-66, 8), dist: 150, tilt: 0.85 },
    mine: { dir: lonLatDir(66, -14), dist: 150, tilt: 0.85 },
  };
  new NavPanel(
    document.body,
    [
      { id: 'all', label: 'Planet', icon: '🌍 Planet' },
      { id: 'factory', label: 'Factory', icon: '🏭 Factory' },
      { id: 'city', label: 'Market', icon: '🍜 Market' },
      { id: 'port', label: 'Rocket port', icon: '🚀 Rocket port' },
      { id: 'farm', label: 'Farms', icon: '🌾 Farms' },
      { id: 'mine', label: 'Mines', icon: '⛏ Mines' },
    ],
    (id) => {
      const p = presets[id];
      if (p) world.controls.flyTo({ dir: p.dir, dist: p.dist, tilt: p.tilt, heading: 0 });
    },
  );

  // --- input: tap a run to inspect it ---------------------------------------------
  let down: { x: number; y: number; t: number } | null = null;
  const canvas = world.renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 400) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const key = planet.pick(ndc, world.camera);
    // A tap on a grain makes it jump, flip or wave (and squeak); a tap on a run opens its details.
    if (!key) {
      // Vehicles: tap a truck, rocket, drone or hover car to follow it.
      const vehicle = planet.pickVehicle(ndc, world.camera);
      if (vehicle) {
        startFollow('vehicle', vehicle);
        return;
      }
    }
    if (!key && planet.pokeGrain(ndc, world.camera)) return;
    select(key && key !== selectedKey ? key : null);
  });

  // --- screen-reader summary -------------------------------------------------
  const srStatus = document.getElementById('sr-status');
  let lastSr = '';
  const overall = (): { mode: FactoryMode; stats: FactoryStats } => {
    const modes = planet.lines.map((l) => l.state.mode);
    const stats = { succeeded: 0, failed: 0, cancelled: 0 };
    for (const l of planet.lines) {
      stats.succeeded += l.state.stats.succeeded;
      stats.failed += l.state.stats.failed;
      stats.cancelled += l.state.stats.cancelled;
    }
    const mode = (['failure', 'release', 'running'] as const).find((m) => modes.includes(m)) ?? 'idle';
    return { mode, stats };
  };

  // --- main loop -----------------------------------------------------------
  let lastUiTick = 0;
  const timeDial = new TimeDial(document.body, world);
  world.onUpdate((dt, elapsed) => {
    const act = planet.lines.reduce((m, l) => Math.max(m, l.state.activity), 0);
    planet.update(dt, elapsed, act);
    timeDial.update();
    const o = overall();
    const sel = planet.lines[Math.min(panel.target, planet.lines.length - 1)];
    panel.update(sel.state.mode, sel.state.stats);

    if (elapsed - lastUiTick > 0.25) {
      lastUiTick = elapsed;
      const now = Date.now();
      if (srStatus) {
        const text = `Planet ${o.mode}. Launched ${o.stats.succeeded}, failed ${o.stats.failed}, cancelled ${o.stats.cancelled}.`;
        if (text !== lastSr) {
          lastSr = text;
          srStatus.textContent = text;
        }
      }
      livePanel.update(pollerMeta, latestRuns, selectedKey, now);
      const found = planet.findProduct(selectedKey);
      const run = found?.product.run ?? latestRuns.find((r) => r.key === selectedKey) ?? null;
      productPanel.update(selectedKey, found?.product ?? null, run, now);
    }
  });

  const debug = window as unknown as { __world: GlobeWorld; __planet: PlanetWorld; __R: number; __poller: GitHubPoller };
  debug.__world = world;
  debug.__planet = planet;
  (window as unknown as { __audit: typeof auditCorridors }).__audit = auditCorridors;
  debug.__R = R;
  debug.__poller = poller;
  world.start();
  if (live) poller.start();
}

void boot();
