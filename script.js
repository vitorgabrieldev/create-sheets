// ── STATE ──
let numRows = 100, numCols = 26;
const data = {}, merges = {}, mergedInto = {}, colWidths = [];
const cellBorders = {};

let selCell = null, rangeStart = null, rangeEnd = null;
let isDrag = false, isEdit = false;
let zoomLevel = 1;

// ── HELPERS ──
const K = (r, c) => `${r}_${c}`;

function colLetter(c) {
  let s = '', n = c + 1;
  while (n > 0) {
    let rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const cname = (r, c) => colLetter(c) + (r + 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function getRange() {
  if (!rangeStart || !rangeEnd) return null;
  return {
    r1: Math.min(rangeStart.r, rangeEnd.r),
    c1: Math.min(rangeStart.c, rangeEnd.c),
    r2: Math.max(rangeStart.r, rangeEnd.r),
    c2: Math.max(rangeStart.c, rangeEnd.c),
  };
}

const getCell = (r, c) => document.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
const getInp  = (r, c) => { const td = getCell(r, c); return td ? td.querySelector('input') : null; };

// ── BORDER HELPERS ──
function getBdr(r, c) {
  return cellBorders[K(r, c)] || { t: false, r: false, b: false, l: false };
}

function setBdr(r, c, patch) {
  cellBorders[K(r, c)] = { ...getBdr(r, c), ...patch };
}

function applyBorderStyle(td, r, c) {
  const b   = getBdr(r, c);
  const def = '1px solid #d1d5db';
  const on  = '2px solid #1e1b4b';
  td.style.borderTop    = b.t ? on : def;
  td.style.borderRight  = b.r ? on : def;
  td.style.borderBottom = b.b ? on : def;
  td.style.borderLeft   = b.l ? on : def;
}

function applyBorder(mode) {
  const range = getRange();
  if (!range) return;
  const { r1, c1, r2, c2 } = range;

  if (mode === 'none') {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        cellBorders[K(r, c)] = { t: false, r: false, b: false, l: false };
        const td = getCell(r, c);
        if (td) applyBorderStyle(td, r, c);
      }
    }
    return;
  }

  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const patch = {};
      if (mode === 'all') {
        patch.t = true; patch.r = true; patch.b = true; patch.l = true;
      } else {
        if (r === r1) patch.t = true;
        if (r === r2) patch.b = true;
        if (c === c1) patch.l = true;
        if (c === c2) patch.r = true;
      }
      setBdr(r, c, patch);
      const td = getCell(r, c);
      if (td) applyBorderStyle(td, r, c);
    }
  }
}

// ── BUILD ──
function buildGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const thead = grid.createTHead();
  const hRow  = thead.insertRow();

  const corner = document.createElement('th');
  corner.className = 'corner';
  hRow.appendChild(corner);

  for (let c = 0; c < numCols; c++) {
    const th = document.createElement('th');
    th.className  = 'col-hdr';
    th.dataset.c  = c;
    th.style.width = (colWidths[c] || 80) + 'px';
    th.innerHTML  = `<div class="col-hdr-inner"><span class="col-hdr-text">${colLetter(c)}</span><div class="rz" data-c="${c}"></div></div>`;
    hRow.appendChild(th);
  }

  const addColTh = document.createElement('th');
  addColTh.className = 'add-col-btn';
  addColTh.title     = 'Adicionar coluna';
  addColTh.textContent = '+';
  addColTh.addEventListener('click', () => addCol());
  hRow.appendChild(addColTh);

  const tbody = grid.createTBody();

  for (let r = 0; r < numRows; r++) {
    const tr = tbody.insertRow();
    const rh = document.createElement('td');
    rh.className    = 'row-hdr';
    rh.dataset.r    = r;
    rh.textContent  = r + 1;
    tr.appendChild(rh);

    for (let c = 0; c < numCols; c++) {
      const k = K(r, c);

      if (mergedInto[k]) {
        const td = document.createElement('td');
        td.className = 'cell merged-hidden';
        td.dataset.r = r;
        td.dataset.c = c;
        tr.appendChild(td);
        continue;
      }

      const td = document.createElement('td');
      td.className = 'cell';
      td.dataset.r = r;
      td.dataset.c = c;

      if (merges[k]) {
        td.rowSpan = merges[k].rowspan;
        td.colSpan = merges[k].colspan;
        td.classList.add('merged-origin');
      }

      applyBorderStyle(td, r, c);

      const inp = document.createElement('input');
      inp.type  = 'text';
      inp.value = data[k] || '';
      inp.setAttribute('tabindex', '-1');
      td.appendChild(inp);
      tr.appendChild(td);
    }

    const sp = document.createElement('td');
    sp.style.cssText = 'border-left:1px solid #e5e7eb;background:#fafafa';
    tr.appendChild(sp);
  }

  const addTr  = tbody.insertRow();
  const addBtn = document.createElement('td');
  addBtn.className   = 'add-row-btn';
  addBtn.colSpan     = numCols + 2;
  addBtn.title       = 'Adicionar linha';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => addRowFn());
  addTr.appendChild(addBtn);

  attachCellEvents();
  attachResizeEvents();
  updateUI();
}

