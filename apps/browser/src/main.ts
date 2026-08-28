/**
 * Browse: look up anyone and anything, scoped to the floor you have read to.
 *
 * The Atlas answers "who is connected to whom" and the Ledger answers "what
 * does this cost". Most of the corpus is neither: an entity with facts and no
 * relationships or price had no way to be seen. This is the front door.
 */
import '../../shell/src/styles.css';
import './browser.css';
import { mountShell, floorColor } from '@dcc/shell';
import { ENTITY_TYPES } from '@dcc/core';
import type { CorpusRecord, Entity, EntityType, Horizon } from '@dcc/core';

const WIKI = 'https://dungeon-crawler-carl.fandom.com/wiki/';

let query = '';
let typeFilter: EntityType | null = null;
let selectedId: string | null = null;

const searchBox = document.querySelector<HTMLInputElement>('[data-search]')!;
const typeBox = document.querySelector<HTMLElement>('[data-types]')!;
const resultList = document.querySelector<HTMLUListElement>('[data-results]')!;
const resultLabel = document.querySelector<HTMLElement>('[data-result-label]')!;
const resultCount = document.querySelector<HTMLElement>('[data-result-count]')!;
const recordBox = document.querySelector<HTMLElement>('[data-record]')!;

function sourceLink(source: string): string {
  if (!source.startsWith('wiki:')) return `<span class="card__pred">${source}</span>`;
  const page = source.slice(5);
  return `<a class="card__pred" target="_blank" rel="noreferrer"
    href="${WIKI}${encodeURIComponent(page)}">${page.replace(/_/g, ' ')} &nearr;</a>`;
}

interface Row {
  entity: Entity;
  why: string | null;
}

function rows(h: Horizon): Row[] {
  const found: Row[] = query
    ? h.search(query, 300).map((hit) => ({
        entity: hit.entity,
        why: hit.matchedOn === hit.entity.canonicalName ? null : hit.matchedOn,
      }))
    : h.entities().map((entity) => ({ entity, why: null }));
  return typeFilter ? found.filter((r) => r.entity.type === typeFilter) : found;
}

function renderTypes(h: Horizon): void {
  const counts = new Map<EntityType, number>();
  for (const e of h.entities()) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);

  const chip = (label: string, value: EntityType | null, n: number) =>
    `<button type="button" data-type="${value ?? ''}" aria-pressed="${typeFilter === value}"
      >${label} ${n}</button>`;

  typeBox.innerHTML =
    chip('all', null, h.entities().length) +
    ENTITY_TYPES.filter((t) => counts.has(t))
      .map((t) => chip(t, t, counts.get(t)!))
      .join('');

  for (const button of typeBox.querySelectorAll<HTMLButtonElement>('[data-type]')) {
    button.addEventListener('click', () => {
      typeFilter = (button.dataset.type || null) as EntityType | null;
      paint();
    });
  }
}

function renderResults(list: Row[]): void {
  resultLabel.textContent = query ? `Matching "${query}"` : 'Everything open at this floor';
  resultCount.textContent = `${list.length} ${list.length === 1 ? 'record' : 'records'}`;

  if (list.length === 0) {
    resultList.innerHTML = `<li class="results__empty">Nothing here at this floor. Try a
      different word, or move the embargo bar forward.</li>`;
    return;
  }

  resultList.innerHTML = list
    .map(
      ({ entity, why }) => `<li><button type="button" data-id="${entity.id}"
        aria-current="${entity.id === selectedId}">
        <span class="results__swatch" style="background:${floorColor(entity.introducedFloor)}"></span>
        <span class="results__name">${entity.canonicalName}${
          why ? `<span class="results__why">also known as ${why}</span>` : ''
        }</span>
        <span class="results__type">${entity.type}</span>
      </button></li>`,
    )
    .join('');

  for (const button of resultList.querySelectorAll<HTMLButtonElement>('[data-id]')) {
    button.addEventListener('click', () => {
      selectedId = button.dataset.id!;
      paint();
    });
  }
}

function section(title: string, body: string): string {
  return body ? `<div class="card__section"><h4>${title}</h4>${body}</div>` : '';
}

function renderRecord(h: Horizon, record: CorpusRecord | undefined): void {
  if (!record) {
    recordBox.innerHTML = `<p class="card__empty">Pick a record. Everything in it is scoped to
      your floor.</p>`;
    return;
  }

  const { entity, price } = record;
  const relationships = record.relationships
    .map((e) => {
      const otherId = e.src === entity.id ? e.dst : e.src;
      return `<li><span class="card__pred">${e.type}</span><br />${
        h.entity(otherId)?.canonicalName ?? otherId
      }</li>`;
    })
    .join('');

  recordBox.innerHTML = `
    <div class="card__body">
      <h3 class="card__name">${entity.canonicalName}</h3>
      <div class="card__type">
        <span class="card__swatch" style="background:${floorColor(entity.introducedFloor)}"></span>
        <span class="eyebrow">${entity.type} &middot; ${
          entity.introducedFloor === 0 ? 'before the dungeon' : `floor ${entity.introducedFloor}`
        }</span>
      </div>
      ${entity.description ? `<p class="card__desc">${entity.description}</p>` : ''}
      ${entity.notes ? `<p class="note" style="margin:0.6rem 0 0">${entity.notes}</p>` : ''}
      ${
        // Rendered only when a status row is visible. No row means nothing is
        // drawn: a badge saying "unknown" would announce that something is
        // being withheld.
        record.status
          ? section('Status', `<p style="margin:0"><span class="chip">${record.status.status}</span></p>`)
          : ''
      }
      ${
        record.aliases.length
          ? section('Also known as', `<ul class="card__list">${record.aliases
              .map((a) => `<li>${a.alias}</li>`)
              .join('')}</ul>`)
          : ''
      }
      ${
        price
          ? section(
              'Price and effect',
              `<p style="margin:0;font-size:0.85rem">${
                price.costType === 'none' ? 'Not bought' : price.costType
              }${price.costNumeric !== null ? `, ${price.costNumeric.toLocaleString()}` : ''}
               &middot; ${price.effectCategory}, scale ${price.effectScale} of 5</p>
               ${price.restrictions ? `<p class="note" style="margin:0.4rem 0 0">${price.restrictions}</p>` : ''}`,
            )
          : ''
      }
      ${
        record.heldBy.length
          ? section(
              'Carried by',
              `<ul class="card__list">${record.heldBy
                .map(
                  ({ holder, holding }) =>
                    `<li>${holder.canonicalName}<span class="card__pred">
                      ${holding.slot ? ` ${holding.slot}` : ''} from floor ${holding.revealFloor}
                    </span></li>`,
                )
                .join('')}</ul>`,
            )
          : ''
      }
      ${relationships ? section('Relationships', `<ul class="card__list">${relationships}</ul>`) : ''}
      ${
        record.facts.length
          ? section(
              'On the record',
              `<ul class="card__list">${record.facts
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
      ${section('Source', sourceLink(record.facts[0]?.source ?? price?.source ?? 'inferred'))}
    </div>`;
}

let current: Horizon | null = null;

function paint(): void {
  if (!current) return;
  // A record that is no longer visible cannot stay selected.
  if (selectedId && !current.entity(selectedId)) selectedId = null;
  renderTypes(current);
  const list = rows(current);
  renderResults(list);
  renderRecord(current, selectedId ? current.recordFor(selectedId) : undefined);
}

searchBox.addEventListener('input', () => {
  query = searchBox.value;
  paint();
});

mountShell({
  route: 'browse',
  heading: 'Browse people, items, skills, and places',
  render(h) {
    current = h;
    paint();
  },
});
