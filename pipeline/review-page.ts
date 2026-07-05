/** Self-contained asset review page. No build step, no external assets. */
export const REVIEW_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Asset Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 32px 120px;
    background: #0b0b0e; color: #e8e6e1;
    font-family: -apple-system, "Segoe UI", Inter, Arial, sans-serif;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #9a9a9a; font-size: 14px; margin-bottom: 28px; }
  .scene-group { margin-bottom: 36px; }
  .scene-header {
    font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
    color: #d4af37; margin-bottom: 12px; display: flex; gap: 10px; align-items: baseline;
  }
  .scene-header .narr { color: #9a9a9a; font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
  .card {
    background: #16161c; border: 2px solid #2a2a33; border-radius: 10px; overflow: hidden;
    display: flex; flex-direction: column; transition: border-color 0.15s;
  }
  .card.placeholder { border-color: #c0392b; }
  .card.edited { border-color: #2ecc71; }
  .thumb-wrap { position: relative; aspect-ratio: 16/9; background: #000; }
  .thumb-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .badge {
    position: absolute; top: 8px; left: 8px; font-size: 11px; font-weight: 700;
    padding: 3px 8px; border-radius: 4px; background: rgba(0,0,0,0.7); text-transform: uppercase;
  }
  .badge.warn { background: #c0392b; }
  .card-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; }
  .query-row { display: flex; gap: 6px; }
  .query-row input {
    flex: 1; background: #0b0b0e; border: 1px solid #333; color: #eee; border-radius: 6px;
    padding: 7px 9px; font-size: 13px;
  }
  .meta { font-size: 11.5px; color: #8a8a8a; line-height: 1.4; min-height: 16px; }
  .btn-row { display: flex; gap: 6px; }
  button {
    cursor: pointer; border: none; border-radius: 6px; padding: 7px 10px; font-size: 12.5px; font-weight: 600;
  }
  .btn-refetch { background: #2b6cb0; color: #fff; flex: 1; }
  .btn-upload { background: #3a3a44; color: #eee; flex: 1; }
  .btn-refetch:disabled, .btn-upload:disabled { opacity: 0.5; cursor: wait; }
  #footer {
    position: fixed; bottom: 0; left: 0; right: 0; background: #131318; border-top: 1px solid #2a2a33;
    padding: 14px 32px; display: flex; align-items: center; justify-content: space-between;
  }
  #count { font-size: 14px; color: #9a9a9a; }
  #continueBtn {
    background: #d4af37; color: #111; font-size: 15px; font-weight: 700; padding: 12px 28px; border-radius: 8px;
  }
  #continueBtn:disabled { opacity: 0.5; cursor: wait; }
  #doneMsg { display: none; font-size: 15px; color: #2ecc71; font-weight: 700; }
  input[type=file] { display: none; }
</style>
</head>
<body>
  <h1>Asset Review — <span id="videoTitle"></span></h1>
  <div class="sub">Edit a query and click Re-fetch for a different image, or Upload your own. Placeholder slots (red) have no image yet.</div>
  <div id="scenes"></div>

  <div id="footer">
    <div id="count"></div>
    <div>
      <span id="doneMsg">Saved — you can close this tab.</span>
      <button id="continueBtn" onclick="continueRender()">Continue → Render</button>
    </div>
  </div>

<script>
let STATE = null;

async function load() {
  const res = await fetch('/state');
  STATE = await res.json();
  document.getElementById('videoTitle').textContent = STATE.videoTitle || '';
  render();
}

function render() {
  const container = document.getElementById('scenes');
  container.innerHTML = '';
  const bySlot = {};
  for (const s of STATE.slots) (bySlot[s.sceneIdx] ??= []).push(s);

  const sceneIdxs = Object.keys(bySlot).map(Number).sort((a, b) => a - b);
  for (const idx of sceneIdxs) {
    const slots = bySlot[idx];
    const group = document.createElement('div');
    group.className = 'scene-group';
    const header = document.createElement('div');
    header.className = 'scene-header';
    header.innerHTML = '<span>Scene ' + (idx + 1) + ' — ' + slots[0].component + '</span>' +
      '<span class="narr">' + escapeHtml(slots[0].narrationPreview) + '</span>';
    group.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const slot of slots) grid.appendChild(renderCard(slot));
    group.appendChild(grid);
    container.appendChild(group);
  }
  document.getElementById('count').textContent = STATE.slots.length + ' image slot(s)';
}

function renderCard(slot) {
  const card = document.createElement('div');
  card.className = 'card' + (slot.isPlaceholder ? ' placeholder' : '') + (slot.edited ? ' edited' : '');
  card.id = 'card-' + slot.id;

  const badge = slot.isPlaceholder ? '<div class="badge warn">NO IMAGE</div>' : (slot.provider ? '<div class="badge">' + slot.provider + '</div>' : '');
  card.innerHTML =
    '<div class="thumb-wrap">' + badge +
      '<img src="/img?f=' + encodeURIComponent(slot.file) + '&t=' + Date.now() + '" onerror="this.style.opacity=0.15" />' +
    '</div>' +
    '<div class="card-body">' +
      '<div class="query-row"><input type="text" value="' + escapeAttr(slot.query || '') + '" /></div>' +
      '<div class="meta">' + metaLine(slot) + '</div>' +
      '<div class="btn-row">' +
        '<button class="btn-refetch">Re-fetch</button>' +
        '<button class="btn-upload">Upload</button>' +
        '<input type="file" accept="image/jpeg,image/png,image/webp" />' +
      '</div>' +
    '</div>';

  const input = card.querySelector('input[type=text]');
  const refetchBtn = card.querySelector('.btn-refetch');
  const uploadBtn = card.querySelector('.btn-upload');
  const fileInput = card.querySelector('input[type=file]');

  refetchBtn.onclick = () => refetch(slot.id, input.value, card);
  uploadBtn.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    if (fileInput.files[0]) upload(slot.id, fileInput.files[0], card);
  };
  return card;
}

function metaLine(slot) {
  const parts = [];
  if (slot.author) parts.push(slot.author);
  if (slot.license) parts.push(slot.license);
  return escapeHtml(parts.join(' · ')) || (slot.isPlaceholder ? 'no image found' : '');
}

function setBusy(card, busy) {
  card.querySelectorAll('button').forEach((b) => (b.disabled = busy));
}

async function refetch(id, query, card) {
  setBusy(card, true);
  try {
    const res = await fetch('/refetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, query }),
    });
    const data = await res.json();
    if (data.error) { alert('Re-fetch failed: ' + data.error); return; }
    updateSlot(data.slot);
  } catch (e) {
    alert('Re-fetch failed: ' + e.message);
  } finally {
    setBusy(card, false);
  }
}

async function upload(id, file, card) {
  setBusy(card, true);
  try {
    const dataBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch('/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, filename: file.name, dataBase64 }),
    });
    const data = await res.json();
    if (data.error) { alert('Upload failed: ' + data.error); return; }
    updateSlot(data.slot);
  } catch (e) {
    alert('Upload failed: ' + e.message);
  } finally {
    setBusy(card, false);
  }
}

function updateSlot(updated) {
  const idx = STATE.slots.findIndex((s) => s.id === updated.id);
  if (idx >= 0) STATE.slots[idx] = { ...updated, edited: true };
  render();
}

async function continueRender() {
  const btn = document.getElementById('continueBtn');
  btn.disabled = true;
  try {
    await fetch('/done', { method: 'POST' });
    document.getElementById('doneMsg').style.display = 'inline';
    btn.textContent = 'Rendering started…';
  } catch (e) {
    alert('Failed to continue: ' + e.message);
    btn.disabled = false;
  }
}

function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

load();
</script>
</body>
</html>`;
