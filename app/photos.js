/* ==========================================================================
   Progress photos
   Kept in IndexedDB on this device only: not in backups and not synced.
   ========================================================================== */
const photoStore = { items: [], loaded: false, failed: false };
const PHOTO_EDGE = 900;

function photoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fatboy-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function photoTx(mode, work) {
  const db = await photoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const result = work(tx.objectStore('photos'));
    tx.oncomplete = () => { db.close(); resolve(result.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadPhotos() {
  try {
    const all = await photoTx('readonly', store => store.getAll());
    photoStore.items = all.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    photoStore.failed = false;
  } catch (error) {
    photoStore.failed = true;
  }
  photoStore.loaded = true;
  if (ui.tab === 'profile' && ui.profileView === 'main') paint();
}

// Shrinks the picture first so a year of weekly photos stays small.
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function addPhoto(file) {
  try {
    const picture = { id: makeId(), date: today(), picture: await shrinkPhoto(file) };
    await photoTx('readwrite', store => store.put(picture));
    photoStore.items.push(picture);
    toast(t('photos.added'));
    paint();
  } catch (error) {
    toast(t('photos.failed'));
  }
}

async function deletePhoto(id) {
  try {
    await photoTx('readwrite', store => store.delete(id));
    photoStore.items = photoStore.items.filter(item => item.id !== id);
    closeSheet();
    paint();
    toast(t('photos.deleted'));
  } catch (error) {
    toast(t('photos.failed'));
  }
}

async function clearPhotos() {
  try { await photoTx('readwrite', store => store.clear()); } catch (error) { /* ignore */ }
  photoStore.items = [];
}

// Weight on or before the photo's day, so each picture can be read next to a number.
function weightOnOrBefore(date) {
  const days = Object.keys(state.weights).filter(key => key <= date).sort();
  return days.length ? state.weights[days[days.length - 1]] : null;
}

function photoFrame(item, label) {
  const weight = weightOnOrBefore(item.date);
  return html`
    <figure class="photo-frame">
      <img src="${item.picture}" alt="${t('photos.open', { date: shortDate(item.date) })}">
      <figcaption class="caption">${label ? `${label}, ` : ''}${shortDate(item.date)}${weight ? `, ${mass.format(weight)}` : ''}</figcaption>
    </figure>`;
}

function photoSheet(id) {
  const item = photoStore.items.find(entry => entry.id === id);
  if (!item) return { label: t('photos.title'), body: '' };
  const first = photoStore.items[0];
  const compare = first && first.id !== item.id;
  return {
    label: t('photos.title'),
    body: html`
      ${sheetHeader(t('photos.title'))}
      <div class="${compare ? 'grid-2' : ''}">
        ${compare ? photoFrame(first, t('photos.first')) : ''}
        ${photoFrame(item, compare ? t('photos.this') : '')}
      </div>
      <button class="btn btn-plain btn-danger" data-action="delete-photo" data-id="${item.id}">${icon('trash')}${t('photos.delete')}</button>`,
  };
}

function photosCard() {
  const items = photoStore.items.slice(-6).reverse();
  return html`
    <section class="card" aria-labelledby="photos-title">
      <h2 id="photos-title">${t('photos.title')}</h2>
      ${items.length
        ? html`<div class="photo-grid">${items.map(item => html`
            <button class="photo-thumb" data-action="open-photo" data-id="${item.id}" aria-label="${t('photos.open', { date: shortDate(item.date) })}">
              <img src="${item.picture}" alt="" loading="lazy">
            </button>`)}</div>`
        : emptyState(t('photos.empty'))}
      <label class="btn btn-tonal" for="photo-file">${icon('camera')}${t('photos.add')}</label>
      <input class="sr-only" id="photo-file" type="file" accept="image/*" data-photo>
      <p class="caption">${t('photos.help')}</p>
    </section>`;
}
