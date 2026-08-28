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
import type { EntityType, HeldEntity, Horizon, PricedEntity, Sheet } from '@dcc/core';

const SVG = 'http://www.w3.org/2000/svg';

type SortKey = 'name' | 'type' | 'costType' | 'effectCategory' | 'effectScale';

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
  { key: null, label: 'Source', className: 'num', cell: (r) => r.source },
];

const KINDS: EntityType[] = ['class', 'race', 'skill', 'item'];

type View = 'sheets' | 'catalogue';

let view: View = 'sheets';
let crawlerId: string | null = null;
let selectedId: string | null = null;
let sortKey: SortKey = 'effectCategory';
let sortAsc = true;
const kinds = new Set<EntityType>(KINDS);

const facets = document.querySelector<HTMLElement>('[data-facets]')!;
const facetCount = document.querySelector<HTMLElement>('[data-facet-count]')!;
const rowCount = document.querySelector<HTMLElement>('[data-row-count]')!;
const table = document.querySelector<HTMLTableElement>('[data-table]')!;
const filterBox = document.querySelector<HTMLElement>('[data-filters]')!;
const recordBox = document.querySelector<HTMLElement>('[data-record]')!;
const crawlerNav = document.querySelector<HTMLElement>('[data-crawlers]')!;
const sheetBox = document.querySelector<HTMLElement>('[data-sheet]')!;
const filterPanel = document.querySelector<HTMLElement>('[data-filter-panel]')!;
const panels: Record<View, HTMLElement> = {
  sheets: document.querySelector<HTMLElement>('[data-panel="sheets"]')!,
  catalogue: document.querySelector<HTMLElement>('[data-panel="catalogue"]')!,
};

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
    // Inferred rows are annotation weakness, not a property of the dungeon, so
    // they are simply left out rather than shown wearing a warning label.
    // docs/CORPUS-REVIEW.md is where confidence belongs.
    .filter((m) => m.confidence !== 'inferred');
}