// ── CELL EVENTS ──
function attachCellEvents() {
  const grid = document.getElementById('grid');

  grid.addEventListener('mousedown', e => {
    const td = e.target.closest('td.cell');
    if (!td || td.classList.contains('merged-hidden')) return;
    const r = +td.dataset.r, c = +td.dataset.c;
    if (isEdit) stopEdit(true);
    if (e.shiftKey && selCell) {
      rangeEnd = { r, c };
    } else {
      selCell = { r, c };
      rangeStart = { r, c };
      rangeEnd   = { r, c };
    }
    isDrag = true;
    e.preventDefault();
    updateUI();
  });

  grid.addEventListener('mouseover', e => {
    if (!isDrag) return;
    const td = e.target.closest('td.cell');
    if (!td || td.classList.contains('merged-hidden')) return;
    rangeEnd = { r: +td.dataset.r, c: +td.dataset.c };
    updateUI();
  });

  document.addEventListener('mouseup', () => { isDrag = false; });

  grid.addEventListener('dblclick', e => {
    const td = e.target.closest('td.cell');
    if (!td || td.classList.contains('merged-hidden')) return;
    startEdit(+td.dataset.r, +td.dataset.c);
  });

  document.addEventListener('keydown', e => {
    if (isEdit) {
      if (e.key === 'Escape')  { stopEdit(false); e.preventDefault(); }
      else if (e.key === 'Enter') { stopEdit(true); movesel(1, 0); e.preventDefault(); }
      else if (e.key === 'Tab')   { stopEdit(true); movesel(0, e.shiftKey ? -1 : 1); e.preventDefault(); }
      return;
    }
    if (!selCell) return;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) {
      const [dr, dc] = arrows[e.key];
      if (e.shiftKey) {
        rangeEnd = { r: clamp(rangeEnd.r + dr, 0, numRows - 1), c: clamp(rangeEnd.c + dc, 0, numCols - 1) };
      } else {
        movesel(dr, dc);
      }
      updateUI();
      e.preventDefault();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { clearSel(); e.preventDefault(); return; }
    if (e.key === 'Enter'  || e.key === 'F2')        { startEdit(selCell.r, selCell.c); e.preventDefault(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { startEdit(selCell.r, selCell.c, e.key); e.preventDefault(); }
  });

  document.getElementById('fInput').addEventListener('input', e => {
    if (!selCell) return;
    const k = K(selCell.r, selCell.c);
    data[k] = e.target.value;
    const inp = getInp(selCell.r, selCell.c);
    if (inp) inp.value = e.target.value;
  });
}

function startEdit(r, c, initial = null) {
  selCell = { r, c };
  rangeStart = { r, c };
  rangeEnd   = { r, c };
  isEdit = true;
  updateUI();
  const inp = getInp(r, c);
  if (!inp) return;
  inp.classList.add('ed');
  inp.removeAttribute('readonly');
  if (initial !== null) { inp.value = initial; data[K(r, c)] = initial; }
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
  document.getElementById('fInput').readOnly = false;
}

function stopEdit(save) {
  if (!isEdit || !selCell) return;
  isEdit = false;
  const { r, c } = selCell;
  const inp = getInp(r, c);
  if (inp) {
    if (save) data[K(r, c)] = inp.value;
    else inp.value = data[K(r, c)] || '';
    inp.classList.remove('ed');
    inp.setAttribute('readonly', '');
  }
  document.getElementById('fInput').readOnly = true;
  updateUI();
}

function movesel(dr, dc) {
  if (!selCell) return;
  const r = clamp(selCell.r + dr, 0, numRows - 1);
  const c = clamp(selCell.c + dc, 0, numCols - 1);
  selCell = { r, c };
  rangeStart = { r, c };
  rangeEnd   = { r, c };
  updateUI();
  const td = getCell(r, c);
  if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function clearSel() {
  const range = getRange();
  if (!range) return;
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      data[K(r, c)] = '';
      const inp = getInp(r, c);
      if (inp) inp.value = '';
    }
  }
}

// ── UPDATE UI ──
function updateUI() {
  document.querySelectorAll('td.cell').forEach(td => { td.classList.remove('sel', 'inr'); });
  document.querySelectorAll('.col-hdr,.row-hdr').forEach(el => el.classList.remove('shdr'));

  const range = getRange();
  if (range) {
    for (let r = range.r1; r <= range.r2; r++) {
      for (let c = range.c1; c <= range.c2; c++) {
        const td = getCell(r, c);
        if (td) td.classList.add('inr');
      }
      document.querySelector(`.row-hdr[data-r="${r}"]`)?.classList.add('shdr');
    }
    for (let c = range.c1; c <= range.c2; c++) {
      document.querySelector(`.col-hdr[data-c="${c}"]`)?.classList.add('shdr');
    }
  }

  if (selCell) {
    const td = getCell(selCell.r, selCell.c);
    if (td) td.classList.add('sel');
    document.getElementById('cellRef').value = cname(selCell.r, selCell.c);
    document.getElementById('fInput').value  = data[K(selCell.r, selCell.c)] || '';
  }

  const multi = range && (range.r2 > range.r1 || range.c2 > range.c1);
  document.getElementById('btnMerge').disabled = !selCell;
  document.getElementById('btnBdr').disabled   = !selCell;

  if (range && multi) {
    const rows = range.r2 - range.r1 + 1, cols = range.c2 - range.c1 + 1;
    document.getElementById('selInfo').textContent = `${rows}×${cols}`;
  } else {
    document.getElementById('selInfo').textContent = '';
  }

  if (selCell) {
    const k        = K(selCell.r, selCell.c);
    const isMerged = !!merges[k];
    const svgMerge   = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="5" height="12" rx="1"/><rect x="10" y="2" width="5" height="12" rx="1"/><path d="M6 8h4M8 6l2 2-2 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const svgUnmerge = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="14" height="12" rx="1"/><path d="M6 8h4M6 6l-2 2 2 2M10 6l2 2-2 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    document.getElementById('btnMerge').innerHTML = (isMerged ? svgUnmerge : svgMerge) + ' ' + (isMerged ? 'Desmesclar' : 'Mesclar');
  }
}

// ── MERGE ──
document.getElementById('btnMerge').addEventListener('click', () => {
  if (!selCell) return;
  const k = K(selCell.r, selCell.c);
  if (merges[k]) unmergeCells(); else mergeCells();
});

function mergeCells() {
  const range = getRange();
  if (!range) return;
  if (range.r1 === range.r2 && range.c1 === range.c2) return;
  const ok = K(range.r1, range.c1);
  let combined = '';
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const v = data[K(r, c)] || '';
      if (v) combined += (combined ? ' ' : '') + v;
    }
  }
  data[ok] = combined;
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const k = K(r, c);
      if (k !== ok) { data[k] = ''; mergedInto[k] = ok; }
    }
  }
  merges[ok] = { rowspan: range.r2 - range.r1 + 1, colspan: range.c2 - range.c1 + 1 };
  selCell = { r: range.r1, c: range.c1 };
  rangeStart = rangeEnd = selCell;
  buildGrid();
}

