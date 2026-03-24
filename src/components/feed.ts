import { getListings, subscribe } from '../lib/store';
import { auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';
import type { Listing, WithId } from '../lib/types';

export function renderFeed(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="container-fluid">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="margin:0;">Explorar</h2>
        <div style="display:flex;gap:.5rem;">
          <input type="search" id="feed-search" placeholder="Buscar..." style="margin:0;max-width:200px;">
          <select id="feed-filter" style="margin:0;max-width:140px;">
            <option value="">Todo</option>
            <option value="product">Productos</option>
            <option value="service">Servicios</option>
            <option value="swap">Intercambio con gestos ✦</option>
          </select>
        </div>
      </div>
      <div id="feed-grid" class="grid"></div>
    </div>
  `;

  const grid = document.getElementById('feed-grid')!;
  const searchInput = document.getElementById('feed-search') as HTMLInputElement;
  const filterSelect = document.getElementById('feed-filter') as HTMLSelectElement;

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

  searchInput.addEventListener('input', render);
  filterSelect.addEventListener('change', render);
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
