import { getMyTransactions, getListings, subscribe } from '../lib/store';
import { addOffer, updateTransactionStatus } from '../lib/transactions';
import { auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';
import type { Transaction, WithId } from '../lib/types';

export function renderMyDeals(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="container" style="max-width:700px;">
      <h2>Mis intercambios</h2>
      <div id="deals-list"></div>
    </div>
  `;

  const list = document.getElementById('deals-list')!;

  function render() {
    const txs = getMyTransactions();
    if (!txs.length) {
      list.innerHTML = `<p style="color:var(--pico-muted-color);">Aún no tienes intercambios. Explora la comunidad y encuentra algo que te interese.</p>`;
      return;
    }

    list.innerHTML = txs.map(tx => dealCard(tx)).join('');
    attachHandlers(list);
  }

  const unsub = subscribe(render, ['transactions']);
  render();
  return unsub;
}

function dealCard(tx: WithId<Transaction>): string {
  const uid = auth.currentUser?.uid;
  const isBuyer = tx.buyerId === uid;
  const otherName = isBuyer ? tx.sellerName : tx.buyerName;
  const role = isBuyer ? 'Solicitante' : 'Ofrecedor';

  const statusMap: Record<string, string> = {
    proposed: 'Propuesta enviada',
    countered: 'Contraoferta',
    accepted: 'Aceptado',
    rejected: 'Rechazado',
    completed: 'Completado',
  };

  const lastOffer = tx.offers?.[tx.offers.length - 1];
  const canRespond = !isBuyer && (tx.status === 'proposed' || tx.status === 'countered');
  const canCounter = isBuyer && tx.status === 'countered';
  const isActive = tx.status === 'proposed' || tx.status === 'countered';

  return `
    <article data-tx-id="${tx.id}" style="margin-bottom:1rem;">
      <header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${esc(tx.listingTitle)}</strong>
          <small>${statusMap[tx.status] || tx.status}</small>
        </div>
        <small style="color:var(--pico-muted-color);">${role} &middot; ${esc(otherName)}</small>
      </header>

      <div style="max-height:200px;overflow-y:auto;margin-bottom:1rem;">
        ${(tx.offers || []).map(o => `
          <div style="padding:.5rem;margin:.25rem 0;background:${o.fromUserId === uid ? 'var(--pico-primary-background)' : 'var(--pico-secondary-background)'};border-radius:var(--pico-border-radius);">
            <small><strong>${esc(o.fromUserName)}</strong></small>
            <p style="margin:0;">${esc(o.message)}</p>
            ${o.cashAmount ? `<small>$${o.cashAmount.toLocaleString('es-AR')}</small>` : ''}
            ${o.utAmount ? `<small>✦${o.utAmount}</small>` : ''}
          </div>
        `).join('')}
      </div>

      ${tx.utTotal ? `<p><strong>Gestos acordados:</strong> ✦${tx.utTotal}</p>` : ''}
      ${tx.cashTotal ? `<p><strong>Efectivo:</strong> $${tx.cashTotal.toLocaleString('es-AR')}</p>` : ''}
      ${tx.settled ? `<small style="color:var(--pico-ins-color);">Completado &middot; Comisión: ${tx.commissionUt ? '✦' + tx.commissionUt : ''}${tx.commissionUt && tx.commissionCash ? ' + ' : ''}${tx.commissionCash ? '$' + tx.commissionCash.toLocaleString('es-AR') : ''}</small>` : ''}
      ${tx.meetup && tx.status === 'accepted' ? `<p><strong>Punto de encuentro:</strong> ${esc(tx.meetup)}</p>` : ''}

      ${isActive ? `
        <form class="reply-form" data-tx-id="${tx.id}">
          <textarea name="message" rows="2" placeholder="Tu mensaje..." required></textarea>
          <div style="display:flex;gap:.5rem;margin-top:.5rem;">
            ${canRespond ? `
              <button type="submit" name="action" value="counter" class="secondary" style="flex:1;">Contraoferta</button>
              <button type="submit" name="action" value="accept" style="flex:1;">Aceptar</button>
              <button type="submit" name="action" value="reject" class="outline" style="flex:1;">Rechazar</button>
            ` : canCounter ? `
              <button type="submit" name="action" value="counter" class="secondary" style="flex:1;">Responder</button>
            ` : `
              <p style="color:var(--pico-muted-color);">Esperando respuesta...</p>
            `}
          </div>
        </form>
      ` : ''}

      ${tx.status === 'accepted' && !tx.meetup ? `
        <form class="meetup-form" data-tx-id="${tx.id}">
          <label>Punto de encuentro / envío
            <input type="text" name="meetup" required placeholder="Dirección, punto de referencia...">
          </label>
          <button type="submit">Confirmar lugar</button>
        </form>
      ` : ''}

      ${tx.status === 'accepted' ? `
        <button class="complete-btn outline" data-tx-id="${tx.id}">Marcar como completado</button>
      ` : ''}
    </article>
  `;
}

function attachHandlers(list: HTMLElement) {
  list.querySelectorAll('.reply-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      const txId = f.dataset.txId!;
      const btn = ((e as SubmitEvent).submitter as HTMLButtonElement);
      const action = btn.value;
      const message = (f.elements.namedItem('message') as HTMLTextAreaElement).value.trim();
      if (!message && action === 'counter') return;

      btn.setAttribute('aria-busy', 'true');
      try {
        if (action === 'accept') {
          await updateTransactionStatus(txId, 'accepted');
        } else if (action === 'reject') {
          await updateTransactionStatus(txId, 'rejected');
        } else {
          await addOffer(txId, message, null, null, []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        btn.removeAttribute('aria-busy');
      }
    });
  });

  list.querySelectorAll('.meetup-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      const txId = f.dataset.txId!;
      const meetup = (f.elements.namedItem('meetup') as HTMLInputElement).value.trim();
      if (!meetup) return;
      await updateTransactionStatus(txId, 'accepted', meetup);
    });
  });

  list.querySelectorAll('.complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const txId = (btn as HTMLElement).dataset.txId!;
      await updateTransactionStatus(txId, 'completed');
    });
  });
}
