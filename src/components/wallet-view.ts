import { getProfile, getConfig, subscribe } from '../lib/store';
import { getWalletHistory } from '../lib/wallet';
import { auth } from '../lib/firebase';
import { esc } from '../lib/sanitize';

export function renderWalletView(container: HTMLElement): (() => void) | void {
  container.innerHTML = `
    <div class="container" style="max-width:600px;">
      <h2>Mis gestos</h2>
      <article id="wallet-summary" style="text-align:center;padding:2rem;">
        <p style="color:var(--pico-muted-color);margin-bottom:.25rem;">Tu saldo</p>
        <p style="font-size:2.5rem;font-weight:600;margin:0;" id="wallet-balance">--</p>
        <p style="color:var(--pico-muted-color);margin-top:.25rem;">Gestos</p>
      </article>
      <div id="wallet-info" style="background:var(--color-bg-light);padding:1rem;border-radius:var(--pico-border-radius);margin-bottom:1.5rem;"></div>
      <h3>Movimientos</h3>
      <div id="wallet-history"><p aria-busy="true">Cargando...</p></div>
    </div>
  `;

  function updateInfo() {
    const p = getProfile();
    const cfg = getConfig();
    const el = document.getElementById('wallet-balance');
    if (el) el.textContent = `✦${p?.walletBalance ?? 0}`;

    const infoEl = document.getElementById('wallet-info');
    if (infoEl) {
      const rate = p?.verified ? cfg.commissionVerified : cfg.commissionUnverified;
      const pct = (rate * 100).toFixed(1);
      const arsValue = (p?.walletBalance ?? 0) * cfg.gestoValueARS;
      infoEl.innerHTML = `<small>
        <strong>¿Qué son los Gestos?</strong><br>
        Los Gestos (✦) son la moneda de la comunidad. Cada ✦1 = $${cfg.gestoValueARS.toLocaleString('es-AR')} ARS.<br>
        Tu saldo equivale a ~<strong>$${arsValue.toLocaleString('es-AR')}</strong>.<br>
        Comisión por intercambio: <strong>${pct}%</strong>${!p?.verified ? ' · <a href="#profile">Verificá tu cuenta</a> para menor comisión' : ' (verificado)'}
      </small>`;
    }
  }

  const unsub = subscribe(updateInfo, ['profile', 'config']);
  updateInfo();

  const uid = auth.currentUser?.uid;
  if (uid) {
    getWalletHistory(uid).then(entries => {
      const historyEl = document.getElementById('wallet-history')!;
      if (!entries.length) {
        historyEl.innerHTML = `<p style="color:var(--pico-muted-color);">Aún no tienes movimientos. Empieza a intercambiar con tu comunidad.</p>`;
        return;
      }
      historyEl.innerHTML = `<table role="grid">
        <thead><tr><th>Tipo</th><th>Monto</th><th>Detalle</th></tr></thead>
        <tbody>
          ${entries.map(e => {
            const typeLabel: Record<string, string> = {
              topup: 'Carga', swap_in: 'Recibiste gestos', swap_out: 'Compartiste gestos',
              commission: 'Comisión', bonus: 'Bienvenida',
            };
            const color = e.amount >= 0 ? 'var(--pico-ins-color)' : 'var(--pico-del-color)';
            return `<tr>
              <td><small>${typeLabel[e.type] || e.type}</small></td>
              <td style="color:${color};font-weight:500;">${e.amount >= 0 ? '+' : ''}✦${Math.abs(e.amount)}</td>
              <td><small>${esc(e.description)}</small></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    }).catch(() => {
      document.getElementById('wallet-history')!.innerHTML = `<p>Error cargando movimientos.</p>`;
    });
  }

  return unsub;
}
