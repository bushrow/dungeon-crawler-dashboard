/**
 * Atlas: who is connected to whom, at the floor you have read to.
 *
 * Coordinates are frozen at compile time over the whole corpus, so a node
 * appears where it was always going to be and nothing else moves when the
 * embargo bar does. Nodes past the horizon are absent from the DOM rather than
 * hidden with CSS.
 */
import '../../shell/src/styles.css';
import './atlas.css';
import { mountShell, floorColor } from '@dcc/shell';
import type { Edge, EdgeType, Horizon } from '@dcc/core';

const SVG = 'http://www.w3.org/2000/svg';

/** Relationship type is carried by weight and dash, never by hue. */
const EDGE_STYLE: Record<EdgeType, { width: number; dash: string; label: string }> = {
  party: { width: 4, dash: '', label: 'Party' },
  allied: { width: 2, dash: '', label: 'Allied' },
  sponsor: { width: 2, dash: '7 4', label: 'Sponsor' },
  subordinate: { width: 2, dash: '2 4', label: 'Subordinate' },
  kin: { width: 2, dash: '1 4', label: 'Kin' },
  hostile: { width: 2.5, dash: '9 3 1 3', label: 'Hostile' },
};

const graph = document.querySelector<SVGSVGElement>('.atlas__graph svg')!;
const edgeLayer = graph.querySelector<SVGGElement>('[data-layer="edges"]')!;
const nodeLayer = graph.querySelector<SVGGElement>('[data-layer="nodes"]')!;
const countLabel = document.querySelector<HTMLElement>('[data-count]')!;
const card = document.querySelector<HTMLElement>('[data-card]')!;

let selected: string | null = null;
let previouslyVisible = new Set<string>();

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function edgeKey(e: Edge): string {
  return `${e.src}|${e.dst}|${e.type}`;
}

function renderLegend(): void {
  const list = document.querySelector<HTMLUListElement>('[data-legend]')!;
  list.innerHTML = Object.entries(EDGE_STYLE)
    .map(
      ([, style]) =>
        `<li><svg viewBox="0 0 26 8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4"
           stroke="#9c9c94" stroke-width="${style.width}"
           stroke-dasharray="${style.dash}" /></svg>${style.label}</li>`,
    )
    .join('');
}

function renderGraph(h: Horizon): void {
  const nodes = h.nodes();
  const edges = h.edges();
  const positions = new Map(nodes.map((n) => [n.entity.id, n.position]));

  const unplaced = h.unplacedCount();
  countLabel.textContent =
    `${nodes.length} nodes · ${edges.length} edges` +
    (unplaced ? ` · ${unplaced} with no recorded relationship, not drawn` : '');

  // The layout box grows with the corpus, so the viewBox follows it. Padding
  // leaves room for the labels, which sit under the nodes and run wide.
  const { width, height } = h.layoutExtent;
  const padX = Math.round(width * 0.09);
  graph.setAttribute('viewBox', `${-padX} -60 ${width + padX * 2} ${height + 140}`);

  edgeLayer.replaceChildren();
  for (const edge of edges) {
    const a = positions.get(edge.src);
    const b = positions.get(edge.dst);
    if (!a || !b) continue;
    const style = EDGE_STYLE[edge.type];
    const line = el('line', {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      'stroke-width': style.width,
      'stroke-dasharray': style.dash,
      class: 'edge',
    });
    line.dataset.type = edge.type;
    line.dataset.key = edgeKey(edge);
    line.dataset.src = edge.src;
    line.dataset.dst = edge.dst;
    edgeLayer.append(line);
  }

  nodeLayer.replaceChildren();
  for (const { entity, position } of nodes) {
    const group = el('g', { class: 'node', tabindex: 0, role: 'button' });
    group.dataset.id = entity.id;
    // Only nodes that were not on screen a moment ago animate in.
    // Animation fill-mode outranks a plain opacity rule, so the flag has to
    // come off once the fade is done or the node can never be dimmed again.
    const isNew = !previouslyVisible.has(entity.id);
    group.dataset.new = String(isNew);
    if (isNew) {
      const settle = () => {
        group.dataset.new = 'false';
      };
      group.addEventListener('animationend', settle, { once: true });
      // animationend does not fire while a tab is backgrounded, and timers do.
      setTimeout(settle, 600);
    }
    group.setAttribute('aria-label', `${entity.canonicalName}, ${entity.type}`);

    const fill = floorColor(entity.introducedFloor);
    // Shape carries type, colour carries the floor you met them on.
    const mark =
      entity.type === 'faction'
        ? el('rect', {
            x: position.x - 15,
            y: position.y - 15,
            width: 30,
            height: 30,
            fill,
            class: 'node__mark',
          })
        : el('circle', { cx: position.x, cy: position.y, r: 17, fill, class: 'node__mark' });

    const label = el('text', { x: position.x, y: position.y + 42, class: 'node__label' });
    label.textContent =
      entity.canonicalName.length > 20
        ? `${entity.canonicalName.slice(0, 19)}\u2026`
        : entity.canonicalName;

    group.append(mark, label);
    group.addEventListener('click', () => select(h, entity.id));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(h, entity.id);
      }
    });
    nodeLayer.append(group);
  }

  previouslyVisible = new Set(nodes.map((n) => n.entity.id));
}

