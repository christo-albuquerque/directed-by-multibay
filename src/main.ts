import { FactoryState } from './sim/factory';
import { Bay } from './scene/Bay';
import { Launchpad } from './scene/Launchpad';
import { Lighting } from './scene/Lighting';
import { addStars, buildPlanet } from './scene/Planet';
import { ProductView } from './scene/ProductView';
import { World } from './scene/World';
import { DemoPanel } from './ui/DemoPanel';

const container = document.getElementById('app') as HTMLElement;
const world = new World(container);
const state = new FactoryState();

buildPlanet(world.scene);
addStars(world.camera);
const lighting = new Lighting(world.scene);
const bay = new Bay('BAY 1 · multibay-testlot');
const launchpad = new Launchpad();
const products = new ProductView();
world.scene.add(bay.group, launchpad.group, products.group);

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
    [5000, () => state.spawn({ failAt: 'build', label: 'pr-12' })],
    [12000, () => state.spawn({ label: 'main#2' })],
    [16000, () => state.spawn({ failAt: 'test', label: 'pr-13' })],
    [20000, () => state.spawn({ label: 'main#3' })],
    [22000, () => state.cancelAll()],
  ];
  cycleTimers = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
}

const panel = new DemoPanel(document.body, [
  { label: '▶ Success run', run: () => state.spawn() },
  { label: '✖ Fail @ lint', run: () => state.spawn({ failAt: 'lint' }) },
  { label: '✖ Fail @ build', run: () => state.spawn({ failAt: 'build' }) },
  { label: '✖ Fail @ test', run: () => state.spawn({ failAt: 'test' }) },
  { label: '⏹ Cancel all', run: () => state.cancelAll() },
  { label: '⚡ Speed ×2', run: () => (state.speed = state.speed > 0.4 ? 0.35 : 0.8) },
  { label: '🎬 Full cycle', run: fullCycle, wide: true },
]);

world.onUpdate((dt, elapsed) => {
  state.update(dt);
  const mode = state.mode;
  lighting.update(dt, mode);
  bay.update(dt, elapsed, mode, state);
  launchpad.update(dt, elapsed, state.launchAge);
  products.update(state, elapsed);
  panel.update(mode, state.stats);
});

world.start();
// Handy for poking at the sim from the console during development.
(window as unknown as { __factory: FactoryState }).__factory = state;