function unmergeCells() {
  if (!selCell) return;
  const k = K(selCell.r, selCell.c);
  if (!merges[k]) return;
  const m = merges[k];
  for (let r = selCell.r; r < selCell.r + m.rowspan; r++) {
    for (let c = selCell.c; c < selCell.c + m.colspan; c++) {
      delete mergedInto[K(r, c)];
    }
  }
  delete merges[k];
  buildGrid();
}

// ── ADD / REMOVE ──
function addCol(at = numCols) { numCols++; colWidths.splice(at, 0, 80); buildGrid(); }
function addRowFn()            { numRows++; buildGrid(); }

function insertRow(at) {
  for (let r = numRows - 1; r >= at; r--) {
    for (let c = 0; c < numCols; c++) {
      const ok = K(r, c), nk = K(r + 1, c);
      if (data[ok]      !== undefined) { data[nk]      = data[ok];      delete data[ok]; }
      if (merges[ok])                  { merges[nk]    = merges[ok];    delete merges[ok]; }
      if (mergedInto[ok])              { mergedInto[nk]= mergedInto[ok];delete mergedInto[ok]; }
    }
  }
  numRows++;
  buildGrid();
}

function deleteRow(r) {
  if (numRows <= 1) return;
  for (let c = 0; c < numCols; c++) {
    const k = K(r, c);
    delete data[k]; delete merges[k]; delete mergedInto[k];
  }
  for (let rr = r + 1; rr < numRows; rr++) {
    for (let c = 0; c < numCols; c++) {
      const ok = K(rr, c), nk = K(rr - 1, c);
      if (data[ok]      !== undefined) { data[nk]      = data[ok];      delete data[ok]; }
      if (merges[ok])                  { merges[nk]    = merges[ok];    delete merges[ok]; }
      if (mergedInto[ok])              { mergedInto[nk]= mergedInto[ok];delete mergedInto[ok]; }
    }
  }
  numRows--;
  if (selCell && selCell.r >= numRows) selCell = { r: numRows - 1, c: selCell.c };
  buildGrid();
}

