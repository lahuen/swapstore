import { getListings, subscribe } from '../lib/store';
import { auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';
import type { Listing, WithId } from '../lib/types';

export function renderFeed(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="container-fluid">
      <div class="feed-header">
        <h2 style="margin:0;">Explorar</h2>
        <div class="feed-controls feed-controls-desktop">
          <input type="search" id="feed-search" placeholder="Buscar...">
          <select id="feed-filter">
            <option value="">Todo</option>
            <option value="product">Productos</option>
            <option value="service">Servicios</option>
            <option value="swap">Intercambio ✦</option>
          </select>
        </div>
      </div>

      <!-- Mobile: floating search overlay -->
      <div class="search-overlay" id="search-overlay">
        <div class="search-overlay-bar">
          <input type="search" id="feed-search-mobile" placeholder="Buscar...">
          <select id="feed-filter-mobile">
            <option value="">Todo</option>
            <option value="product">Productos</option>
            <option value="service">Servicios</option>
            <option value="swap">Intercambio ✦</option>
          </select>
          <button type="button" class="search-overlay-close outline" id="search-close">✕</button>
        </div>
      </div>

      <button class="search-fab" id="search-fab" aria-label="Buscar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>

      <div id="feed-grid" class="grid"></div>
    </div>
  `;

  const grid = document.getElementById('feed-grid')!;
  // Desktop controls
  const searchInput = document.getElementById('feed-search') as HTMLInputElement;
  const filterSelect = document.getElementById('feed-filter') as HTMLSelectElement;
  // Mobile controls
  const searchMobile = document.getElementById('feed-search-mobile') as HTMLInputElement;
  const filterMobile = document.getElementById('feed-filter-mobile') as HTMLSelectElement;
  const overlay = document.getElementById('search-overlay')!;
  const fab = document.getElementById('search-fab')!;
  const closeBtn = document.getElementById('search-close')!;

  // Sync mobile ↔ desktop
  function syncFromMobile() {
    searchInput.value = searchMobile.value;
    filterSelect.value = filterMobile.value;
    render();
  }
  function syncFromDesktop() {
    searchMobile.value = searchInput.value;
    filterMobile.value = filterSelect.value;
    render();
  }

  fab.addEventListener('click', () => {
    overlay.classList.add('open');
    searchMobile.focus();
  });
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('open');
  });

  searchInput.addEventListener('input', syncFromDesktop);
  filterSelect.addEventListener('change', syncFromDesktop);
  searchMobile.addEventListener('input', syncFromMobile);
  filterMobile.addEventListener('change', syncFromMobile);

  function render() {
    let items = getListings();
    const q = searchInput.value.toLowerCase().trim();
    const f = filterSelect.value;

    if (q) items = items.filter(l => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q));
    if (f === 'product') items = items.filter(l => l.type === 'product');
    if (f === 'service') items = items.filter(l => l.type === 'service');
    if (f === 'swap') items = items.filter(l => l.priceMode === 'swap' || l.priceMode === 'both');

    if (!items.length) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--pico-muted-color);">Aún no hay publicaciones. ¡Anímate a compartir algo con la comunidad!</p>`;
      return;
    }

    grid.innerHTML = items.map(l => cardHTML(l)).join('');

    grid.querySelectorAll('[data-listing-id]').forEach(card => {
      card.addEventListener('click', () => {
        window.location.hash = `#listing/${card.getAttribute('data-listing-id')}`;
      });
    });
  }

  const unsub = subscribe(render, ['listings']);
  render();

  return unsub;
}

function cardHTML(l: WithId<Listing>): string {
  const img = l.images?.[0]
    ? `<img src="${esc(l.images[0])}" alt="${esc(l.title)}" loading="lazy" style="width:100%;height:160px;object-fit:cover;border-radius:var(--pico-border-radius);">`
    : `<div style="width:100%;height:160px;background:var(--pico-secondary-background);border-radius:var(--pico-border-radius);display:flex;align-items:center;justify-content:center;color:var(--pico-muted-color);">Sin imagen</div>`;

  const badge = l.priceMode === 'swap' ? '<small class="pico-color-indigo-500">Swap</small>'
    : l.priceMode === 'both' ? '<small class="pico-color-indigo-500">Swap / $</small>'
    : '';

  const price = l.cashPrice ? `$${l.cashPrice.toLocaleString('es-AR')}` : '';
  const isOwn = l.userId === auth.currentUser?.uid;

  return `
    <article data-listing-id="${l.id}" style="cursor:pointer;margin:0;padding:0;overflow:hidden;">
      ${img}
      <div style="padding:.75rem;">
        <strong style="display:block;margin-bottom:.25rem;">${esc(l.title)}</strong>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>${price} ${badge}</span>
          <small style="color:var(--pico-muted-color);">${esc(l.type === 'product' ? 'Producto' : 'Servicio')}</small>
        </div>
        ${isOwn ? '<small style="color:var(--pico-muted-color);">Tu publicación</small>' : `<small style="color:var(--pico-muted-color);">${esc(l.userName)}</small>`}
      </div>
    </article>
  `;
}
