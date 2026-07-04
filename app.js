/* Reporte de Vendedores — lógica de la app */
const { SUPABASE_URL, SUPABASE_KEY, BUCKET } = window.RV_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let vendedores = [];       // todos (incl. inactivos): {id, nombre, sucursal, activo, orden}
let reportes = [];         // {id, vendedor_id, situacion, cuerpo, imagen_url, fecha_hecho, created_at}
let selectedVendedor = null;
const pdfPick = new Set(); // ids marcados para PDF

const $ = (s) => document.querySelector(s);
const el = (s) => document.getElementById(s);

function toast(msg, isErr = false) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => (t.className = "toast"), 3400);
}
function showOverlay(txt) { el("overlay-text").textContent = txt || "Procesando…"; el("overlay").className = "overlay show"; }
function hideOverlay() { el("overlay").className = "overlay"; }

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(val) {
  if (!val) return "";
  const d = new Date(val + (val.length <= 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function esc(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const activos = () => vendedores.filter((v) => v.activo);
const vmap = () => Object.fromEntries(vendedores.map((v) => [v.id, v]));

/* ---------- carga de datos ---------- */
async function loadVendedores() {
  const { data, error } = await sb
    .from("rv_vendedores")
    .select("id,nombre,sucursal,activo,orden")
    .order("sucursal", { ascending: true })
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) { toast("Error cargando vendedores", true); console.error(error); return; }
  vendedores = data || [];
}
async function loadReportes() {
  const { data, error } = await sb
    .from("rv_reportes")
    .select("id,vendedor_id,situacion,cuerpo,imagen_url,fecha_hecho,created_at")
    .order("fecha_hecho", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  reportes = data || [];
}

/* ---------- selects ---------- */
function sucursales() { return [...new Set(activos().map((v) => v.sucursal))].sort(); }
function fillSucursalSelects() {
  const opts = sucursales().map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  el("f-sucursal").innerHTML = `<option value="">Todas</option>` + opts;
  el("r-sucursal").innerHTML = `<option value="">Todas las sucursales</option>` + opts;
  el("suc-list").innerHTML = opts;
}
function fillVendedorSelect() {
  const suc = el("f-sucursal").value;
  const list = activos().filter((v) => !suc || v.sucursal === suc);
  el("f-vendedor").innerHTML =
    `<option value="">Seleccioná…</option>` +
    list.map((v) => `<option value="${v.id}">${esc(v.nombre)} — ${esc(v.sucursal)}</option>`).join("");
}

/* ========================================================
   TAB CARGAR
======================================================== */
let selectedFile = null;
el("f-fecha").value = todayISO();
el("f-sucursal").addEventListener("change", fillVendedorSelect);

const drop = el("drop");
drop.addEventListener("click", () => el("f-imagen").click());
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.borderColor = "var(--accent)"; });
drop.addEventListener("dragleave", () => { drop.style.borderColor = ""; });
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.style.borderColor = ""; if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
el("f-imagen").addEventListener("change", (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

function setFile(file) {
  if (!file.type.startsWith("image/")) { toast("El archivo debe ser una imagen", true); return; }
  selectedFile = file;
  el("drop-text").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => { el("preview").innerHTML = `<img src="${e.target.result}" alt="preview" />`; };
  reader.readAsDataURL(file);
}

async function uploadImage(file, vendedor_id) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${vendedor_id}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (up.error) throw up.error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

el("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vendedor_id = el("f-vendedor").value;
  const situacion = el("f-situacion").value.trim();
  const cuerpo = el("f-cuerpo").value.trim();
  const fecha_hecho = el("f-fecha").value || null;
  if (!vendedor_id) { toast("Elegí un vendedor", true); return; }
  if (!situacion) { toast("Escribí la situación", true); return; }

  const btn = el("submit"); btn.disabled = true; btn.textContent = "Enviando…";
  try {
    let imagen_url = null;
    if (selectedFile) imagen_url = await uploadImage(selectedFile, vendedor_id);
    const { error } = await sb.from("rv_reportes").insert({ vendedor_id, situacion, cuerpo: cuerpo || null, imagen_url, fecha_hecho });
    if (error) throw error;
    el("form").reset();
    el("f-fecha").value = todayISO();
    selectedFile = null; el("preview").innerHTML = "";
    el("drop-text").textContent = "Tocá para elegir una imagen o arrastrala acá";
    fillVendedorSelect();
    toast("✓ Reporte cargado");
    await loadReportes();
  } catch (err) {
    console.error(err); toast("Error al enviar: " + (err.message || err), true);
  } finally {
    btn.disabled = false; btn.textContent = "Enviar reporte";
  }
});

/* ========================================================
   TAB REPORTE — lista + detalle
======================================================== */
el("r-sucursal").addEventListener("change", () => { renderVendList(); syncSelAll(); });
el("btn-refresh").addEventListener("click", refreshAll);

async function refreshAll() {
  el("vend-list").innerHTML = `<div class="loader">Cargando…</div>`;
  await Promise.all([loadVendedores(), loadReportes()]);
  fillSucursalSelects(); fillVendedorSelect();
  renderVendList();
  if (selectedVendedor) renderDetail(selectedVendedor);
}

const reportesDe = (id) => reportes.filter((r) => r.vendedor_id === id);

function currentListVendedores() {
  const suc = el("r-sucursal").value;
  return activos().filter((v) => !suc || v.sucursal === suc);
}

function renderVendList() {
  const list = currentListVendedores();
  el("vend-count").textContent = `(${list.length})`;
  if (!list.length) { el("vend-list").innerHTML = `<div class="loader">Sin vendedores</div>`; return; }

  let html = "", lastSuc = null;
  for (const v of list) {
    if (v.sucursal !== lastSuc) { html += `<div class="suc-group">${esc(v.sucursal)}</div>`; lastSuc = v.sucursal; }
    const n = reportesDe(v.id).length;
    html += `<div class="vend-item ${selectedVendedor === v.id ? "active" : ""}" data-id="${v.id}">
      <input type="checkbox" class="pick" data-pick="${v.id}" ${pdfPick.has(v.id) ? "checked" : ""} />
      <div class="who"><div class="name">${esc(v.nombre)}</div><div class="suc">${esc(v.sucursal)}</div></div>
      <span class="badge ${n === 0 ? "zero" : ""}">${n}</span>
    </div>`;
  }
  el("vend-list").innerHTML = html;

  el("vend-list").querySelectorAll(".vend-item").forEach((it) => {
    it.addEventListener("click", (e) => {
      if (e.target.classList.contains("pick")) return;
      selectedVendedor = it.dataset.id; renderVendList(); renderDetail(selectedVendedor);
    });
  });
  el("vend-list").querySelectorAll(".pick").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) pdfPick.add(cb.dataset.pick); else pdfPick.delete(cb.dataset.pick);
      updateSelCount(); syncSelAll();
    });
  });
  updateSelCount();
}