function applySelection(h: Horizon): void {
  const incident = new Set<string>();
  const neighbours = new Set<string>();
  if (selected) {
    for (const edge of h.edgesFor(selected)) {
      incident.add(edgeKey(edge));
      neighbours.add(edge.src);
      neighbours.add(edge.dst);
    }
  }

  for (const node of nodeLayer.querySelectorAll<SVGGElement>('.node')) {
    const id = node.dataset.id!;
    node.dataset.selected = String(id === selected);
    node.dataset.dimmed = String(selected !== null && !neighbours.has(id));
  }
  for (const edge of edgeLayer.querySelectorAll<SVGLineElement>('.edge')) {
    const active = selected !== null && incident.has(edge.dataset.key!);
    edge.dataset.active = String(active);
    edge.dataset.dimmed = String(selected !== null && !active);
  }
}

function renderCard(h: Horizon): void {
  if (!selected) {
    card.innerHTML = `<p class="card__empty">Pick a node to open its record. Everything in it is
      scoped to your floor.</p>`;
    return;
  }

  const entity = h.entity(selected)!;
  const aliases = h.aliasesFor(selected);
  const facts = h.factsFor(selected);
  const status = h.statusFor(selected);
  const edges = h.edgesFor(selected);

  const section = (title: string, body: string) =>
    body ? `<div class="card__section"><h4>${title}</h4>${body}</div>` : '';

  const relationships = edges
    .map((e) => {
      const otherId = e.src === selected ? e.dst : e.src;
      const other = h.entity(otherId);
      return `<li><span class="card__pred">${EDGE_STYLE[e.type].label.toLowerCase()}</span><br />${
        other?.canonicalName ?? otherId
      }</li>`;
    })
    .join('');

  card.innerHTML = `
    <div class="card__body">
      <h3 class="card__name">${entity.canonicalName}</h3>
      <div class="card__type">
        <span class="card__swatch" style="background:${floorColor(entity.introducedFloor)}"></span>
        <span class="eyebrow">${entity.type} &middot; ${
          entity.introducedFloor === 0 ? 'surface' : `floor ${entity.introducedFloor}`
        }</span>
      </div>
      ${entity.description ? `<p class="card__desc">${entity.description}</p>` : ''}
      ${
        entity.systemQuote
          ? `<figure class="sysquote">
               <blockquote>${entity.systemQuote}</blockquote>
               <figcaption>The System</figcaption>
             </figure>`
          : ''
      }
      ${
        // Rendered only when a status row is actually visible. No row means
        // nothing is drawn at all, because an "unknown" badge would say that
        // something about this character is being withheld.
        status
          ? section('Status', `<p style="margin:0"><span class="chip">${status.status}</span></p>`)
          : ''
      }
      ${
        aliases.length
          ? section(
              'Also known as',
              `<ul class="card__list">${aliases
                .map((a) => `<li>${a.alias}</li>`)
                .join('')}</ul>`,
            )
          : ''
      }
      ${relationships ? section('Relationships', `<ul class="card__list">${relationships}</ul>`) : ''}
      ${
        facts.length
          ? section(
              'On the record',
              `<ul class="card__list">${facts
                .map(
                  (f) => `<li class="card__fact">
                    <span class="card__pred">${f.predicate.replace(/_/g, ' ')}</span><br />${
                      // An object that names a visible entity reads as its name.
                      // The validator guarantees it cannot name an invisible one.
                      h.entity(f.object)?.canonicalName ?? f.object
                    }
                    <span class="chip" data-confidence="${f.confidence}">${f.confidence}</span>
                    ${f.gloss ? `<div class="card__gloss">${f.gloss}</div>` : ''}
                  </li>`,
                )
                .join('')}</ul>`,
            )
          : ''
      }
    </div>`;
}

function select(h: Horizon, id: string): void {
  selected = selected === id ? null : id;
  applySelection(h);
  renderCard(h);
}

renderLegend();

mountShell({
  route: 'atlas',
  heading: 'Atlas: relationships at your floor',
  render(h) {
    // A node that is no longer visible cannot stay selected.
    if (selected && !h.entity(selected)) selected = null;
    renderGraph(h);
    applySelection(h);
    renderCard(h);
  },
});
