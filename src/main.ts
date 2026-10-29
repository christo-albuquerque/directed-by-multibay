import * as THREE from 'three';
import { Crowd } from './agents/Crowd';
import { createGrain, type GrainVariant } from './agents/grains';
import { FactoryState } from './sim/factory';
import { Alarm } from './scene/Alarm';
import { Bay } from './scene/Bay';
import { Courtyard } from './scene/Courtyard';
import { updateGlow } from './scene/glow';
import { Incidents } from './scene/Incidents';
import { Launchpad } from './scene/Launchpad';
import { Lighting } from './scene/Lighting';
import { addStars, buildPlanet } from './scene/Planet';
import { Particles } from './scene/Particles';
import { ProductView } from './scene/ProductView';
import { Weather } from './scene/Weather';
import { World } from './scene/World';
import { getToken, loadConfig, setToken } from './config';
import { GitHubPoller, type PollerMeta } from './data/github';
import type { NormalizedRun } from './sim/runs';
import { DemoPanel } from './ui/DemoPanel';
import { LivePanel } from './ui/LivePanel';
import { ProductPanel } from './ui/ProductPanel';
import { sfx } from './ui/sfx';

const container = document.getElementById('app') as HTMLElement;
const world = new World(container);
const state = new FactoryState();
sfx.init();

buildPlanet(world.scene);
addStars(world.camera);
const lighting = new Lighting(world.scene);
const bay = new Bay('BAY 1 · multibay-testlot');
const launchpad = new Launchpad();
const products = new ProductView();
const courtyard = new Courtyard();
const crowd = new Crowd(courtyard.seats);
const incidents = new Incidents();
const alarm = new Alarm();
const weather = new Weather();
const fx = new Particles();
world.scene.add(bay.group, launchpad.group, courtyard.group, products.group, crowd.group, incidents.group, alarm.group, weather.group, fx.points);

// Live data: real GitHub Actions runs become products on the belt.
const config = loadConfig();
let latestRuns: NormalizedRun[] = [];
let pollerMeta: PollerMeta | null = null;
let live = config.live;
const poller = new GitHubPoller({
  repos: () => config.repos,
  token: getToken,
  isBusy: () => state.mode !== 'idle',
  onRuns: (runs) => {
    latestRuns = runs;
    state.syncRuns(runs, Date.now());
  },
  onMeta: (m) => (pollerMeta = m),
});

// Selection: click a product (or a run in the live list) to see where it is and what it is.
let selectedKey: string | null = null;
const select = (key: string | null): void => {
  selectedKey = key;
  products.setSelected(key);
};
const livePanel = new LivePanel(
  document.body,
  config.repos,
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
  },
  live,
);
const productPanel = new ProductPanel(document.body, () => select(null));

// Clicking a product selects it, a worker pokes them. A press that moves is an orbit drag, not a click.
let down: { x: number; y: number; t: number } | null = null;
const canvas = world.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 400) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const key = products.pick(ndc, world.camera);
  if (key) return select(selectedKey === key ? null : key);
  const worker = crowd.pick(ndc, world.camera);
  if (worker) worker.poke();
  else select(null);
});

// `?lineup` parades every grain variant in front of the bay (handy for checking the models).
if (new URLSearchParams(location.search).has('lineup')) {
  const variants: GrainVariant[] = ['rice', 'corn', 'wheat', 'quinoa', 'millet', 'basmati', 'medic', 'hazmat'];
  variants.forEach((variant, i) => {
    const g = createGrain(variant);
    g.root.position.set(-6 + i * 1.8, 0.12, 6);
    g.root.rotation.y = Math.PI / 4;
    world.scene.add(g.root);
  });
}

// Demo scripting: timers for the auto "full cycle" so a button press can be cancelled by the next one.
let cycleTimers: number[] = [];
function stopCycle(): void {
  cycleTimers.forEach(clearTimeout);
  cycleTimers = [];
}
function fullCycle(): void {
  stopCycle();
  const steps: [number, () => void][] = [
    [0, () => state.spawn({ label: 'main#1' })],
    [6000, () => state.spawn({ failAt: 'build', label: 'pr-12' })],
    [12000, () => state.spawn({ failAt: 'test', label: 'pr-13' })],
    [18000, () => state.spawn({ failAt: 'lint', label: 'pr-14' })],
    [26000, () => state.spawn({ label: 'main#2' })],
    [34000, () => state.spawn({ label: 'pr-15' })],
    [36500, () => state.cancelAll()],
  ];
  cycleTimers = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
}

let forceStorm = false;
const panel = new DemoPanel(document.body, [
  { label: '▶ Success run', run: () => state.spawn() },
  { label: '✖ Fail @ lint', run: () => state.spawn({ failAt: 'lint' }) },
  { label: '✖ Fail @ build', run: () => state.spawn({ failAt: 'build' }) },
  { label: '✖ Fail @ test', run: () => state.spawn({ failAt: 'test' }) },
  { label: '⏹ Cancel all', run: () => state.cancelAll() },
  { label: '⚡ Speed ×2', run: () => (state.speed = state.speed > 0.4 ? 0.35 : 0.8) },
  { label: forceStorm ? '☔ Storm: on' : '☔ Storm: off', run: () => ((forceStorm = !forceStorm), forceStorm ? '☔ Storm: on' : '☔ Storm: off') },
  { label: sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on', run: () => (sfx.setMuted(!sfx.muted), sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on') },
  { label: '🎬 Full cycle', run: fullCycle, wide: true },
]);

world.onUpdate((dt, elapsed) => {
  state.update(dt);
  const mode = state.mode;
  const storm = forceStorm || state.consecutiveFailures >= 3;
  weather.update(dt, storm);
  lighting.update(dt, mode, weather.amount);
  updateGlow(lighting.night);
  bay.update(dt, elapsed, mode, state, fx, lighting.night);
  launchpad.update(dt, elapsed, state.launchAge, fx);
  courtyard.update(dt, mode === 'idle', fx);
  incidents.update(dt, elapsed, state, fx);
  crowd.update(dt, elapsed, mode, { fx, incident: incidents.incident, activity: state.activity });
  alarm.update(dt, elapsed, crowd.alarmLeft > 0 || mode === 'failure', crowd.alarmLeft > 0);
  products.update(state, elapsed, fx);
  fx.update(dt, world.camera, world.renderer);
  panel.update(mode, state.stats);

  const now = Date.now();
  if (elapsed - lastUiTick > 0.25) {
    lastUiTick = elapsed;
    livePanel.update(pollerMeta, latestRuns, selectedKey, now);
    const product = selectedKey ? (state.products.find((p) => p.key === selectedKey) ?? null) : null;
    const run = product?.run ?? latestRuns.find((r) => r.key === selectedKey) ?? null;
    productPanel.update(selectedKey, product, run, now);
  }
});
let lastUiTick = 0;

world.start();
if (live) poller.start();
// Handy for poking at the scene from the console during development.
const debug = window as unknown as { __factory: FactoryState; __world: World; __crowd: Crowd; __poller: GitHubPoller };
debug.__factory = state;
debug.__poller = poller;
debug.__world = world;
debug.__crowd = crowd;
