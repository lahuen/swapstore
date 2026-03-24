import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';
import { isAdmin } from '../lib/store';
import { DEFAULT_CONFIG } from '../lib/types';
import type { UserProfile, Listing, Transaction, Report, PlatformConfig, UserRole, WithId, OfferStatus } from '../lib/types';

interface DashboardData {
  users: WithId<UserProfile>[];
  listings: WithId<Listing>[];
  transactions: WithId<Transaction>[];
  reports: WithId<Report>[];
  config: PlatformConfig;
}

async function fetchDashboardData(): Promise<DashboardData> {
  const [usersSnap, listingsSnap, txSnap, reportsSnap, configSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, 'listings'), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, 'transactions'), orderBy('updatedAt', 'desc'))),
    getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'))),
    getDoc(doc(db, 'config', 'platform')),
  ]);

  return {
    users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>)),
    listings: listingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Listing>)),
    transactions: txSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Transaction>)),
    reports: reportsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Report>)),
    config: configSnap.exists() ? { ...DEFAULT_CONFIG, ...configSnap.data() } as PlatformConfig : { ...DEFAULT_CONFIG },
  };
}

function isThisMonth(ts: Timestamp | undefined): boolean {
  if (!ts) return false;
  const d = ts.toDate();
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function statusLabel(s: OfferStatus): string {
  const labels: Record<OfferStatus, string> = {
    proposed: 'Propuesta',
    countered: 'En negociacion',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    completed: 'Completada',
  };
  return labels[s] || s;
}

function statusColor(s: OfferStatus): string {
  switch (s) {
    case 'proposed': return 'var(--color-amber)';
    case 'countered': return 'var(--color-coral)';
    case 'accepted': return 'var(--color-sage)';
    case 'completed': return 'var(--color-sage)';
    case 'rejected': return '#b44a3e';
    default: return 'var(--color-text-muted)';
  }
}

function formatDate(ts: Timestamp | undefined): string {
  if (!ts) return '-';
  return ts.toDate().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderDashboardContent(container: HTMLElement, data: DashboardData): void {
  const { users, listings, transactions, reports, config: cfg } = data;

  // --- Users metrics ---
  const totalUsers = users.length;
  const verifiedUsers = users.filter(u => u.verified).length;
  const suspendedUsers = users.filter(u => u.suspended).length;
  const pendingReports = reports.filter(r => r.status === 'pending');
  const newUsersThisMonth = users.filter(u => isThisMonth(u.createdAt)).length;
  const totalGestos = users.reduce((sum, u) => sum + (u.walletBalance || 0), 0);

  // --- Listings metrics ---
  const activeListings = listings.filter(l => l.status === 'active');
  const totalActive = activeListings.length;
  const products = activeListings.filter(l => l.type === 'product').length;
  const services = activeListings.filter(l => l.type === 'service').length;
  const modeCash = activeListings.filter(l => l.priceMode === 'cash').length;
  const modeSwap = activeListings.filter(l => l.priceMode === 'swap').length;
  const modeBoth = activeListings.filter(l => l.priceMode === 'both').length;

  // --- Transaction metrics ---
  const totalTx = transactions.length;
  const countByStatus = (s: OfferStatus) => transactions.filter(t => t.status === s).length;
  const commissionGestos = transactions.reduce((sum, t) => sum + (t.commissionUt || 0), 0);
  const commissionCash = transactions.reduce((sum, t) => sum + (t.commissionCash || 0), 0);

  const recent = transactions.slice(0, 10);

  container.innerHTML = `
    <div class="container-fluid" style="max-width:960px;margin:0 auto;padding-bottom:2rem;">
      <h2 style="margin-bottom:.25rem;">Panel de Administracion</h2>
      <small style="color:var(--color-text-muted);">Vista general del marketplace</small>

      <!-- Platform config (collapsed) -->
      <details style="margin-top:2rem;">
        <summary style="cursor:pointer;font-weight:600;font-size:1.2rem;color:var(--color-coral);margin-bottom:.75rem;">Configuracion de la plataforma</summary>
        <article style="padding:1.25rem;margin:0;">
          <form id="config-form">
          <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:1rem;">
            <div>
              <label for="cfg-gesto-ars">Valor del Gesto (ARS)</label>
              <input type="number" id="cfg-gesto-ars" name="gestoValueARS" min="1" step="100" value="${cfg.gestoValueARS}" required>
              <small style="color:var(--color-text-muted);">✦1 = $${cfg.gestoValueARS.toLocaleString('es-AR')}</small>
            </div>
            <div>
              <label for="cfg-comm-ver">Comision verificados (%)</label>
              <input type="number" id="cfg-comm-ver" name="commissionVerified" min="0" max="100" step="0.1" value="${(cfg.commissionVerified * 100).toFixed(1)}" required>
              <small style="color:var(--color-text-muted);">Actualmente ${(cfg.commissionVerified * 100).toFixed(1)}%</small>
            </div>
            <div>
              <label for="cfg-comm-unver">Comision no verificados (%)</label>
              <input type="number" id="cfg-comm-unver" name="commissionUnverified" min="0" max="100" step="0.1" value="${(cfg.commissionUnverified * 100).toFixed(1)}" required>
              <small style="color:var(--color-text-muted);">Actualmente ${(cfg.commissionUnverified * 100).toFixed(1)}%</small>
            </div>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;margin-top:.75rem;">
            <button type="submit" style="margin:0;width:auto;">Guardar configuracion</button>
            <span id="cfg-msg" style="display:none;font-size:.85rem;"></span>
          </div>
        </form>
        </article>
      </details>

      <!-- Users section -->
      <h3 style="margin-top:2rem;margin-bottom:.75rem;font-size:1.2rem;color:var(--color-coral);">Comunidad</h3>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:1rem;">
        <article style="text-align:center;padding:1.25rem;margin:0;">
          <div style="font-size:2rem;font-weight:700;color:var(--color-text);">${totalUsers}</div>
          <small style="color:var(--color-text-muted);">Registrados</small>
        </article>
        <article style="text-align:center;padding:1.25rem;margin:0;">
          <div style="font-size:2rem;font-weight:700;color:var(--color-sage);">${verifiedUsers}</div>
          <small style="color:var(--color-text-muted);">Verificados</small>
        </article>
        <article style="text-align:center;padding:1.25rem;margin:0;">
          <div style="font-size:2rem;font-weight:700;color:var(--color-sage);">${newUsersThisMonth}</div>
          <small style="color:var(--color-text-muted);">Nuevos este mes</small>
        </article>
        <article style="text-align:center;padding:1.25rem;margin:0;">
          <div style="font-size:2rem;font-weight:700;color:var(--color-coral);">${totalGestos.toFixed(1)}</div>
          <small style="color:var(--color-text-muted);">✦ en circulacion</small>
        </article>
      </div>

      <!-- Users table (verification + suspension management) -->
      <details style="margin-top:1rem;">
        <summary style="cursor:pointer;font-weight:600;">Gestionar usuarios (${users.length})${suspendedUsers ? ` · <span style="color:#b44a3e;">${suspendedUsers} suspendido${suspendedUsers > 1 ? 's' : ''}</span>` : ''}</summary>
        <div style="overflow-x:auto;margin-top:.5rem;">
          <table role="grid" style="margin:0;">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>CUIT</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>✦ Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr${u.suspended ? ' style="opacity:0.6;"' : ''}>
                  <td>${esc((u.firstName || '') + ' ' + (u.lastName || '') || u.displayName || '-')}</td>
                  <td><small>${esc(u.email || '-')}</small></td>
                  <td><small>${esc(u.cuit || '-')}</small></td>
                  <td>
                    <select class="role-select" data-uid="${u.id}" style="padding:.2rem .4rem;font-size:.7rem;margin:0;min-width:5rem;">
                      ${(['people', 'store', 'support', 'admin'] as UserRole[]).map(r =>
                        `<option value="${r}"${(u.role || 'people') === r ? ' selected' : ''}>${r}</option>`
                      ).join('')}
                    </select>
                  </td>
                  <td>
                    ${u.suspended
                      ? '<span style="color:#b44a3e;font-weight:600;">Suspendido</span>'
                      : u.verified
                        ? '<span style="color:var(--color-sage);">Verificado</span>'
                        : '<span style="color:var(--color-text-muted);">Sin verificar</span>'}
                  </td>
                  <td>✦${u.walletBalance ?? 0}</td>
                  <td style="white-space:nowrap;">
                    <button class="verify-btn outline" data-uid="${u.id}" data-field="verified" data-current="${u.verified ? 'true' : 'false'}" style="padding:.25rem .5rem;font-size:.7rem;margin:0 .25rem 0 0;">
                      ${u.verified ? 'Quitar verif.' : 'Verificar'}
                    </button>
                    <button class="suspend-btn outline" data-uid="${u.id}" data-field="suspended" data-current="${u.suspended ? 'true' : 'false'}" style="padding:.25rem .5rem;font-size:.7rem;margin:0;${u.suspended ? 'color:var(--color-sage);border-color:var(--color-sage);' : 'color:#b44a3e;border-color:#b44a3e;'}">
                      ${u.suspended ? 'Reactivar' : 'Suspender'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>

      <!-- Listings section -->
      <h3 style="margin-top:2rem;margin-bottom:.75rem;font-size:1.2rem;color:var(--color-coral);">Publicaciones</h3>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:1rem;">
        <article style="padding:1.25rem;margin:0;">
          <div style="font-size:2rem;font-weight:700;color:var(--color-text);">${totalActive}</div>
          <small style="color:var(--color-text-muted);">Activas (de ${listings.length} total)</small>
          <hr style="margin:.75rem 0;">
          <div style="display:flex;justify-content:space-between;">
            <span>Productos</span><strong>${products}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Servicios</span><strong>${services}</strong>
          </div>
        </article>
        <article style="padding:1.25rem;margin:0;">
          <div style="font-size:1rem;font-weight:600;margin-bottom:.5rem;">Por modo</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span>Efectivo</span><strong>${modeCash}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span>Intercambio</span><strong>${modeSwap}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Ambos</span><strong>${modeBoth}</strong>
          </div>
        </article>
      </div>

      <!-- Transactions section -->
      <h3 style="margin-top:2rem;margin-bottom:.75rem;font-size:1.2rem;color:var(--color-coral);">Actividad</h3>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:1rem;">
        <article style="padding:1.25rem;margin:0;">
          <div style="font-size:2rem;font-weight:700;color:var(--color-text);">${totalTx}</div>
          <small style="color:var(--color-text-muted);">Total transacciones</small>
          <hr style="margin:.75rem 0;">
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span style="color:var(--color-amber);">Propuestas</span><strong>${countByStatus('proposed')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span style="color:var(--color-coral);">En negociacion</span><strong>${countByStatus('countered')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span style="color:var(--color-sage);">Aceptadas</span><strong>${countByStatus('accepted')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span style="color:var(--color-sage);">Completadas</span><strong>${countByStatus('completed')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#b44a3e;">Rechazadas</span><strong>${countByStatus('rejected')}</strong>
          </div>
        </article>
        <article style="padding:1.25rem;margin:0;">
          <div style="font-size:1rem;font-weight:600;margin-bottom:.5rem;">Comisiones acumuladas</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.25rem;">
            <span>Gestos</span><strong style="color:var(--color-coral);">✦${commissionGestos.toFixed(2)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Efectivo</span><strong style="color:var(--color-sage);">$${commissionCash.toLocaleString('es-CL')}</strong>
          </div>
          <hr style="margin:.75rem 0;">
          <div style="display:flex;justify-content:space-between;">
            <span>✦ en ARS</span><strong>$${(commissionGestos * cfg.gestoValueARS).toLocaleString('es-AR')}</strong>
          </div>
        </article>
      </div>

      <!-- Support tickets link -->
      <div style="margin-top:2rem;">
        <a href="#support" role="button" class="outline" style="width:auto;">
          Ver tickets de soporte${pendingReports.length > 0 ? ` (${pendingReports.length} reportes legacy pendientes)` : ''}
        </a>
      </div>

      <!-- Recent activity feed -->
      <h3 style="margin-top:2rem;margin-bottom:.75rem;font-size:1.2rem;color:var(--color-coral);">Actividad reciente</h3>
      ${recent.length === 0
        ? '<p style="color:var(--color-text-muted);">No hay transacciones aun.</p>'
        : `
        <div style="overflow-x:auto;">
          <table role="grid" style="margin:0;">
            <thead>
              <tr>
                <th scope="col">Publicacion</th>
                <th scope="col">Comprador</th>
                <th scope="col">Vendedor</th>
                <th scope="col">Estado</th>
                <th scope="col">Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${recent.map(tx => `
                <tr>
                  <td>${esc(tx.listingTitle || '-')}</td>
                  <td>${esc(tx.buyerName || '-')}</td>
                  <td>${esc(tx.sellerName || '-')}</td>
                  <td><span style="color:${statusColor(tx.status)};font-weight:600;font-size:.85rem;">${statusLabel(tx.status)}</span></td>
                  <td style="white-space:nowrap;">${formatDate(tx.updatedAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  // --- Config form handler ---
  const configForm = document.getElementById('config-form') as HTMLFormElement;
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = configForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    const msgEl = document.getElementById('cfg-msg')!;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const gestoValueARS = Number((configForm.elements.namedItem('gestoValueARS') as HTMLInputElement).value);
    const commissionVerified = Number((configForm.elements.namedItem('commissionVerified') as HTMLInputElement).value) / 100;
    const commissionUnverified = Number((configForm.elements.namedItem('commissionUnverified') as HTMLInputElement).value) / 100;

    try {
      await setDoc(doc(db, 'config', 'platform'), { gestoValueARS, commissionVerified, commissionUnverified });
      msgEl.textContent = 'Guardado';
      msgEl.style.color = 'var(--color-sage)';
      msgEl.style.display = 'inline';
      setTimeout(() => { msgEl.style.display = 'none'; }, 2500);
    } catch (err: any) {
      msgEl.textContent = `Error: ${err.message}`;
      msgEl.style.color = 'var(--pico-del-color)';
      msgEl.style.display = 'inline';
    }
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  });

  // --- Verify / Suspend user buttons ---
  container.querySelectorAll('.verify-btn, .suspend-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = btn as HTMLButtonElement;
      const uid = el.dataset.uid!;
      const field = el.dataset.field!;
      const current = el.dataset.current === 'true';
      el.setAttribute('aria-busy', 'true');
      el.disabled = true;
      try {
        await updateDoc(doc(db, 'users', uid), { [field]: !current });
        const data = await fetchDashboardData();
        renderDashboardContent(container, data);
      } catch (err) {
        console.error('User toggle error:', err);
        el.removeAttribute('aria-busy');
        el.disabled = false;
      }
    });
  });

  // --- Role select handler ---
  container.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const el = sel as HTMLSelectElement;
      const uid = el.dataset.uid!;
      const newRole = el.value as UserRole;
      el.disabled = true;
      try {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
      } catch (err) {
        console.error('Role update error:', err);
        const data = await fetchDashboardData();
        renderDashboardContent(container, data);
      }
      el.disabled = false;
    });
  });
}

export function renderAdminDashboard(container: HTMLElement): () => void {
  if (!isAdmin()) {
    container.innerHTML = `
      <div class="container-fluid" style="text-align:center;padding:3rem 1rem;">
        <h2>Acceso denegado</h2>
        <p style="color:var(--color-text-muted);">No tienes permisos para ver esta pagina.</p>
        <a href="#feed" role="button">Volver al feed</a>
      </div>
    `;
    return () => {};
  }

  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:40vh;">
      <p aria-busy="true">Cargando datos del dashboard...</p>
    </div>
  `;

  let cancelled = false;

  fetchDashboardData()
    .then(data => {
      if (!cancelled) renderDashboardContent(container, data);
    })
    .catch(err => {
      console.error('Admin dashboard error:', err);
      if (!cancelled) {
        container.innerHTML = `
          <div class="container-fluid" style="text-align:center;padding:3rem 1rem;">
            <h2>Error</h2>
            <p style="color:var(--color-text-muted);">No se pudieron cargar los datos. Revisa los permisos de Firestore.</p>
            <pre style="text-align:left;background:var(--color-bg-light);padding:1rem;border-radius:.5rem;font-size:.8rem;overflow:auto;">${esc(String(err))}</pre>
            <a href="#feed" role="button" style="margin-top:1rem;">Volver al feed</a>
          </div>
        `;
      }
    });

  return () => { cancelled = true; };
}
