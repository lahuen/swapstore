import { signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { subscribe, getProfile, getConfig, isAdmin, isSupport } from '../lib/store';
import { esc } from '../lib/sanitize';
import { validateCuit } from '../lib/cuit';
import { createTicket, addTicketReply, getMyTickets } from '../lib/tickets';
import type { SupportTicket, WithId } from '../lib/types';

export function renderProfile(container: HTMLElement): () => void {
  const user = auth.currentUser!;

  function render() {
    const p = getProfile();
    const cfg = getConfig();
    const photo = user.photoURL;
    const verified = p?.verified ?? false;
    const rate = verified ? cfg.commissionVerified : cfg.commissionUnverified;
    const pct = (rate * 100).toFixed(1);

    container.innerHTML = `
      <div class="container-fluid" style="max-width:520px;margin:0 auto;padding-bottom:2rem;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          ${photo ? `<img src="${esc(photo)}" alt="" style="width:72px;height:72px;border-radius:50%;margin-bottom:.5rem;">` : ''}
          <h2 style="margin:0;">Mi perfil</h2>
          <small style="color:var(--color-text-muted);">${esc(user.email || '')}</small>
        </div>

        <form id="profile-form">
          <label for="pf-first">Nombre</label>
          <input type="text" id="pf-first" name="firstName" required placeholder="Tu nombre" autocomplete="given-name" value="${esc(p?.firstName || '')}">

          <label for="pf-last">Apellido</label>
          <input type="text" id="pf-last" name="lastName" required placeholder="Tu apellido" autocomplete="family-name" value="${esc(p?.lastName || '')}">

          <label for="pf-cuit">CUIT / CUIL</label>
          <input type="text" id="pf-cuit" name="cuit" placeholder="20-12345678-9" inputmode="numeric" autocomplete="off" value="${esc(p?.cuit || '')}">
          <small id="cuit-feedback" style="display:block;margin-top:-.5rem;margin-bottom:1rem;color:var(--color-text-muted);">
            Se valida contra ARCA/AFIP. Completalo para verificar tu identidad.
          </small>

          <label for="pf-location">Ubicacion</label>
          <input type="text" id="pf-location" name="location" placeholder="Ej: Palermo, CABA" value="${esc(p?.location || '')}">

          <label for="pf-bio">Bio</label>
          <textarea id="pf-bio" name="bio" rows="3" placeholder="Conta algo sobre vos o lo que ofreces...">${esc(p?.bio || '')}</textarea>

          <!-- Verification status -->
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;padding:.75rem;background:var(--color-bg-light);border-radius:var(--pico-border-radius);border:1px solid var(--color-border);">
            <span style="font-size:1.2rem;">${verified ? '✅' : '⏳'}</span>
            <div>
              <strong style="display:block;font-size:.9rem;">${verified ? 'Cuenta verificada' : 'Verificacion pendiente'}</strong>
              <small style="color:var(--color-text-muted);">
                ${verified
                  ? `Tu identidad fue validada. Comision: ${pct}%.`
                  : `Completa nombre y CUIT. Un admin verificara tus datos. Comision actual: ${pct}%.`}
              </small>
            </div>
          </div>

          <button type="submit" style="width:100%;">Guardar cambios</button>
          <p id="pf-msg" style="display:none;margin-top:.75rem;text-align:center;"></p>
        </form>

        <hr style="margin:1.5rem 0;">

        <!-- Create ticket -->
        <details>
          <summary style="cursor:pointer;font-weight:600;">Ayuda y soporte</summary>
          <div style="margin-top:.75rem;">
            <p style="font-size:.9rem;color:var(--color-text-secondary);">
              Si tenes algun problema con tu cuenta, una transaccion o necesitas ayuda, crea un ticket.
            </p>
            <form id="support-form">
              <label for="ticket-subject">Asunto</label>
              <input type="text" id="ticket-subject" name="subject" placeholder="Breve descripcion del problema" required>
              <label for="ticket-category">Categoria</label>
              <select id="ticket-category" name="category">
                <option value="general">General</option>
                <option value="account">Mi cuenta</option>
                <option value="transaction">Transaccion</option>
                <option value="listing">Publicacion</option>
              </select>
              <label for="ticket-body">Mensaje</label>
              <textarea id="ticket-body" name="body" rows="3" placeholder="Describe tu consulta o problema..." required></textarea>
              <button type="submit" class="secondary" style="width:100%;">Enviar consulta</button>
              <p id="support-msg" style="display:none;margin-top:.5rem;text-align:center;font-size:.9rem;"></p>
            </form>
          </div>
        </details>

        <!-- My tickets -->
        <div id="my-tickets" style="margin-top:1rem;"></div>

        <hr style="margin:1.5rem 0;">
        <div style="display:flex;flex-direction:column;gap:.5rem;">
          ${isSupport() ? '<a href="#support">Panel de soporte</a>' : ''}
          ${isAdmin() ? '<a href="#admin">Panel de administracion</a>' : ''}
          <a href="#" id="profile-logout" style="color:var(--color-text-muted);font-size:.9rem;">Cerrar sesion</a>
        </div>
      </div>
    `;

    // CUIT live validation
    const cuitInput = document.getElementById('pf-cuit') as HTMLInputElement;
    const cuitFeedback = document.getElementById('cuit-feedback')!;
    cuitInput.addEventListener('input', () => {
      const raw = cuitInput.value.trim();
      if (!raw) {
        cuitFeedback.textContent = 'Se valida contra ARCA/AFIP. Completalo para verificar tu identidad.';
        cuitFeedback.style.color = 'var(--color-text-muted)';
        return;
      }
      const { valid, formatted } = validateCuit(raw);
      if (valid) {
        cuitFeedback.textContent = `✓ CUIT valido: ${formatted}`;
        cuitFeedback.style.color = 'var(--color-sage)';
      } else {
        const digits = raw.replace(/\D/g, '');
        cuitFeedback.textContent = digits.length < 11 ? `Ingresa 11 digitos (${digits.length}/11)` : '✗ CUIT invalido — revisa los numeros';
        cuitFeedback.style.color = digits.length < 11 ? 'var(--color-text-muted)' : 'var(--pico-del-color)';
      }
    });

    // Profile form
    const form = document.getElementById('profile-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;

      const firstName = (form.elements.namedItem('firstName') as HTMLInputElement).value.trim();
      const lastName = (form.elements.namedItem('lastName') as HTMLInputElement).value.trim();
      const cuit = (form.elements.namedItem('cuit') as HTMLInputElement).value.trim();
      const location = (form.elements.namedItem('location') as HTMLInputElement).value.trim();
      const bio = (form.elements.namedItem('bio') as HTMLTextAreaElement).value.trim();

      // Validate CUIT if provided
      if (cuit) {
        const { valid } = validateCuit(cuit);
        if (!valid) {
          showMsg('pf-msg', 'El CUIT/CUIL no es valido', true);
          btn.removeAttribute('aria-busy');
          btn.disabled = false;
          return;
        }
      }

      try {
        await setDoc(doc(db, 'users', user.uid), {
          firstName,
          lastName,
          cuit: cuit ? validateCuit(cuit).formatted : '',
          location,
          bio,
          displayName: `${firstName} ${lastName}`.trim() || p?.displayName || '',
        }, { merge: true });
        showMsg('pf-msg', 'Datos guardados', false);
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      } catch (err: any) {
        showMsg('pf-msg', `Error: ${err.message}`, true);
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    });

    // Support form — create ticket
    const supportForm = document.getElementById('support-form') as HTMLFormElement;
    supportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = supportForm.querySelector('button[type="submit"]') as HTMLButtonElement;
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      const subject = (supportForm.elements.namedItem('subject') as HTMLInputElement).value.trim();
      const category = (supportForm.elements.namedItem('category') as HTMLSelectElement).value as any;
      const body = (supportForm.elements.namedItem('body') as HTMLTextAreaElement).value.trim();
      try {
        await createTicket({ subject, category, body });
        showMsg('support-msg', 'Ticket creado. Te responderemos pronto.', false);
        (supportForm.elements.namedItem('subject') as HTMLInputElement).value = '';
        (supportForm.elements.namedItem('body') as HTMLTextAreaElement).value = '';
        loadMyTickets();
      } catch (err: any) {
        showMsg('support-msg', `Error: ${err.message}`, true);
      }
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    });

    // Logout from profile
    document.getElementById('profile-logout')?.addEventListener('click', (e) => {
      e.preventDefault();
      signOut(auth);
    });

    // Load user's tickets
    loadMyTickets();
  }

  async function loadMyTickets() {
    const ticketsDiv = document.getElementById('my-tickets');
    if (!ticketsDiv) return;
    try {
      const tickets = await getMyTickets();
      if (tickets.length === 0) {
        ticketsDiv.innerHTML = '';
        return;
      }
      ticketsDiv.innerHTML = `
        <h3 style="font-size:1.1rem;margin-bottom:.75rem;">Mis consultas (${tickets.length})</h3>
        ${tickets.map(t => renderTicketItem(t)).join('')}
      `;
      // Bind reply forms
      tickets.forEach(t => {
        const form = ticketsDiv.querySelector(`#ticket-reply-${t.id}`) as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
          const body = textarea.value.trim();
          if (!body) return;
          const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
          btn.setAttribute('aria-busy', 'true');
          btn.disabled = true;
          try {
            await addTicketReply(t.id, body, false);
            textarea.value = '';
            loadMyTickets();
          } catch (err: any) {
            console.error('Reply error:', err);
          }
          btn.removeAttribute('aria-busy');
          btn.disabled = false;
        });
      });
    } catch {
      // silently ignore
    }
  }

  function renderTicketItem(t: WithId<SupportTicket>): string {
    const statusLabels: Record<string, string> = { open: 'Abierto', in_progress: 'En progreso', resolved: 'Resuelto', closed: 'Cerrado' };
    const fmtDate = (ts: any) => ts?.toDate ? ts.toDate().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
    return `
      <details style="margin-bottom:.5rem;">
        <summary style="cursor:pointer;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-size:.9rem;">
          <span class="ticket-status ticket-status--${t.status}">${statusLabels[t.status] || t.status}</span>
          <strong style="flex:1;">${esc(t.subject)}</strong>
          <small style="color:var(--color-text-muted);">${fmtDate(t.updatedAt)}</small>
        </summary>
        <div style="padding:.5rem 0;">
          ${t.messages.map(m => `
            <div class="${m.isStaff ? 'ticket-message--staff' : 'ticket-message--user'}">
              <div style="display:flex;justify-content:space-between;margin-bottom:.15rem;">
                <strong style="font-size:.75rem;">${esc(m.fromUserName)}${m.isStaff ? ' (Staff)' : ''}</strong>
                <small style="color:var(--color-text-muted);font-size:.7rem;">${fmtDate(m.createdAt)}</small>
              </div>
              <p style="margin:0;font-size:.85rem;white-space:pre-wrap;">${esc(m.body)}</p>
            </div>
          `).join('')}
          ${t.status !== 'closed' && t.status !== 'resolved' ? `
            <form id="ticket-reply-${t.id}" style="margin-top:.5rem;">
              <textarea rows="2" placeholder="Responder..." required style="font-size:.8rem;"></textarea>
              <button type="submit" class="outline" style="font-size:.75rem;padding:.25rem .5rem;margin:0;">Enviar</button>
            </form>
          ` : ''}
        </div>
      </details>
    `;
  }

  const unsub = subscribe(render, ['profile', 'config']);
  render();
  return unsub;
}

function showMsg(id: string, text: string, isError: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--pico-del-color)' : 'var(--color-sage)';
  el.style.display = 'block';
  if (!isError) setTimeout(() => { el.style.display = 'none'; }, 3000);
}
