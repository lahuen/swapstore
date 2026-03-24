import { createListing, updateListing, uploadListingImage, getListing } from '../lib/listings';
import { esc } from '../lib/sanitize';

export function renderListingForm(container: HTMLElement, editId?: string): (() => void) | void {
  container.innerHTML = `
    <div class="container" style="max-width:600px;">
      <h2>${editId ? 'Editar' : 'Nueva'} publicación</h2>
      <form id="listing-form">
        <label>Título
          <input type="text" name="title" required maxlength="100" placeholder="Ej: Clases de guitarra, Bicicleta rodado 26...">
        </label>

        <label>Descripción
          <textarea name="description" required rows="3" maxlength="1000" placeholder="Describe lo que ofreces..."></textarea>
        </label>

        <fieldset class="grid">
          <label>Tipo
            <select name="type" required>
              <option value="product">Producto</option>
              <option value="service">Servicio</option>
            </select>
          </label>
          <label>Categoría
            <select name="category">
              <option value="general">General</option>
              <option value="tech">Tecnología</option>
              <option value="hogar">Hogar</option>
              <option value="ropa">Ropa</option>
              <option value="servicios">Servicios</option>
              <option value="educacion">Educación</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </fieldset>

        <fieldset class="grid">
          <label>Modo de pago
            <select name="priceMode" required id="price-mode">
              <option value="both">Efectivo o Gestos ✦</option>
              <option value="cash">Solo efectivo</option>
              <option value="swap">Intercambio con gestos ✦</option>
            </select>
          </label>
          <label id="price-label">Precio ($)
            <input type="number" name="cashPrice" min="0" step="100" placeholder="0">
          </label>
        </fieldset>

        <label>¿Qué te gustaría recibir a cambio? (opcional)
          <input type="text" name="swapHint" maxlength="200" placeholder="Ej: Clases de idiomas, ayuda con mudanza, herramientas...">
        </label>

        <label>Ubicación
          <input type="text" name="location" maxlength="100" placeholder="Ej: CABA, Córdoba...">
        </label>

        <label>Imágenes (hasta 3)
          <input type="file" name="images" accept="image/*" multiple id="img-input">
        </label>
        <div id="img-preview" style="display:flex;gap:.5rem;margin-bottom:1rem;"></div>

        <div style="display:flex;gap:1rem;">
          <button type="submit">Publicar</button>
          <button type="button" class="secondary" id="cancel-btn">Cancelar</button>
        </div>
        <p id="form-error" style="color:var(--pico-del-color);display:none;"></p>
      </form>
    </div>
  `;

  const form = document.getElementById('listing-form') as HTMLFormElement;
  const priceMode = document.getElementById('price-mode') as HTMLSelectElement;
  const priceLabel = document.getElementById('price-label')!;
  const imgInput = document.getElementById('img-input') as HTMLInputElement;
  const imgPreview = document.getElementById('img-preview')!;
  const errorEl = document.getElementById('form-error')!;

  // Toggle price field visibility
  function togglePrice() {
    priceLabel.style.display = priceMode.value === 'swap' ? 'none' : '';
  }
  priceMode.addEventListener('change', togglePrice);
  togglePrice();

  // Image preview
  imgInput.addEventListener('change', () => {
    imgPreview.innerHTML = '';
    const files = Array.from(imgInput.files || []).slice(0, 3);
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      imgPreview.innerHTML += `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:var(--pico-border-radius);">`;
    });
  });

  // Load existing data if editing
  if (editId) {
    getListing(editId).then(l => {
      if (!l) return;
      (form.elements.namedItem('title') as HTMLInputElement).value = l.title;
      (form.elements.namedItem('description') as HTMLTextAreaElement).value = l.description;
      (form.elements.namedItem('type') as HTMLSelectElement).value = l.type;
      (form.elements.namedItem('category') as HTMLSelectElement).value = l.category;
      priceMode.value = l.priceMode;
      togglePrice();
      if (l.cashPrice) (form.elements.namedItem('cashPrice') as HTMLInputElement).value = String(l.cashPrice);
      (form.elements.namedItem('swapHint') as HTMLInputElement).value = l.swapHint || '';
      (form.elements.namedItem('location') as HTMLInputElement).value = l.location || '';
      if (l.images?.length) {
        imgPreview.innerHTML = l.images.map(u => `<img src="${esc(u)}" style="width:80px;height:80px;object-fit:cover;border-radius:var(--pico-border-radius);">`).join('');
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.setAttribute('aria-busy', 'true');

    try {
      const fd = new FormData(form);
      const data = {
        title: (fd.get('title') as string).trim(),
        description: (fd.get('description') as string).trim(),
        type: fd.get('type') as 'product' | 'service',
        category: fd.get('category') as string,
        priceMode: fd.get('priceMode') as 'cash' | 'swap' | 'both',
        cashPrice: fd.get('priceMode') === 'swap' ? null : Number(fd.get('cashPrice')) || null,
        swapHint: (fd.get('swapHint') as string || '').trim(),
        location: (fd.get('location') as string || '').trim(),
        images: [] as string[],
      };

      if (editId) {
        // Upload new images if provided
        const files = Array.from(imgInput.files || []).slice(0, 3);
        if (files.length) {
          for (const file of files) {
            const url = await uploadListingImage(file, editId);
            data.images.push(url);
          }
        }
        await updateListing(editId, data);
      } else {
        const id = await createListing(data);
        // Upload images
        const files = Array.from(imgInput.files || []).slice(0, 3);
        if (files.length) {
          const urls: string[] = [];
          for (const file of files) {
            const url = await uploadListingImage(file, id);
            urls.push(url);
          }
          await updateListing(id, { images: urls });
        }
      }

      window.location.hash = '#feed';
    } catch (err: any) {
      errorEl.textContent = `Error: ${err.message}`;
      errorEl.style.display = 'block';
    } finally {
      btn.removeAttribute('aria-busy');
    }
  });

  document.getElementById('cancel-btn')!.addEventListener('click', () => {
    window.location.hash = '#feed';
  });
}