function conteoPorSituacion(rs) {
  const map = {};
  rs.forEach((r) => {
    const key = r.situacion.trim(), norm = key.toLowerCase();
    if (!map[norm]) map[norm] = { label: key, count: 0 };
    map[norm].count++;
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function renderDetail(vendId) {
  const v = vendedores.find((x) => x.id === vendId);
  if (!v) return;
  const rs = reportesDe(vendId);
  const conteo = conteoPorSituacion(rs);
  const summary = conteo.length
    ? `<div class="summary">${conteo.map((c) => `<span class="chip">${esc(c.label)}<b>${c.count}</b></span>`).join("")}</div>`
    : `<p class="muted">Sin situaciones cargadas todavía.</p>`;

  const entries = rs.map((r) => `
    <div class="entry" data-eid="${r.id}">
      <div class="entry-top">
        <span class="sit">${esc(r.situacion)}</span>
        <span class="date">${r.fecha_hecho ? "📅 " + fmtDay(r.fecha_hecho) : ""}<small>cargado ${fmtDateTime(r.created_at)}</small></span>
      </div>
      ${r.cuerpo ? `<p class="body">${esc(r.cuerpo)}</p>` : ""}
      ${r.imagen_url ? `<div class="thumb"><img src="${r.imagen_url}" data-full="${r.imagen_url}" alt="captura" /></div>` : ""}
      <div class="entry-actions">
        <button class="btn ghost" data-edit="${r.id}">✎ Editar</button>
        <button class="btn ghost danger" data-del="${r.id}">🗑 Borrar</button>
      </div>
    </div>`).join("");

  el("detail").innerHTML = `
    <div class="card">
      <h1>${esc(v.nombre)}</h1>
      <p class="sub">${esc(v.sucursal)} · ${rs.length} situación(es) registradas</p>
      <strong style="font-size:13px;color:var(--muted);">Conteo por situación</strong>
      ${summary}
      <div id="entries">${entries || '<p class="muted">Sin registros.</p>'}</div>
    </div>`;

  el("detail").querySelectorAll(".thumb img").forEach((img) => img.addEventListener("click", () => openLightbox(img.dataset.full)));
  el("detail").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => startEdit(b.dataset.edit)));
  el("detail").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delReporte(b.dataset.del)));
}

