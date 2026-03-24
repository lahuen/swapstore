import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { getListing, updateListing } from '../lib/listings';
import { createTransaction } from '../lib/transactions';
import { createTicket } from '../lib/tickets';
import { getListings, getProfile, getConfig } from '../lib/store';
import { auth, db } from '../lib/firebase';
import { esc } from '../lib/sanitize';
import type { Listing, WithId } from '../lib/types';

export async function renderListingDetail(container: HTMLElement, listingId: string): Promise<(() => void) | void> {
  container.innerHTML = `<div class="container" style="max-width:700px;"><p aria-busy="true">Cargando...</p></div>`;

  const listing = await getListing(listingId);
  if (!listing) {
    container.innerHTML = `<div class="container"><p>Publicación no encontrada.</p><a href="#feed">Volver</a></div>`;
    return;
  }

  const isOwner = listing.userId === auth.currentUser?.uid;

  const images = listing.images?.length
    ? listing.images.map(u => `<img src="${esc(u)}" style="max-height:300px;border-radius:var(--pico-border-radius);object-fit:contain;">`).join('')
    : '<div style="height:200px;background:var(--color-bg-light);border-radius:var(--pico-border-radius);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);">Sin imagen</div>';

  const priceText = listing.cashPrice ? `$${listing.cashPrice.toLocaleString('es-AR')}` : '';
  const modeText = listing.priceMode === 'swap' ? 'Intercambio con gestos ✦'
    : listing.priceMode === 'both' ? `${priceText} / Intercambio con gestos`
    : priceText;

  container.innerHTML = `
    <div class="container" style="max-width:700px;">
      <a href="#feed" style="display:inline-block;margin-bottom:1rem;">&larr; Volver</a>
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div>${images}</div>
        <hgroup>
          <h2 style="margin:0;">${esc(listing.title)}</h2>
          <p>${esc(listing.type === 'product' ? 'Producto' : 'Servicio')} &middot; ${esc(listing.category || 'General')}${listing.location ? ` &middot; ${esc(listing.location)}` : ''}</p>
        </hgroup>
        <p style="font-size:1.25rem;font-weight:600;">${modeText}</p>
        <p>${esc(listing.description)}</p>
        ${listing.swapHint ? `<p><strong>Acepta a cambio:</strong> ${esc(listing.swapHint)}</p>` : ''}
        <div style="display:flex;align-items:center;gap:.75rem;color:var(--pico-muted-color);">
          <span>Publicado por ${esc(listing.userName)}</span>
          <span id="user-stats" style="font-size:.85rem;"></span>
        </div>

        ${isOwner ? ownerActions(listing) : buyerActions(listing)}

        ${!isOwner ? `
        <hr>
        <details>
          <summary style="cursor:pointer;font-size:.85rem;color:var(--color-text-muted);">Reportar publicacion</summary>
          <form id="report-form" style="margin-top:.5rem;">
            <textarea name="reason" rows="2" placeholder="Describe el problema..." required style="font-size:.9rem;"></textarea>
            <button type="submit" class="outline" style="font-size:.85rem;padding:.4rem .75rem;margin:0;">Enviar reporte</button>
            <span id="report-msg" style="display:none;font-size:.85rem;margin-left:.5rem;"></span>
          </form>
        </details>
        ` : ''
        }
      </div>
    </div>
  `;

  // Load seller transaction stats
  loadUserStats(listing.userId);

  // Report form
  const reportForm = document.getElementById('report-form') as HTMLFormElement | null;
  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = reportForm.querySelector('button[type="submit"]') as HTMLButtonElement;
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      const reason = (reportForm.elements.namedItem('reason') as HTMLTextAreaElement).value.trim();
      try {
        await createTicket({ subject: `Reporte: ${listing.title}`, category: 'listing', body: reason, relatedId: listingId });
        const msg = document.getElementById('report-msg')!;
        msg.textContent = 'Reporte enviado';
        msg.style.color = 'var(--color-sage)';
        msg.style.display = 'inline';
        (reportForm.elements.namedItem('reason') as HTMLTextAreaElement).value = '';
      } catch (err: any) {
        const msg = document.getElementById('report-msg')!;
        msg.textContent = `Error: ${err.message}`;
        msg.style.color = 'var(--pico-del-color)';
        msg.style.display = 'inline';
      }
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    });
  }

  if (isOwner) {
    document.getElementById('edit-listing-btn')?.addEventListener('click', () => {
      window.location.hash = `#edit/${listingId}`;
    });
    document.getElementById('pause-listing-btn')?.addEventListener('click', async () => {
      await updateListing(listingId, { status: listing.status === 'active' ? 'paused' : 'active' });
      renderListingDetail(container, listingId);
    });
  } else {
    setupBuyerForm(container, listing);
  }
}

function ownerActions(l: WithId<Listing>): string {
  return `
    <div style="display:flex;gap:1rem;">
      <button id="edit-listing-btn" class="secondary">Editar</button>
      <button id="pause-listing-btn" class="outline">${l.status === 'active' ? 'Pausar' : 'Reactivar'}</button>
    </div>
  `;
}

