import { isSupport } from '../lib/store';
import { getAllTickets, addTicketReply, updateTicketStatus, updateTicketPriority, assignTicket } from '../lib/tickets';
import { auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';
import type { SupportTicket, TicketStatus, TicketPriority, WithId } from '../lib/types';

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
};

function formatDate(ts: any): string {
  if (!ts?.toDate) return '-';
  return ts.toDate().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function renderSupportPanel(container: HTMLElement): () => void {
  if (!isSupport()) {
    container.innerHTML = `
      <div class="container-fluid" style="text-align:center;padding:3rem 1rem;">
        <h2>Acceso denegado</h2>
        <p style="color:var(--color-text-muted);">No tienes permisos para ver esta pagina.</p>
        <a href="#feed" role="button">Volver al feed</a>
      </div>
    `;
    return () => {};
  }

  container.innerHTML = `<div class="container-fluid" style="max-width:800px;margin:0 auto;"><p aria-busy="true">Cargando tickets...</p></div>`;
  let cancelled = false;
  let currentFilter: TicketStatus | 'all' = 'all';

  async function load() {
    const tickets = await getAllTickets();
    if (cancelled) return;
    render(tickets);
  }

  function render(tickets: WithId<SupportTicket>[]) {
    const filtered = currentFilter === 'all' ? tickets : tickets.filter(t => t.status === currentFilter);
    const counts = {
      all: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
      closed: tickets.filter(t => t.status === 'closed').length,
    };

    container.innerHTML = `
      <div class="container-fluid" style="max-width:800px;margin:0 auto;padding-bottom:2rem;">
        <h2 style="margin-bottom:.25rem;">Panel de Soporte</h2>
        <small style="color:var(--color-text-muted);">${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} total</small>

        <div style="display:flex;gap:.5rem;margin:1.5rem 0 1rem;flex-wrap:wrap;">
          ${(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(f => `
            <button class="filter-btn outline${currentFilter === f ? ' active-filter' : ''}" data-filter="${f}" style="padding:.3rem .75rem;font-size:.8rem;margin:0;">
              ${f === 'all' ? 'Todos' : STATUS_LABELS[f]} (${counts[f]})
            </button>
          `).join('')}
        </div>

        ${filtered.length === 0
          ? '<p style="color:var(--color-text-muted);">No hay tickets en esta categoria.</p>'
          : filtered.map(t => ticketCard(t)).join('')}
      </div>
    `;

    // Filter buttons
    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = (btn as HTMLElement).dataset.filter as any;
        render(tickets);
      });
    });

    // Per-ticket handlers
    filtered.forEach(t => {
      // Reply form
      const replyForm = container.querySelector(`#reply-form-${t.id}`) as HTMLFormElement | null;
      replyForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textarea = replyForm.querySelector('textarea') as HTMLTextAreaElement;
        const body = textarea.value.trim();
        if (!body) return;
        const btn = replyForm.querySelector('button[type="submit"]') as HTMLButtonElement;
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        try {
          await addTicketReply(t.id, body, true);
          await load();
        } catch (err) {
          console.error('Reply error:', err);
          btn.removeAttribute('aria-busy');
          btn.disabled = false;
        }
      });

      // Status select
      const statusSel = container.querySelector(`#status-${t.id}`) as HTMLSelectElement | null;
      statusSel?.addEventListener('change', async () => {
        statusSel.disabled = true;
        try {
          await updateTicketStatus(t.id, statusSel.value as TicketStatus);
          await load();
        } catch (err) {
          console.error('Status update error:', err);
          statusSel.disabled = false;
        }
      });

      // Priority select
      const prioSel = container.querySelector(`#priority-${t.id}`) as HTMLSelectElement | null;
      prioSel?.addEventListener('change', async () => {
        prioSel.disabled = true;
        try {
          await updateTicketPriority(t.id, prioSel.value as TicketPriority);
          await load();
        } catch (err) {
          console.error('Priority update error:', err);
          prioSel.disabled = false;
        }
      });

      // Assign button
      const assignBtn = container.querySelector(`#assign-${t.id}`) as HTMLButtonElement | null;
      assignBtn?.addEventListener('click', async () => {
        assignBtn.setAttribute('aria-busy', 'true');
        assignBtn.disabled = true;
        const user = auth.currentUser!;
        try {
          await assignTicket(t.id, user.uid, user.displayName || user.email || '');
          await load();
        } catch (err) {
          console.error('Assign error:', err);
          assignBtn.removeAttribute('aria-busy');
          assignBtn.disabled = false;
        }
      });
    });
  }

  function ticketCard(t: WithId<SupportTicket>): string {
    const prioClass = t.priority === 'high' ? 'ticket-priority--high' : t.priority === 'low' ? 'ticket-priority--low' : '';
    return `
      <details class="ticket-card" style="margin-bottom:.75rem;">
        <summary style="cursor:pointer;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <span class="ticket-status ticket-status--${t.status}">${STATUS_LABELS[t.status]}</span>
          ${t.priority !== 'normal' ? `<span class="${prioClass}" style="font-size:.75rem;">${PRIORITY_LABELS[t.priority]}</span>` : ''}
          <strong style="flex:1;font-size:.95rem;">${esc(t.subject)}</strong>
          <small style="color:var(--color-text-muted);">${esc(t.creatorName)} · ${esc(t.category)} · ${formatDate(t.updatedAt)}</small>
        </summary>
        <div style="padding:.75rem 0;">
          <!-- Messages thread -->
          <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">
            ${t.messages.map(m => `
              <div class="${m.isStaff ? 'ticket-message--staff' : 'ticket-message--user'}">
                <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
                  <strong style="font-size:.8rem;">${esc(m.fromUserName)}${m.isStaff ? ' (Staff)' : ''}</strong>
                  <small style="color:var(--color-text-muted);">${formatDate(m.createdAt)}</small>
                </div>
                <p style="margin:0;font-size:.9rem;white-space:pre-wrap;">${esc(m.body)}</p>
              </div>
            `).join('')}
          </div>

          <!-- Reply -->
          <form id="reply-form-${t.id}" style="margin-bottom:.75rem;">
            <textarea rows="2" placeholder="Responder..." required style="font-size:.85rem;"></textarea>
            <button type="submit" class="secondary" style="font-size:.8rem;padding:.3rem .75rem;margin:0;">Responder</button>
          </form>

          <!-- Controls -->
          <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;">
            <label style="margin:0;font-size:.8rem;">Estado:
              <select id="status-${t.id}" style="padding:.2rem .4rem;font-size:.75rem;margin:0;display:inline;width:auto;">
                ${(['open', 'in_progress', 'resolved', 'closed'] as TicketStatus[]).map(s =>
                  `<option value="${s}"${t.status === s ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`
                ).join('')}
              </select>
            </label>
            <label style="margin:0;font-size:.8rem;">Prioridad:
              <select id="priority-${t.id}" style="padding:.2rem .4rem;font-size:.75rem;margin:0;display:inline;width:auto;">
                ${(['low', 'normal', 'high'] as TicketPriority[]).map(p =>
                  `<option value="${p}"${t.priority === p ? ' selected' : ''}>${PRIORITY_LABELS[p]}</option>`
                ).join('')}
              </select>
            </label>
            ${t.assignedTo
              ? `<small style="color:var(--color-text-muted);">Asignado a: ${esc(t.assignedName || '-')}</small>`
              : `<button id="assign-${t.id}" class="outline" style="font-size:.75rem;padding:.2rem .5rem;margin:0;">Asignarme</button>`
            }
          </div>
        </div>
      </details>
    `;
  }

  load();
  return () => { cancelled = true; };
}