/* ---------- editar situación (inline) ---------- */
function startEdit(id) {
  const r = reportes.find((x) => x.id === id);
  if (!r) return;
  const box = el("detail").querySelector(`.entry[data-eid="${id}"]`);
  box.innerHTML = `
    <div class="edit-form">
      <div class="row">
        <div style="flex:2;"><input type="text" id="e-sit" value="${esc(r.situacion)}" placeholder="Situación" /></div>
        <div style="flex:1;min-width:140px;"><input type="date" id="e-fecha" value="${r.fecha_hecho || ""}" /></div>
      </div>
      <textarea id="e-cuerpo" placeholder="Detalle">${esc(r.cuerpo || "")}</textarea>
      <div class="entry-actions">
        <button class="btn small" id="e-save">Guardar</button>
        <button class="btn ghost" id="e-cancel">Cancelar</button>
      </div>
    </div>`;
  el("e-cancel").addEventListener("click", () => renderDetail(selectedVendedor));
  el("e-save").addEventListener("click", async () => {
    const situacion = el("e-sit").value.trim();
    if (!situacion) { toast("La situación no puede quedar vacía", true); return; }
    const patch = { situacion, cuerpo: el("e-cuerpo").value.trim() || null, fecha_hecho: el("e-fecha").value || null };
    el("e-save").disabled = true;
    const { error } = await sb.from("rv_reportes").update(patch).eq("id", id);
    if (error) { toast("Error al guardar", true); console.error(error); el("e-save").disabled = false; return; }
    Object.assign(r, patch);
    toast("✓ Cambios guardados");
    renderDetail(selectedVendedor);
  });
}

/* ---------- borrar situación ---------- */
async function delReporte(id) {
  const r = reportes.find((x) => x.id === id);
  if (!r) return;
  if (!confirm(`¿Borrar esta situación ("${r.situacion}")? No se puede deshacer.`)) return;
  const { error } = await sb.from("rv_reportes").delete().eq("id", id);
  if (error) { toast("Error al borrar", true); console.error(error); return; }
  // borrar la captura del storage si existía
  if (r.imagen_url) {
    const path = r.imagen_url.split(`/${BUCKET}/`)[1];
    if (path) sb.storage.from(BUCKET).remove([decodeURIComponent(path)]).catch(() => {});
  }
  reportes = reportes.filter((x) => x.id !== id);
  toast("✓ Situación borrada");
  renderVendList(); renderDetail(selectedVendedor);
}

/* ---------- lightbox ---------- */
function openLightbox(src) { const lb = el("lightbox"); lb.querySelector("img").src = src; lb.className = "lightbox show"; }
el("lightbox").addEventListener("click", () => { el("lightbox").className = "lightbox"; });

/* ========================================================
   SELECCIÓN PARA PDF
======================================================== */
function updateSelCount() { el("sel-count").textContent = `${pdfPick.size} seleccionado(s)`; }
function syncSelAll() {
  const list = currentListVendedores();
  const all = list.length > 0 && list.every((v) => pdfPick.has(v.id));
  el("sel-all").checked = all;
}
el("sel-all").addEventListener("change", () => {
  const list = currentListVendedores();
  if (el("sel-all").checked) list.forEach((v) => pdfPick.add(v.id));
  else list.forEach((v) => pdfPick.delete(v.id));
  renderVendList();
});