function sorted(rows: PricedEntity[]): PricedEntity[] {
  const direction = sortAsc ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'effectScale') return (a.effectScale - b.effectScale) * direction;
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
      const title = document.createElementNS(SVG, 'title');
      title.textContent = `${row.name} — ${row.costType} cost, scale ${row.effectScale}`;
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
    body ? `<div class="card__section"><h4>${title}</h4>${body}</div>` : '';

  recordBox.innerHTML = `
    <div class="card__body">
      <h3 class="card__name">${row.name}</h3>
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
        `<p style="margin:0;font-size:0.85rem">${row.effectCategory}, scale ${row.effectScale} of 5</p>
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
    </fieldset>`;

  for (const box of filterBox.querySelectorAll<HTMLInputElement>('[data-kind]')) {
    box.addEventListener('change', () => {
      const kind = box.dataset.kind as EntityType;
      if (box.checked) kinds.add(kind);
      else kinds.delete(kind);
      repaint();
    });
  }
}

const STATS: [keyof Pick<NonNullable<Sheet['stats']>, 'str' | 'int' | 'con' | 'dex' | 'cha'>, string][] =
  [
    ['str', 'STR'],
    ['int', 'INT'],
    ['con', 'CON'],
    ['dex', 'DEX'],
    ['cha', 'CHA'],
  ];

/** A held thing, clickable when the catalogue has a priced record for it. */
function held(h: Horizon, item: HeldEntity): string {
  const label = `${item.entity.canonicalName}${
    item.level !== null ? ` <span class="held__level">lv ${item.level}</span>` : ''
  }`;
  const priced = h.mechanics().some((m) => m.entityId === item.heldId);
  return priced
    ? `<button class="held" type="button" data-held="${item.heldId}">${label}</button>`
    : label;
}

function renderSheets(h: Horizon): void {
  const ids = h.sheetIds();

  crawlerNav.innerHTML = ids
    .map((id) => {
      const entity = h.entity(id)!;
      return `<button type="button" data-crawler="${id}" aria-pressed="${id === crawlerId}">
        <span class="card__swatch" style="background:${floorColor(entity.introducedFloor)}"></span>
        ${entity.canonicalName}</button>`;
    })
    .join('');
  for (const button of crawlerNav.querySelectorAll<HTMLButtonElement>('[data-crawler]')) {
    button.addEventListener('click', () => {
      crawlerId = button.dataset.crawler!;
      repaint();
    });
  }

  const sheet = crawlerId ? h.sheetFor(crawlerId) : undefined;
  if (!sheet) {
    sheetBox.innerHTML = `<p class="sheet__empty">No sheet is open at this floor.</p>`;
    return;
  }

  const identity = [...sheet.races, ...sheet.classes]
    .map((r) => r.entity.canonicalName)
    .join(' &middot; ');

  // Each section is dated separately. Gear and skills come from the per-floor
  // pages, which stop after floor 2; race and class are recorded elsewhere and
  // run to floor 3. One combined "as of" line let the later ones hide the
  // earlier ones, which is how a floor 9 sheet claimed floor 3 kit.
  const asOf = (items: HeldEntity[]) =>
    items.length ? Math.max(...items.map((i) => i.revealFloor)) : null;

  const block = (title: string, items: HeldEntity[], body: string) => {
    if (!body) return '';
    const floor = asOf(items);
    const stale =
      floor !== null && floor < h.floor
        ? ` <span class="sheet__stale">as of floor ${floor}</span>`
        : '';
    return `<div class="sheet__block"><h3>${title}${stale}</h3>${body}</div>`;
  };

  const gearRows = sheet.gear
    .map(
      (g) => `<dt>${g.slot || '&mdash;'}</dt><dd>${held(h, g)}</dd>`,
    )
    .join('');

  const list = (items: HeldEntity[]) =>
    items.length
      ? `<ul class="card__list">${items.map((i) => `<li>${held(h, i)}</li>`).join('')}</ul>`
      : '';

  sheetBox.innerHTML = `
    <div class="sheet__head">
      <div>
        <h2 class="sheet__name">${sheet.character.canonicalName}</h2>
        <div class="sheet__ident">${identity || 'No race or class chosen yet'}</div>
      </div>
      ${
        sheet.stats?.level !== null && sheet.stats !== null
          ? `<div class="sheet__level">Level<b>${sheet.stats.level}</b></div>`
          : ''
      }
    </div>
    ${
      // Only drawn when the source actually records attributes. A level-only
      // line is common at higher floors and must not render as five nulls.
      sheet.stats && STATS.some(([key]) => sheet.stats![key] !== null)
        ? `<dl class="stats">${STATS.map(
            ([key, label]) =>
              `<div><dt>${label}</dt><dd>${sheet.stats![key] ?? '&mdash;'}</dd></div>`,
          ).join('')}</dl>`
        : ''
    }
    <div class="sheet__cols">
      ${block('Equipped', sheet.gear, gearRows ? `<dl class="slots">${gearRows}</dl>` : '')}
      ${block('Skills', sheet.skills, list(sheet.skills)) +
        block('Spells', sheet.spells, list(sheet.spells))}
    </div>
    ${staleNote(sheet, h.floor)}`;

  for (const button of sheetBox.querySelectorAll<HTMLButtonElement>('[data-held]')) {
    button.addEventListener('click', () => {
      selectedId = button.dataset.held!;
      repaint();
    });
  }
}

/**
 * Say which floor the sheet is actually from.
 *
 * Stats and kit come from different sources and run out at different floors:
 * the per-book tables carry a level well past where the per-floor pages stop
 * recording gear. Claiming either is current when it is not would be the
 * quietest kind of wrong.
 */
function staleNote(sheet: Sheet, floor: number): string {
  const stale = sheet.statsAsOf !== null && sheet.statsAsOf < floor;
  const attributes = sheet.stats && sheet.stats.str !== null;
  if (!stale && attributes) return '';
  return `<p class="sheet__asof">The source records this crawler's gear and skills only for
    the early floors, and a full attribute line for only a few. Levels are current${
      stale ? `; attributes are as of floor ${sheet.statsAsOf}` : ''
    }.</p>`;
}

function setView(next: View): void {
  view = next;
  for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== view;
  filterPanel.hidden = view !== 'catalogue';
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  repaint();
}

let current: Horizon | null = null;

function repaint(): void {
  if (!current) return;
  const rows = visibleRows(current);
  // A record filtered or embargoed away cannot stay selected.
  if (selectedId && !rows.some((r) => r.entityId === selectedId)) selectedId = null;

  const sheets = current.sheetIds();
  if (crawlerId && !sheets.includes(crawlerId)) crawlerId = null;
  crawlerId ??= sheets[0] ?? null;

  if (view === 'sheets') renderSheets(current);
  else {
    renderFacets(rows);
    renderTable(rows);
  }
  renderRecord(current, rows);
}

renderFilters();
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  tab.addEventListener('click', () => setView(tab.dataset.view as View));
}
setView('sheets');

mountShell({
  route: 'ledger',
  heading: 'Ledger: character sheets and prices',
  render(h) {
    current = h;
    repaint();
  },
});
