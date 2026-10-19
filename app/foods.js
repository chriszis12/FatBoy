/* ==========================================================================
   Food search and barcodes (Open Food Facts)
   ========================================================================== */
const OFF_URL = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,brands,nutriments';
const foodFind = { status: 'idle', results: [], message: '', controller: null };

function foodFromProduct(product) {
  const n = product?.nutriments || {};
  const kcal = Number(n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : NaN));
  const name = cleanText(product?.product_name, 60);
  if (!name || !(kcal >= 0 && kcal <= 900)) return null;
  const brand = cleanText(String(product.brands || '').split(',')[0], 30);
  const per100 = key => Math.max(0, Number(n[`${key}_100g`]) || 0);
  return { code: String(product.code || ''), name, brand, kcal100: Math.round(kcal), p100: per100('proteins'), c100: per100('carbohydrates'), f100: per100('fat') };
}

async function requestFoods(path, signal) {
  const response = await fetch(`${OFF_URL}${path}`, { signal });
  if (!response.ok) throw new Error('http');
  return response.json();
}

function paintFindResults() {
  const target = $('#find-results', roots.sheet);
  if (target) render(target, findResults());
}

function findResults() {
  if (foodFind.status === 'loading') return html`<p class="caption" role="status">${t('food.find.loading')}</p>${skeletonRows(3)}`;
  if (foodFind.message) return html`<p class="caption" role="status">${foodFind.message}</p>`;
  if (!foodFind.results.length) return '';
  return html`
    <div class="list">${foodFind.results.map((food, i) => html`
      <div class="list-row">
        <div class="grow"><h3>${food.name}</h3><p class="caption">${food.brand ? `${food.brand}, ` : ''}${t('food.find.per100', { n: food.kcal100 })}</p></div>
        <button class="btn btn-tonal btn-small" data-action="add-found" data-index="${i}" aria-label="${t('food.find.addNamed', { name: food.name })}">${t('food.find.add')}</button>
      </div>`)}
    </div>
    <p class="caption">${t('food.find.source')}</p>`;
}

async function runFoodLookup(path, { barcode = false } = {}) {
  foodFind.controller?.abort();
  foodFind.controller = new AbortController();
  foodFind.status = 'loading';
  foodFind.message = '';
  foodFind.results = [];
  paintFindResults();
  try {
    const data = await requestFoods(path, foodFind.controller.signal);
    const products = barcode ? (data.status === 1 ? [data.product] : []) : (data.products || []);
    foodFind.results = products.map(foodFromProduct).filter(Boolean).slice(0, 12);
    foodFind.message = foodFind.results.length ? '' : t(barcode ? 'food.find.notFound' : 'food.find.none');
  } catch (error) {
    if (error.name === 'AbortError') return;
    foodFind.message = t('food.find.error');
  }
  foodFind.status = 'idle';
  paintFindResults();
}

function searchFoods() {
  const query = cleanText($('#find-query')?.value, 60);
  if (!query) { $('#find-query')?.focus(); return; }
  runFoodLookup(`/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`);
}

function lookupBarcode(code) {
  const digits = String(code ?? $('#find-code')?.value ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) { $('#find-code')?.focus(); return; }
  runFoodLookup(`/api/v2/product/${digits}.json?fields=${OFF_FIELDS}`, { barcode: true });
}

async function scanBarcode() {
  try {
    const code = await window.fatboyScan.scan();
    if (code) lookupBarcode(code);
  } catch (error) {
    foodFind.message = t('food.find.scanFailed');
    paintFindResults();
  }
}

function addFound(index) {
  const food = foodFind.results[index];
  const grams = Number($('#find-grams')?.value);
  if (!food || !(grams >= 1 && grams <= 2000)) {
    $('#find-grams')?.focus();
    foodFind.message = t('food.find.badGrams');
    paintFindResults();
    return;
  }
  const name = cleanText(food.name, 40);
  const kcal = Math.max(1, Math.round((food.kcal100 * grams) / 100));
  const scale = grams / 100;
  logFood(name, kcal, mealForNow(), { p: Math.round(food.p100 * scale * 10) / 10, c: Math.round(food.c100 * scale * 10) / 10, f: Math.round(food.f100 * scale * 10) / 10 }, foodDayKey());
  closeSheet();
  paint();
  toast(t('toast.added', { name, kcal }));
}

function foodSearchSheet() {
  foodFind.status = 'idle';
  foodFind.message = '';
  foodFind.results = [];
  return {
    label: t('food.find.title'),
    body: html`
      ${sheetHeader(t('food.find.title'), t('food.find.help'))}
      <div class="field">
        <label for="find-query">${t('food.find.query')}</label>
        <input class="input" id="find-query" maxlength="60" autocomplete="off" data-find="query">
      </div>
      <button class="btn btn-large" data-action="find-foods">${icon('search')}${t('food.find.search')}</button>
      <div class="grid-2">
        <div class="field">
          <label for="find-grams">${t('food.find.grams')}</label>
          <input class="input" id="find-grams" type="number" inputmode="numeric" min="1" max="2000" value="100">
        </div>
        <div class="field">
          <label for="find-code">${t('food.find.code')}</label>
          <input class="input" id="find-code" inputmode="numeric" maxlength="14" autocomplete="off" data-find="code">
        </div>
      </div>
      <div class="row row-wrap">
        <button class="btn btn-tonal" data-action="lookup-barcode">${t('food.find.lookup')}</button>
        ${window.fatboyScan ? html`<button class="btn btn-tonal" data-action="scan-barcode">${icon('scan')}${t('food.find.scan')}</button>` : ''}
      </div>
      <div id="find-results" class="stack-tight" aria-live="polite"></div>`,
  };
}