/* ========================================================
   GESTIÓN DE VENDEDORES (modal)
======================================================== */
el("btn-vendedores").addEventListener("click", () => { renderManage(); el("modal-vend").className = "modal show"; });
el("modal-close").addEventListener("click", () => { el("modal-vend").className = "modal"; });
el("modal-vend").addEventListener("click", (e) => { if (e.target.id === "modal-vend") el("modal-vend").className = "modal"; });

el("nv-add").addEventListener("click", async () => {
  const nombre = el("nv-nombre").value.trim();
  const sucursal = el("nv-sucursal").value.trim();
  if (!nombre || !sucursal) { toast("Completá nombre y sucursal", true); return; }
  const maxOrden = Math.max(0, ...vendedores.filter((v) => v.sucursal === sucursal).map((v) => v.orden || 0));
  const { error } = await sb.from("rv_vendedores").insert({ nombre, sucursal, orden: maxOrden + 1 });
  if (error) { toast("Error al agregar", true); console.error(error); return; }
  el("nv-nombre").value = "";
  await loadVendedores(); fillSucursalSelects(); fillVendedorSelect();
  renderManage(); renderVendList();
  toast("✓ Vendedor agregado");
});

async function toggleVendedor(id, activo) {
  const { error } = await sb.from("rv_vendedores").update({ activo }).eq("id", id);
  if (error) { toast("Error", true); console.error(error); return; }
  const v = vendedores.find((x) => x.id === id); if (v) v.activo = activo;
  if (!activo) pdfPick.delete(id);
  fillSucursalSelects(); fillVendedorSelect(); renderManage(); renderVendList();
  toast(activo ? "✓ Vendedor reactivado" : "✓ Vendedor sacado (su historial se conserva)");
}

function renderManage() {
  let html = "", lastSuc = null;
  const sorted = [...vendedores].sort((a, b) => a.sucursal.localeCompare(b.sucursal) || (a.orden - b.orden));
  for (const v of sorted) {
    if (v.sucursal !== lastSuc) { html += `<div class="mg-suc">${esc(v.sucursal)}</div>`; lastSuc = v.sucursal; }
    const n = reportesDe(v.id).length;
    html += `<div class="mg-item ${v.activo ? "" : "off"}">
      <span class="mg-name">${esc(v.nombre)}</span>
      <span class="mg-count">${n} sit.</span>
      ${v.activo
        ? `<button class="btn ghost danger" data-off="${v.id}">Sacar</button>`
        : `<button class="btn ghost" data-on="${v.id}">Reactivar</button>`}
    </div>`;
  }
  el("manage-list").innerHTML = html || `<p class="muted">Sin vendedores.</p>`;
  el("manage-list").querySelectorAll("[data-off]").forEach((b) => b.addEventListener("click", () => toggleVendedor(b.dataset.off, false)));
  el("manage-list").querySelectorAll("[data-on]").forEach((b) => b.addEventListener("click", () => toggleVendedor(b.dataset.on, true)));
}

