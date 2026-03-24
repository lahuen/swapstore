import { getListings, subscribe } from '../lib/store';
import { auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';

export function renderMyListings(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="container" style="max-width:700px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="margin:0;">Mis publicaciones</h2>
        <a href="#new" role="button">+ Publicar</a>
      </div>
      <div id="my-listings-list"></div>
    </div>
  `;

  const list = document.getElementById('my-listings-list')!;

  function render() {
    const mine = getListings().filter(l => l.userId === auth.currentUser?.uid);
    if (!mine.length) {
      list.innerHTML = `<p style="color:var(--pico-muted-color);">Aún no tienes publicaciones. <a href="#new">¡Comparte algo con la comunidad!</a></p>`;
      return;
    }

    list.innerHTML = mine.map(l => `
      <article style="cursor:pointer;margin-bottom:.5rem;" data-id="${l.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${esc(l.title)}</strong>
            <br><small style="color:var(--pico-muted-color);">${esc(l.type === 'product' ? 'Producto' : 'Servicio')} &middot; ${l.cashPrice ? `$${l.cashPrice.toLocaleString('es-AR')}` : 'Swap'}</small>
          </div>
          <small style="color:${l.status === 'active' ? 'var(--pico-ins-color)' : 'var(--pico-muted-color)'};">${l.status === 'active' ? 'Activo' : 'Pausado'}</small>
        </div>
      </article>
    `).join('');

    list.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        window.location.hash = `#listing/${el.getAttribute('data-id')}`;
      });
    });
  }

  const unsub = subscribe(render, ['listings']);
  render();
  return unsub;
}
