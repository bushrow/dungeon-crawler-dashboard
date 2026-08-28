/**
 * Ledger: what every class and item costs, what it does, and how much of that
 * is actually known.
 *
 * Coverage sits beside the chart rather than under it. Showing what could not
 * be measured next to what could is the difference between a chart and a
 * finding, and in this corpus the gap is large.
 */
import '../../shell/src/styles.css';
import './ledger.css';
import { mountShell, floorColor } from '@dcc/shell';
import type { Confidence, EntityType, Horizon, PricedEntity } from '@dcc/core';

const SVG = 'http://www.w3.org/2000/svg';

type SortKey = 'name' | 'type' | 'costType' | 'effectCategory' | 'effectScale' | 'confidence';

interface Column {
  key: SortKey | null;
  label: string;
  className?: string;
  cell: (row: PricedEntity) => string;
}

const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Name',
    className: 'name',
    cell: (r) =>
      `<span class="table__floor" style="background:${floorColor(r.introducedFloor)}"
        title="First seen ${r.introducedFloor === 0 ? 'on the surface' : `on floor ${r.introducedFloor}`}"></span>${r.name}`,
  },
  { key: 'type', label: 'Kind', cell: (r) => r.type },
  { key: 'costType', label: 'Cost', cell: (r) => (r.costType === 'none' ? '&mdash;' : r.costType) },
  {
    key: null,
    label: 'Amount',
    className: 'num',
    // Free text, and usually not known. Saying so beats an invented number.
    cell: (r) => r.costValue ?? '&mdash;',
  },
  { key: 'effectCategory', label: 'Effect', cell: (r) => r.effectCategory },
  { key: 'effectScale', label: 'Scale', className: 'num', cell: (r) => String(r.effectScale) },
  { key: null, label: 'Duration', cell: (r) => r.duration ?? '&mdash;' },
  { key: null, label: 'Restrictions', className: 'wrap', cell: (r) => r.restrictions ?? '&mdash;' },
  {
    key: 'confidence',
    label: 'Confidence',
    cell: (r) => `<span class="chip" data-confidence="${r.confidence}">${r.confidence}</span>`,
  },
  { key: null, label: 'Source', className: 'num', cell: (r) => r.source },
];

const CONFIDENCE_ORDER: Confidence[] = ['certain', 'probable', 'inferred'];
const KINDS: EntityType[] = ['class', 'race', 'skill', 'item'];

let selectedId: string | null = null;
let sortKey: SortKey = 'effectCategory';
let sortAsc = true;
let includeInferred = true;
const kinds = new Set<EntityType>(KINDS);

const facets = document.querySelector<HTMLElement>('[data-facets]')!;
const facetCount = document.querySelector<HTMLElement>('[data-facet-count]')!;
const rowCount = document.querySelector<HTMLElement>('[data-row-count]')!;
const table = document.querySelector<HTMLTableElement>('[data-table]')!;
const coverageBox = document.querySelector<HTMLElement>('[data-coverage]')!;
const filterBox = document.querySelector<HTMLElement>('[data-filters]')!;
const recordBox = document.querySelector<HTMLElement>('[data-record]')!;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function visibleRows(h: Horizon): PricedEntity[] {
  return h
    .mechanics()
    .filter((m) => kinds.has(m.type))
    .filter((m) => includeInferred || m.confidence !== 'inferred');
}

function sorted(rows: PricedEntity[]): PricedEntity[] {
  const direction = sortAsc ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'effectScale') return (a.effectScale - b.effectScale) * direction;
    if (sortKey === 'confidence') {
      return (
        (CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence)) * direction
      );
    }
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * direction;
  });
}

/**
 * One small multiple per effect category.
 *
 * Categories come from the visible rows, and the scale axis is fixed at 1..5
 * because that is the rubric's whole range, not because of what happens to be
 * on screen. A category with no visible rows is simply not drawn.
 */