/* ========================================================
   EXPORTAR EXCEL
======================================================== */
el("btn-excel").addEventListener("click", () => {
  const suc = el("r-sucursal").value;
  const list = activos().filter((v) => !suc || v.sucursal === suc);
  const ids = new Set(list.map((v) => v.id));
  const m = vmap();
  const rows = reportes.filter((r) => ids.has(r.vendedor_id)).map((r) => ({
    Sucursal: m[r.vendedor_id]?.sucursal || "",
    Vendedor: m[r.vendedor_id]?.nombre || "",
    Situacion: r.situacion,
    Cuerpo: r.cuerpo || "",
    "Fecha del hecho": r.fecha_hecho ? fmtDay(r.fecha_hecho) : "",
    "Cargado": fmtDateTime(r.created_at),
    Imagen: r.imagen_url || "",
  }));
  if (!rows.length) { toast("No hay datos para exportar", true); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 26 }, { wch: 48 }, { wch: 15 }, { wch: 18 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reportes");
  XLSX.writeFile(wb, `reporte-vendedores${suc ? "-" + suc.replace(/\s+/g, "_") : ""}.xlsx`);
});

/* ========================================================
   GENERAR PDF (branded)
======================================================== */
let logoData = null;
async function getLogo() {
  if (logoData) return logoData;
  try {
    const res = await fetch("logo.png");
    const blob = await res.blob();
    logoData = await blobToDataURL(blob);
  } catch (e) { logoData = null; }
  return logoData;
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
  });
}
function loadImg(dataUrl) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = dataUrl;
  });
}
async function fetchImageForPdf(url) {
  try {
    const res = await fetch(url); if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await blobToDataURL(blob);
    const im = await loadImg(dataUrl);
    if (!im) return null;
    const fmt = blob.type.includes("png") ? "PNG" : "JPEG";
    return { dataUrl, w: im.naturalWidth, h: im.naturalHeight, fmt };
  } catch (e) { return null; }
}

el("btn-pdf").addEventListener("click", generarPDF);

