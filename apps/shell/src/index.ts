/**
 * Chrome shared by both views: the rack, the embargo bar, and the horizon.
 *
 * The horizon lives in the query string so a floor is linkable, and is mirrored
 * to localStorage so it survives moving between the two routes.
 */
import { loadBundle, maxFloorOf, versionOf, horizonAt } from '@dcc/core';
import type { Bundle, Horizon } from '@dcc/core';

const STORE_KEY = 'dcc.floor';

export type Route = 'browse' | 'atlas' | 'ledger';

/** Colour means one thing everywhere: the floor a record was learned on. */
export function floorColor(floor: number): string {
  return `var(--f${Math.min(floor, 9)})`;
}

function readFloor(maxFloor: number): number {
  const fromUrl = new URLSearchParams(location.search).get('floor');
  const stored = localStorage.getItem(STORE_KEY);
  const raw = Number(fromUrl ?? stored ?? 0);
  return Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), maxFloor) : 0;
}

function writeFloor(floor: number): void {
  const url = new URL(location.href);
  url.searchParams.set('floor', String(floor));
  history.replaceState(null, '', url);
  localStorage.setItem(STORE_KEY, String(floor));
}

interface ShellOptions {
  route: Route;
  /** Called on mount and on every horizon change. */
  render: (horizon: Horizon) => void;
}

export interface Shell {
  bundle: Bundle;
  horizon: () => Horizon;
}

export function mountShell({ route, render }: ShellOptions): Shell {
  const bundle = loadBundle();
  const maxFloor = maxFloorOf(bundle);
  let floor = readFloor(maxFloor);

  const rack = document.createElement('header');
  rack.className = 'rack';
  rack.innerHTML = `
    <div class="rack__mark">
      <span class="rack__bars" aria-hidden="true">
        <i style="background:var(--f1)"></i>
        <i style="background:var(--f2)"></i>
        <i style="background:var(--f3)"></i>
      </span>
      Dungeon Crawler Carl
    </div>
    <nav class="rack__routes">
      <a class="rack__route" href="../browser/index.html" data-route="browse">Browse</a>
      <a class="rack__route" href="../atlas/index.html" data-route="atlas">Atlas</a>
      <a class="rack__route" href="../ledger/index.html" data-route="ledger">Ledger</a>
    </nav>
    <div class="rack__meta">
      <span>bundle v${versionOf(bundle)}</span>
      <span data-meta="scope">floors 0&ndash;${maxFloor} &middot; books 1&ndash;2</span>
    </div>`;

  for (const link of rack.querySelectorAll<HTMLAnchorElement>('.rack__route')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    // Carry the floor across the route change so the reader stays where they
    // are. Assigning href inside the handler would race the navigation.
    const base = link.getAttribute('href')!;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      location.href = `${base}?floor=${floor}`;
    });
  }

  const embargo = document.createElement('div');
  embargo.className = 'embargo';
  embargo.innerHTML = `
    <div class="embargo__label">
      <span>Embargo</span>
      <span class="note" style="color:#767b83">Everything past your floor stays dark</span>
    </div>
    <div class="embargo__track" role="group" aria-label="Reading floor"></div>
    <div class="embargo__readout" aria-live="polite"></div>`;

  const track = embargo.querySelector<HTMLDivElement>('.embargo__track')!;
  const readout = embargo.querySelector<HTMLDivElement>('.embargo__readout')!;

  const segments: HTMLButtonElement[] = [];
  for (let f = 0; f <= maxFloor; f += 1) {
    const seg = document.createElement('button');
    seg.className = 'embargo__seg';
    seg.type = 'button';
    seg.style.setProperty('--seg', floorColor(f));
    seg.innerHTML = `<span>${f === 0 ? 'Surface' : `Floor ${f}`}</span>`;
    seg.addEventListener('click', () => setFloor(f));
    seg.addEventListener('keydown', (event) => {
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (delta === 0) return;
      event.preventDefault();
      const next = Math.min(Math.max(floor + delta, 0), maxFloor);
      setFloor(next);
      segments[next]?.focus();
    });
    segments.push(seg);
    track.append(seg);
  }

  document.body.prepend(rack, embargo);

  function paint(): void {
    const h = horizonAt(bundle, floor);
    segments.forEach((seg, f) => {
      const open = f <= floor;
      seg.dataset.open = String(open);
      seg.dataset.current = String(f === floor);
      seg.setAttribute('aria-pressed', String(f === floor));
      seg.setAttribute(
        'aria-label',
        `${f === 0 ? 'Surface' : `Floor ${f}`}, ${open ? 'open' : 'embargoed'}`,
      );
    });

    const c = h.coverage();
    readout.innerHTML =
      `Reading at <b>${floor === 0 ? 'the surface' : `floor ${floor}`}</b> &middot; ` +
      `${c.entitiesVisible} records open &middot; ${c.edgesVisible} relationships &middot; ` +
      `${c.mechanicsVisible} priced`;

    render(h);
  }

  function setFloor(next: number): void {
    if (next === floor) return;
    floor = next;
    writeFloor(floor);
    paint();
  }

  writeFloor(floor);
  paint();

  return { bundle, horizon: () => horizonAt(bundle, floor) };
}