function insertCol(at) {
  for (let r = 0; r < numRows; r++) {
    for (let c = numCols - 1; c >= at; c--) {
      const ok = K(r, c), nk = K(r, c + 1);
      if (data[ok]      !== undefined) { data[nk]      = data[ok];      delete data[ok]; }
      if (merges[ok])                  { merges[nk]    = merges[ok];    delete merges[ok]; }
      if (mergedInto[ok])              { mergedInto[nk]= mergedInto[ok];delete mergedInto[ok]; }
    }
  }
  numCols++;
  colWidths.splice(at, 0, 80);
  buildGrid();
}

function deleteCol(c) {
  if (numCols <= 1) return;
  for (let r = 0; r < numRows; r++) {
    const k = K(r, c);
    delete data[k]; delete merges[k]; delete mergedInto[k];
  }
  for (let cc = c + 1; cc < numCols; cc++) {
    for (let r = 0; r < numRows; r++) {
      const ok = K(r, cc), nk = K(r, cc - 1);
      if (data[ok]      !== undefined) { data[nk]      = data[ok];      delete data[ok]; }
      if (merges[ok])                  { merges[nk]    = merges[ok];    delete merges[ok]; }
      if (mergedInto[ok])              { mergedInto[nk]= mergedInto[ok];delete mergedInto[ok]; }
    }
  }
  numCols--;
  colWidths.splice(c, 1);
  if (selCell && selCell.c >= numCols) selCell = { r: selCell.r, c: numCols - 1 };
  buildGrid();
}

// ── RESIZE ──
function attachResizeEvents() {
  document.querySelectorAll('.rz').forEach(h => {
    h.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const c = +h.dataset.c, startX = e.clientX, startW = colWidths[c] || 80;
      h.classList.add('dg');
      const onMove = ev => {
        const nw = Math.max(28, startW + ev.clientX - startX);
        colWidths[c] = nw;
        const th = document.querySelector(`.col-hdr[data-c="${c}"]`);
        if (th) th.style.width = nw + 'px';
        document.querySelectorAll(`td.cell[data-c="${c}"]`).forEach(td => {
          td.style.width    = nw + 'px';
          td.style.minWidth = nw + 'px';
        });
      };
      const onUp = () => {
        h.classList.remove('dg');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── ZOOM (Ctrl + scroll) ──
document.getElementById('sw').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomLevel = clamp(zoomLevel + (e.deltaY < 0 ? 0.1 : -0.1), 0.3, 3);
  document.getElementById('zoomWrap').style.transform = `scale(${zoomLevel})`;
}, { passive: false });

// ── BORDER MENU ──
function toggleBdrMenu() { document.getElementById('bdrMenu').classList.toggle('open'); }
function closeBdrMenu()   { document.getElementById('bdrMenu').classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('#bdrWrap')) closeBdrMenu(); });

// ── CONTEXT MENU ──
const ctxMenu = document.getElementById('ctxMenu');
let ctxT = null;

document.getElementById('grid').addEventListener('contextmenu', e => {
  const td = e.target.closest('td.cell');
  if (!td || td.classList.contains('merged-hidden')) return;
  e.preventDefault();
  ctxT = { r: +td.dataset.r, c: +td.dataset.c };
  ctxMenu.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`;
});

document.addEventListener('click', () => { ctxMenu.style.display = 'none'; });

ctxMenu.addEventListener('click', e => {
  const item = e.target.closest('.ctx-i');
  if (!item || !ctxT) return;
  const { r, c } = ctxT;
  ({
    ira: () => insertRow(r),
    irb: () => insertRow(r + 1),
    icl: () => insertCol(c),
    icr: () => insertCol(c + 1),
    dr:  () => deleteRow(r),
    dc:  () => deleteCol(c),
  })[item.dataset.a]?.();
  ctxMenu.style.display = 'none';
});

// ── INIT ──
function init() {
  for (let c = 0; c < numCols; c++) colWidths.push(80);
  buildGrid();
}

init();