async function generarPDF() {
  let ids = [...pdfPick];
  if (!ids.length && selectedVendedor) ids = [selectedVendedor];
  if (!ids.length) { toast("Marcá al menos un vendedor para el PDF", true); return; }

  const incluirImgs = el("pdf-imgs").checked;
  const m = vmap();
  const seleccion = ids.map((id) => m[id]).filter(Boolean)
    .sort((a, b) => a.sucursal.localeCompare(b.sucursal) || a.nombre.localeCompare(b.nombre));

  showOverlay("Generando PDF…");
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const PW = 210, PH = 297, MX = 18;
    const CW = PW - MX * 2;
    const INK = [31, 29, 26], MUT = [124, 118, 108], ACC = [47, 111, 78], PAPER = [244, 242, 238], LINE = [220, 214, 202];

    const paintBg = () => { doc.setFillColor(...PAPER); doc.rect(0, 0, PW, PH, "F"); };
    let y = 0;
    const newPage = () => { doc.addPage(); paintBg(); y = MX; };
    const ensure = (need) => { if (y + need > PH - MX) newPage(); };

    const totalSit = seleccion.reduce((s, v) => s + reportesDe(v.id).length, 0);
    const sucs = [...new Set(seleccion.map((v) => v.sucursal))];

    /* ---------- PORTADA ---------- */
    paintBg();
    const logo = await getLogo();
    if (logo) {
      const im = await loadImg(logo);
      const lw = 92, lh = im ? (im.naturalHeight * lw) / im.naturalWidth : 26;
      doc.addImage(logo, "PNG", (PW - lw) / 2, 46, lw, lh);
    }
    doc.setDrawColor(...ACC); doc.setLineWidth(0.6); doc.line(MX + 30, 96, PW - MX - 30, 96);

    doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(30);
    doc.text("Reporte de Vendedores", PW / 2, 122, { align: "center" });

    doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(...MUT);
    const scopeTxt = sucs.length === 1
      ? `Sucursal ${sucs[0]}`
      : `${sucs.length} sucursales`;
    doc.text(scopeTxt, PW / 2, 134, { align: "center" });

    // caja de metadatos
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4);
    doc.roundedRect(MX + 24, 150, CW - 48, 46, 3, 3, "S");
    doc.setFontSize(11); doc.setTextColor(...INK);
    const meta = [
      ["Vendedores", String(seleccion.length)],
      ["Situaciones", String(totalSit)],
      ["Generado", fmtDay(todayISO())],
    ];
    let mx = MX + 24, seg = (CW - 48) / 3;
    meta.forEach(([k, v], i) => {
      const cx = mx + seg * i + seg / 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INK);
      doc.text(v, cx, 172, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUT);
      doc.text(k.toUpperCase(), cx, 182, { align: "center" });
    });

    // listado de vendedores incluidos
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUT);
    const nombres = seleccion.map((v) => `${v.nombre} (${v.sucursal})`).join("   ·   ");
    const wrapped = doc.splitTextToSize(nombres, CW - 20);
    doc.text(wrapped.slice(0, 6), PW / 2, 210, { align: "center" });

    doc.setFontSize(9); doc.setTextColor(...MUT);
    doc.text("Muebles y Sillones · documento interno", PW / 2, PH - 14, { align: "center" });

    /* ---------- DETALLE POR VENDEDOR ---------- */
    for (const v of seleccion) {
      const rs = reportesDe(v.id);
      newPage();

      // encabezado del vendedor
      doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INK);
      doc.text(v.nombre, MX, y + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...MUT);
      doc.text(`${v.sucursal}  ·  ${rs.length} situación(es)`, MX, y + 12);
      doc.setDrawColor(...ACC); doc.setLineWidth(0.6); doc.line(MX, y + 17, MX + 40, y + 17);
      y += 26;

      if (!rs.length) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(...MUT);
        doc.text("Sin situaciones registradas.", MX, y); y += 10;
        continue;
      }

      // conteo por situación
      const conteo = conteoPorSituacion(rs);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...MUT);
      doc.text("CONTEO POR SITUACIÓN", MX, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...INK);
      const conteoTxt = conteo.map((c) => `${c.label}: ${c.count}`).join("     ");
      const cwrap = doc.splitTextToSize(conteoTxt, CW);
      ensure(cwrap.length * 5 + 6);
      doc.text(cwrap, MX, y); y += cwrap.length * 5 + 8;

      // cada situación
      for (const r of rs) {
        ensure(24);
        // fecha
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...ACC);
        const fecha = r.fecha_hecho ? fmtDay(r.fecha_hecho) : fmtDay(r.created_at.slice(0, 10));
        doc.text(fecha.toUpperCase(), MX, y);
        // situación
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...INK);
        const sitWrap = doc.splitTextToSize(r.situacion, CW);
        doc.text(sitWrap, MX, y + 6);
        y += 6 + sitWrap.length * 5.5;
        // cuerpo
        if (r.cuerpo) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(60, 56, 50);
          const bodyWrap = doc.splitTextToSize(r.cuerpo, CW);
          for (let i = 0; i < bodyWrap.length; i++) { ensure(6); doc.text(bodyWrap[i], MX, y); y += 5.2; }
          y += 1;
        }
        // imagen
        if (incluirImgs && r.imagen_url) {
          const img = await fetchImageForPdf(r.imagen_url);
          if (img) {
            let iw = Math.min(CW * 0.72, 120);
            let ih = (img.h * iw) / img.w;
            const maxH = 92;
            if (ih > maxH) { ih = maxH; iw = (img.w * ih) / img.h; }
            ensure(ih + 6);
            doc.addImage(img.dataUrl, img.fmt, MX, y + 2, iw, ih);
            doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.rect(MX, y + 2, iw, ih);
            y += ih + 6;
          }
        }
        // separador
        y += 3; ensure(6);
        doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(MX, y, PW - MX, y);
        y += 7;
      }
    }

    /* ---------- numeración de páginas ---------- */
    const pages = doc.getNumberOfPages();
    for (let p = 2; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUT);
      doc.text(`${p - 1} / ${pages - 1}`, PW - MX, PH - 10, { align: "right" });
      doc.text("Reporte de Vendedores · Muebles y Sillones", MX, PH - 10);
    }

    const fname = seleccion.length === 1
      ? `reporte-${seleccion[0].nombre.replace(/\s+/g, "_")}.pdf`
      : sucs.length === 1 ? `reporte-${sucs[0].replace(/\s+/g, "_")}.pdf` : `reporte-vendedores.pdf`;
    doc.save(fname);
    toast("✓ PDF generado");
  } catch (err) {
    console.error(err); toast("Error generando el PDF: " + (err.message || err), true);
  } finally {
    hideOverlay();
  }
}

/* ========================================================
   TABS + INIT
======================================================== */
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    el("tab-cargar").hidden = tab !== "cargar";
    el("tab-reporte").hidden = tab !== "reporte";
    if (tab === "reporte") { renderVendList(); syncSelAll(); }
  })
);

(async function init() {
  await Promise.all([loadVendedores(), loadReportes()]);
  fillSucursalSelects(); fillVendedorSelect(); renderVendList();
})();
