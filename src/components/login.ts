import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

export function renderLogin(container: HTMLElement) {
  container.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;">
      <!-- Title -->
      <section style="text-align:center;padding:3rem 1rem 1.5rem;max-width:500px;">
        <h1 style="font-size:2.4rem;margin-bottom:.25rem;">Swap Store</h1>
        <p style="color:var(--color-text-secondary);font-size:1.05rem;">
          Intercambia, comparte y colabora con tu comunidad.
        </p>
      </section>

      <!-- Image + Login side by side -->
      <section class="hero-row">
        <img src="/swap-home.png" alt="Intercambio comunitario" class="hero-img">
        <div class="shimmer hero-login">
          <p style="color:var(--color-text);font-size:1.1rem;font-weight:600;margin:0 0 .5rem;">Unite a la comunidad</p>
          <p style="color:var(--color-text-muted);font-size:.85rem;margin:0 0 1.5rem;">Empeza a intercambiar en segundos</p>
          <button id="google-login" class="contrast" style="width:100%;font-size:1rem;">
            <svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align:middle;margin-right:8px;">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar con Google
          </button>
          <p id="login-error" style="color:var(--pico-del-color);display:none;margin-top:1rem;"></p>
        </div>
      </section>

      <!-- About -->
      <section style="max-width:680px;width:92%;margin-top:2rem;padding-bottom:3rem;">
        <h2 style="text-align:center;font-size:1.6rem;margin-bottom:1.5rem;">Sobre Swap Store</h2>

        <article style="margin:0 0 1rem;padding:1.25rem;background:var(--color-bg-light);border:1px solid var(--color-border);">
          <h4 style="margin:0 0 .4rem;color:var(--color-coral);font-size:1.05rem;">¿Que es?</h4>
          <p style="margin:0;color:var(--color-text-secondary);font-size:.9rem;line-height:1.6;">
            Swap Store es un marketplace comunitario pensado para intercambiar productos y servicios
            entre personas de forma directa, transparente y sin intermediarios innecesarios.
            Podes comprar, vender o intercambiar usando efectivo o <strong>Gestos ✦</strong>, nuestra moneda interna.
          </p>
        </article>

        <article style="margin:0 0 1rem;padding:1.25rem;background:var(--color-bg-light);border:1px solid var(--color-border);">
          <h4 style="margin:0 0 .4rem;color:var(--color-coral);font-size:1.05rem;">¿Que son los Gestos ✦?</h4>
          <p style="margin:0;color:var(--color-text-secondary);font-size:.9rem;line-height:1.6;">
            Los gestos son la moneda de la comunidad. Cada nuevo miembro recibe <strong>✦10</strong> de bienvenida.
            Usalos para intercambiar productos y servicios sin necesidad de efectivo.
            Un gesto representa el valor de un favor, un servicio o un bien compartido.
          </p>
        </article>

        <article style="margin:0 0 1rem;padding:1.25rem;background:var(--color-bg-light);border:1px solid var(--color-border);">
          <h4 style="margin:0 0 .4rem;color:var(--color-sage);font-size:1.05rem;">¿Como funciona?</h4>
          <p style="margin:0;color:var(--color-text-secondary);font-size:.9rem;line-height:1.6;">
            <strong>1.</strong> Crea tu cuenta con Google en segundos.<br>
            <strong>2.</strong> Publica lo que ofreces: productos, servicios, habilidades.<br>
            <strong>3.</strong> Explora el feed y contacta a quien te interese.<br>
            <strong>4.</strong> Acuerden el intercambio: con efectivo, gestos o ambos.<br>
            <strong>5.</strong> Coordinen la entrega y confirmen la transaccion.
          </p>
        </article>

        <article style="margin:0;padding:1.25rem;background:var(--color-bg-light);border:1px solid var(--color-border);">
          <h4 style="margin:0 0 .4rem;color:var(--color-amber);font-size:1.05rem;">¿Que pretende?</h4>
          <p style="margin:0;color:var(--color-text-secondary);font-size:.9rem;line-height:1.6;">
            Fomentar la economia colaborativa y el intercambio entre vecinos, emprendedores y comunidades.
            Creemos que muchas veces lo que uno no necesita es exactamente lo que otro esta buscando.
            Swap Store es el puente para conectar esas necesidades de forma simple y segura.
          </p>
        </article>
      </section>
    </div>
  `;

  document.getElementById('google-login')!.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;
      const errEl = document.getElementById('login-error')!;
      errEl.textContent = `Error: ${err.message}`;
      errEl.style.display = 'block';
    }
  });
}