function renderFacets(rows: PricedEntity[]): void {
  const byCategory = new Map<string, PricedEntity[]>();
  for (const row of rows) {
    byCategory.set(row.effectCategory, [...(byCategory.get(row.effectCategory) ?? []), row]);
  }

  facetCount.textContent = `${byCategory.size} ${byCategory.size === 1 ? 'category' : 'categories'}`;
  facets.replaceChildren();

  for (const [category, group] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
    const costTypes = [...new Set(group.map((r) => r.costType))].sort();
    const box = document.createElement('div');
    box.className = 'facet';
    box.innerHTML = `<div class="facet__name">${category} <span class="facet__n">${group.length}</span></div>`;

    const w = 200;
    const hgt = 118;
    const padL = 18;
    const padB = 20;
    const padT = 8;
    const svg = el('svg', { viewBox: `0 0 ${w} ${hgt}`, role: 'img' });
    svg.setAttribute('aria-label', `${category}: ${group.length} records`);

    const y = (scale: number) => padT + (5 - scale) * ((hgt - padT - padB) / 4);
    const x = (costType: PricedEntity['costType']) => {
      const i = costTypes.indexOf(costType);
      const band = (w - padL - 6) / costTypes.length;
      return padL + band * (i + 0.5);
    };

    for (const scale of [1, 2, 3, 4, 5]) {
      svg.append(el('line', { x1: padL, y1: y(scale), x2: w - 4, y2: y(scale), class: 'grid-line' }));
      const tick = el('text', { x: 2, y: y(scale) + 3, class: 'axis-label' });
      tick.textContent = String(scale);
      svg.append(tick);
    }

    for (const costType of costTypes) {
      const label = el('text', {
        x: x(costType),
        y: hgt - 6,
        class: 'axis-label',
        'text-anchor': 'middle',
      });
      label.textContent = costType === 'none' ? 'free' : costType;
      svg.append(label);
    }

    // Jitter identical points apart so a stack of three reads as three.
    const seen = new Map<string, number>();
    for (const row of group) {
      const key = `${row.costType}:${row.effectScale}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const offset = n === 0 ? 0 : (n % 2 === 1 ? 1 : -1) * Math.ceil(n / 2) * 7;

      const dot = el('circle', {
        cx: x(row.costType) + offset,
        cy: y(row.effectScale),
        r: 5,
        fill: floorColor(row.introducedFloor),
        class: 'dot',
      });
      dot.dataset.inferred = String(row.confidence === 'inferred');
      const title = document.createElementNS(SVG, 'title');
      title.textContent = `${row.name} — ${row.costType} cost, scale ${row.effectScale}, ${row.confidence}`;
      dot.append(title);
      svg.append(dot);
    }

    box.append(svg);
    facets.append(box);
  }

  if (byCategory.size === 0) {
    facets.innerHTML = `<p class="note" style="padding:1rem 0.9rem">Nothing is priced at this floor yet.</p>`;
  }
}

function renderTable(rows: PricedEntity[]): void {
  rowCount.textContent = `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`;

  const head = table.querySelector('thead')!;
  head.innerHTML = `<tr>${COLUMNS.map((col) => {
    if (!col.key) return `<th>${col.label}</th>`;
    const active = col.key === sortKey;
    const arrow = active ? (sortAsc ? '&uarr;' : '&darr;') : '';
    return `<th ${active ? `aria-sort="${sortAsc ? 'ascending' : 'descending'}"` : ''}>
      <button type="button" data-sort="${col.key}">${col.label} ${arrow}</button></th>`;
  }).join('')}</tr>`;

  for (const button of head.querySelectorAll<HTMLButtonElement>('[data-sort]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.sort as SortKey;
      if (key === sortKey) sortAsc = !sortAsc;
      else {
        sortKey = key;
        sortAsc = true;
      }
      repaint();
    });
  }

  const body = table.querySelector('tbody')!;
  body.innerHTML = sorted(rows)
    .map(
      (row) =>
        `<tr tabindex="0" data-row="${row.entityId}" aria-selected="${row.entityId === selectedId}">${COLUMNS.map(
          (col) => `<td class="${col.className ?? ''}">${col.cell(row)}</td>`,
        ).join('')}</tr>`,
    )
    .join('');

  for (const tr of body.querySelectorAll<HTMLTableRowElement>('[data-row]')) {
    const open = () => {
      selectedId = selectedId === tr.dataset.row ? null : tr.dataset.row!;
      repaint();
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  }
}

/**
 * What is known about one record at this floor.
 *
 * The table can only show fields that fit in a column. Most of the corpus is
 * facts, and without this panel none of them are reachable from the Ledger at
 * all: the table renders priced rows, and facts live off to the side.
 */
function renderRecord(h: Horizon, rows: PricedEntity[]): void {
  const row = selectedId ? rows.find((r) => r.entityId === selectedId) : undefined;
  if (!row) {
    recordBox.innerHTML = `<p class="card__empty">Pick a row to see what is known about it at
      your floor.</p>`;
    return;
  }

  const facts = h.factsFor(row.entityId);
  const aliases = h.aliasesFor(row.entityId);
  const section = (title: string, body: string) =>
    body ? `<div class="card__section"><h3>${title}</h3>${body}</div>` : '';

  recordBox.innerHTML = `
    <div class="card__body">
      <h2 class="card__name">${row.name}</h2>
      <div class="card__type">
        <span class="card__swatch" style="background:${floorColor(row.introducedFloor)}"></span>
        <span class="eyebrow">${row.type} &middot; ${
          row.introducedFloor === 0 ? 'before the dungeon' : `floor ${row.introducedFloor}`
        }</span>
      </div>
      ${section(
        'Price',
        `<p style="margin:0;font-size:0.85rem">${
          row.costType === 'none'
            ? 'Not bought. Awarded, found, or granted.'
            : `${row.costType}${row.costNumeric !== null ? `, ${row.costNumeric.toLocaleString()}` : ''}`
        }</p>`,
      )}
      ${section(
        'Effect',
        `<p style="margin:0;font-size:0.85rem">${row.effectCategory}, scale ${row.effectScale} of 5
          <span class="chip" data-confidence="${row.confidence}">${row.confidence}</span></p>
         ${row.restrictions ? `<p class="note" style="margin:0.4rem 0 0">${row.restrictions}</p>` : ''}`,
      )}
      ${
        aliases.length
          ? section('Also known as', `<ul class="card__list">${aliases
              .map((a) => `<li>${a.alias}</li>`)
              .join('')}</ul>`)
          : ''
      }
      ${
        facts.length
          ? section(
              'On the record',
              `<ul class="card__list">${facts
                .map(
                  (f) => `<li class="card__fact">
                    <span class="card__pred">${f.predicate.replace(/_/g, ' ')}</span><br />${
                      h.entity(f.object)?.canonicalName ?? f.object
                    }
                    ${f.gloss ? `<div class="card__gloss">${f.gloss}</div>` : ''}
                  </li>`,
                )
                .join('')}</ul>`,
            )
          : ''
      }
      ${section('Source', sourceLink(row.source))}
    </div>`;
}

/** A `wiki:Page` source becomes a link, so any row can be checked at its page. */
function sourceLink(source: string): string {
  if (!source.startsWith('wiki:')) return `<span class="card__pred">${source}</span>`;
  const page = source.slice(5);
  return `<a class="source-link card__pred" target="_blank" rel="noreferrer"
    href="https://dungeon-crawler-carl.fandom.com/wiki/${encodeURIComponent(page)}"
    >${page.replace(/_/g, ' ')} &nearr;</a>`;
}

function renderCoverage(h: Horizon, rows: PricedEntity[]): void {
  const c = h.coverage();
  const pct = (n: number) => (c.mechanicsVisible === 0 ? 0 : Math.round((n / c.mechanicsVisible) * 100));

  coverageBox.innerHTML = `
    <div class="coverage">
      <div class="coverage__headline">${c.mechanicsVisible}</div>
      <div class="coverage__sub">priced records open at this floor, of
        ${c.entitiesVisible} records in total</div>

      <div class="coverage__rows">
        ${CONFIDENCE_ORDER.map(
          (level) => `
          <div class="coverage__row"><span>${level}</span>
            <span>${c.mechanicsByConfidence[level]}</span></div>
          <div class="coverage__bar"><i style="width:${pct(c.mechanicsByConfidence[level])}%"></i></div>`,
        ).join('')}
      </div>

      <div class="coverage__note">
        ${c.mechanicsExcluded} of ${c.mechanicsVisible} are inferred and stay out of any headline
        number. ${c.mechanicsPriced} of ${c.mechanicsVisible} have a cost that is an actual figure,
        which is why the chart plots the kind of cost rather than its size.
        ${rows.length !== c.mechanicsVisible ? `<br /><br />Your filters are hiding ${c.mechanicsVisible - rows.length} of them.` : ''}
      </div>
    </div>`;
}

function renderFilters(): void {
  if (filterBox.dataset.built === 'true') return;
  filterBox.dataset.built = 'true';
  filterBox.innerHTML = `
    <fieldset>
      <legend>Kind</legend>
      ${KINDS.map(
        (kind) =>
          `<label><input type="checkbox" data-kind="${kind}" checked /> ${kind}</label>`,
      ).join('')}
    </fieldset>
    <fieldset>
      <legend>Confidence</legend>
      <label><input type="checkbox" data-inferred checked /> show inferred</label>
    </fieldset>`;

  for (const box of filterBox.querySelectorAll<HTMLInputElement>('[data-kind]')) {
    box.addEventListener('change', () => {
      const kind = box.dataset.kind as EntityType;
      if (box.checked) kinds.add(kind);
      else kinds.delete(kind);
      repaint();
    });
  }
  filterBox.querySelector<HTMLInputElement>('[data-inferred]')!.addEventListener('change', (e) => {
    includeInferred = (e.target as HTMLInputElement).checked;
    repaint();
  });
}

let current: Horizon | null = null;

function repaint(): void {
  if (!current) return;
  const rows = visibleRows(current);
  // A record filtered or embargoed away cannot stay selected.
  if (selectedId && !rows.some((r) => r.entityId === selectedId)) selectedId = null;
  renderFacets(rows);
  renderTable(rows);
  renderCoverage(current, rows);
  renderRecord(current, rows);
}

renderFilters();

mountShell({
  route: 'ledger',
  render(h) {
    current = h;
    repaint();
  },
});
