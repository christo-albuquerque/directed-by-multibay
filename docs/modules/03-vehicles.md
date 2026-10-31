# 03 · Vehicles

## Purpose
Everything that carries things or people: trucks, drones, forklifts, flying cars, rockets, mine carts and utility machines. Vehicles move on closed loops or between fixed docks; none appears or vanishes in view.

## Requirements
- Trucks collect resources (farm/mine → factory) and finished boxes (factory → rocket port) [v2].
- Rockets for `main`/tag releases, courier drones for PR/preview builds [Brief §3].
- A truck is already waiting when tests finish (pre-staged handoff); a rocket leaves out of view while another returns from a delivery and takes its place [v2].
- Flying cars/drones and background traffic so the world never looks looped [Brief §3, v2].
- Forklifts and other utility vehicles are wanted [user v2.2].
- Vehicles must not pass through structures or other routes (see 06).

## Current implementation
- Models: `src/world/vehicles.ts`: `planter`, `combine`, `dumpTruck`, `oreHeap`, `mineCart`, `hoverCar`, `courierDrone`, `deliveryTruck`. Moving parts use `Dyn` (`dyn.ts`); many identical ones use `InstancePool` (`pools.ts`).
- **Delivery trucks** (`port/Port.ts`): two per line. Slot 0 is the express truck and waits at the dock for a real run (`Line.waitingAtDock`), loads (`collectFromDock`), drives its road (registered corridor), unloads at the pad when a rocket is docked, then returns. Slot 1 shuttles ordinary cargo.
- **Rockets and drones** (`port/Port.ts`): 8 pads (6 repo + 2 freight); each pad has 2 rockets and 2 drones in a craft state machine (docked, countdown, ascend, away, arrive, hover, landing). Rockets launch for `main`; drones carry `pull_request` runs.
- **Farm vehicles:** planters and combines work rows (04). **Mine:** dump trucks, excavator, rail carts (05).
- **Sky traffic** (`city/Skyways.ts`): hover cars on neon lanes at heights 24 to 48, package drones on loops at 22 to 31, satellites on high orbits. Lanes are above every building.
- **Forklifts** (line/props.ts, Line.updateForklift): one per line works the dock apron aisle between the two parked delivery trucks, loading crates into their beds (see 11).
- **Supply trucks** (`world/supply.ts`): one crop or ore truck per line, hidden while loading in its shed, then driving a registered road to the depot bay, unloaded by two porters with trolleys, then back in the opposite lane.

- **Lights:** trucks (port, supply, mine) and hover cars have head and tail lights (`LitPool` in `pools.ts`: an unlit companion pool drawn at the same places, brightness 0.1 by day to 0.8 at night, deliberately subtle so it does not bloom).
- **Follow:** tap a truck, rocket, drone or hover car to make the camera follow it (`PlanetWorld.pickVehicle`, `followables()` on Port, Supply and Skyways); it stops when you drag, zoom, tap the chip, or the target leaves the world.

## Invariants
- One supply truck per line plus two delivery trucks per line; express truck waits for a real run; release only counts when the rocket lifts off.
- One forklift per line on the dock apron, between the two truck bays; the two delivery trucks park in separate bays, nose out.
- Eight pads, two rockets and two drones per pad.
- Closed loops; no spawn/despawn in view.
- Sky lanes stay above the tallest building in the area.

## Extension points
- New vehicle: model in `vehicles.ts`, pool it, give it a registered route (06), put its depot/hangar in its district's module.

## Known gaps
- Forklifts exist only on each line's dock apron; none at the depot or port yet.
- Freight pads and power-field utility vehicles are minimal.
- Delivery roads from docks to the avenue share the avenue lane.