function buyerActions(l: WithId<Listing>): string {
  const showCash = l.priceMode === 'cash' || l.priceMode === 'both';
  const showSwap = l.priceMode === 'swap' || l.priceMode === 'both';
  const profile = getProfile();
  const balance = profile?.walletBalance || 0;
  const cfg = getConfig();
  const rate = profile?.verified ? cfg.commissionVerified : cfg.commissionUnverified;
  const commPct = (rate * 100).toFixed(1);

  return `
    <hr>
    <h3>Contactar</h3>
    <form id="offer-form">
      ${showCash && showSwap ? `
        <fieldset>
          <label><input type="radio" name="offerType" value="cash" checked> Adquirir en efectivo</label>
          <label><input type="radio" name="offerType" value="swap"> Intercambiar con gestos ✦</label>
        </fieldset>
      ` : ''}

      <div id="cash-section" style="${showCash ? '' : 'display:none;'}">
        <p>Precio: <strong>$${(l.cashPrice || 0).toLocaleString('es-AR')}</strong></p>
        <small style="color:var(--pico-muted-color);">Comisión plataforma: ${commPct}% ($${Math.round((l.cashPrice || 0) * rate).toLocaleString('es-AR')})${!profile?.verified ? ' · <a href="#profile">Verificá tu cuenta</a> para menor comisión' : ''}</small>
      </div>

      <div id="swap-section" style="${!showCash && showSwap ? '' : 'display:none;'}">
        <div style="background:var(--color-bg-light);padding:.75rem 1rem;border-radius:var(--pico-border-radius);margin-bottom:1rem;">
          <strong>Tus gestos:</strong> ✦${balance}
          <br><small style="color:var(--pico-muted-color);">Comisión: ${commPct}% en gestos sobre el monto acordado</small>
        </div>
        <label>Gestos ✦ que ofreces
          <input type="number" name="utAmount" min="0" step="0.5" placeholder="Ej: 5">
        </label>
        <label>¿Qué ofreces a cambio? (descripción)
          <textarea name="swapMessage" rows="2" placeholder="Describe el servicio o producto que ofreces..."></textarea>
        </label>
        <div id="my-listings-select"></div>
      </div>

      <label>Mensaje
        <textarea name="message" rows="2" placeholder="Coordinar entrega, preguntas, etc." required></textarea>
      </label>

      <button type="submit">Enviar propuesta</button>
      <p id="offer-error" style="color:var(--pico-del-color);display:none;"></p>
      <p id="offer-success" style="color:var(--pico-ins-color);display:none;"></p>
    </form>
  `;
}

function setupBuyerForm(container: HTMLElement, listing: WithId<Listing>) {
  const form = container.querySelector('#offer-form') as HTMLFormElement | null;
  if (!form) return;

  const cashSection = container.querySelector('#cash-section') as HTMLElement;
  const swapSection = container.querySelector('#swap-section') as HTMLElement;
  const radios = form.querySelectorAll('input[name="offerType"]');

  radios.forEach(r => r.addEventListener('change', () => {
    const val = (form.elements.namedItem('offerType') as RadioNodeList)?.value || 'cash';
    cashSection.style.display = val === 'cash' ? '' : 'none';
    swapSection.style.display = val === 'swap' ? '' : 'none';
  }));

  // Show user's own listings for swap selection
  if (swapSection) {
    const myListings = getListings().filter(l => l.userId === auth.currentUser?.uid && l.status === 'active');
    if (myListings.length) {
      const selectDiv = container.querySelector('#my-listings-select')!;
      selectDiv.innerHTML = `
        <label>Vincular una de tus publicaciones (opcional):
          <select name="swapListingId">
            <option value="">— Ninguna —</option>
            ${myListings.map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('')}
          </select>
        </label>
      `;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = container.querySelector('#offer-error') as HTMLElement;
    const successEl = container.querySelector('#offer-success') as HTMLElement;
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.setAttribute('aria-busy', 'true');

    try {
      const fd = new FormData(form);
      const offerType = (fd.get('offerType') as string) || (listing.priceMode === 'swap' ? 'swap' : 'cash');
      const swapListingId = fd.get('swapListingId') as string || '';
      const utAmount = offerType === 'swap' ? Number(fd.get('utAmount')) || 0 : 0;

      await createTransaction({
        listingId: listing.id,
        listingTitle: listing.title,
        sellerId: listing.userId,
        sellerName: listing.userName,
        type: offerType as 'cash' | 'swap',
        message: ((fd.get('message') as string) || '') + (fd.get('swapMessage') ? `\n\nOfrezco: ${fd.get('swapMessage')}` : ''),
        cashAmount: offerType === 'cash' ? listing.cashPrice : null,
        utAmount: utAmount || null,
        swapListingIds: swapListingId ? [swapListingId] : [],
      });

      successEl.textContent = '¡Propuesta enviada! La otra persona será notificada.';
      successEl.style.display = 'block';
      btn.disabled = true;
    } catch (err: any) {
      errorEl.textContent = `Error: ${err.message}`;
      errorEl.style.display = 'block';
    } finally {
      btn.removeAttribute('aria-busy');
    }
  });
}

async function loadUserStats(userId: string) {
  const el = document.getElementById('user-stats');
  if (!el) return;
  try {
    const txCol = collection(db, 'transactions');
    const completed = 'completed';
    const [buys, sells] = await Promise.all([
      getCountFromServer(query(txCol, where('buyerId', '==', userId), where('status', '==', completed))),
      getCountFromServer(query(txCol, where('sellerId', '==', userId), where('status', '==', completed))),
    ]);
    const b = buys.data().count;
    const s = sells.data().count;
    const total = b + s;
    if (total > 0) {
      el.textContent = `· ${total} intercambio${total !== 1 ? 's' : ''} (${b} compra${b !== 1 ? 's' : ''}, ${s} venta${s !== 1 ? 's' : ''})`;
    }
  } catch {
    // silently ignore — stats are non-critical
  }
}
