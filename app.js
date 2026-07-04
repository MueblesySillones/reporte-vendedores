/* Reporte de Vendedores — lógica de la app */
const { SUPABASE_URL, SUPABASE_KEY, BUCKET } = window.RV_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let vendedores = [];   // [{id, nombre, sucursal}]
let reportes = [];     // [{id, vendedor_id, situacion, cuerpo, imagen_url, created_at}]
let selectedVendedor = null;

/* ---------- utilidades ---------- */
const $ = (s) => document.querySelector(s);
const el = (s) => document.getElementById(s);

function toast(msg, isErr = false) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => (t.className = "toast"), 3200);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function esc(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- carga de datos ---------- */
async function loadVendedores() {
  const { data, error } = await sb
    .from("rv_vendedores")
    .select("id,nombre,sucursal")
    .eq("activo", true)
    .order("sucursal", { ascending: true })
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) { toast("Error cargando vendedores", true); console.error(error); return; }
  vendedores = data || [];
}

async function loadReportes() {
  const { data, error } = await sb
    .from("rv_reportes")
    .select("id,vendedor_id,situacion,cuerpo,imagen_url,created_at")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  reportes = data || [];
}

/* ---------- selects de sucursal / vendedor ---------- */
function sucursales() {
  return [...new Set(vendedores.map((v) => v.sucursal))].sort();
}

function fillSucursalSelects() {
  const opts = sucursales().map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  el("f-sucursal").innerHTML = `<option value="">Todas</option>` + opts;
  el("r-sucursal").innerHTML = `<option value="">Todas las sucursales</option>` + opts;
}

function fillVendedorSelect() {
  const suc = el("f-sucursal").value;
  const list = vendedores.filter((v) => !suc || v.sucursal === suc);
  el("f-vendedor").innerHTML =
    `<option value="">Seleccioná…</option>` +
    list.map((v) => `<option value="${v.id}">${esc(v.nombre)} — ${esc(v.sucursal)}</option>`).join("");
}

/* ========================================================
   TAB CARGAR
======================================================== */
let selectedFile = null;

el("f-sucursal").addEventListener("change", fillVendedorSelect);

const drop = el("drop");
drop.addEventListener("click", () => el("f-imagen").click());
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.borderColor = "var(--accent)"; });
drop.addEventListener("dragleave", () => { drop.style.borderColor = ""; });
drop.addEventListener("drop", (e) => {
  e.preventDefault(); drop.style.borderColor = "";
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
el("f-imagen").addEventListener("change", (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

function setFile(file) {
  if (!file.type.startsWith("image/")) { toast("El archivo debe ser una imagen", true); return; }
  selectedFile = file;
  el("drop-text").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => { el("preview").innerHTML = `<img src="${e.target.result}" alt="preview" />`; };
  reader.readAsDataURL(file);
}

el("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vendedor_id = el("f-vendedor").value;
  const situacion = el("f-situacion").value.trim();
  const cuerpo = el("f-cuerpo").value.trim();
  if (!vendedor_id) { toast("Elegí un vendedor", true); return; }
  if (!situacion) { toast("Escribí la situación", true); return; }

  const btn = el("submit");
  btn.disabled = true; btn.textContent = "Enviando…";

  try {
    let imagen_url = null;
    if (selectedFile) {
      const ext = (selectedFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${vendedor_id}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, selectedFile, { contentType: selectedFile.type });
      if (up.error) throw up.error;
      imagen_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const { error } = await sb.from("rv_reportes").insert({ vendedor_id, situacion, cuerpo: cuerpo || null, imagen_url });
    if (error) throw error;

    el("form").reset();
    selectedFile = null;
    el("preview").innerHTML = "";
    el("drop-text").textContent = "Tocá para elegir una imagen o arrastrala acá";
    fillVendedorSelect();
    toast("✓ Reporte cargado");
    await loadReportes(); // refresca datos para el reporte
  } catch (err) {
    console.error(err);
    toast("Error al enviar: " + (err.message || err), true);
  } finally {
    btn.disabled = false; btn.textContent = "Enviar reporte";
  }
});

/* ========================================================
   TAB REPORTE
======================================================== */
el("r-sucursal").addEventListener("change", renderVendList);
el("btn-refresh").addEventListener("click", async () => {
  el("vend-list").innerHTML = `<div class="loader">Cargando…</div>`;
  await Promise.all([loadVendedores(), loadReportes()]);
  fillSucursalSelects();
  renderVendList();
  if (selectedVendedor) renderDetail(selectedVendedor);
});

function reportesDe(vendId) {
  return reportes.filter((r) => r.vendedor_id === vendId);
}

function renderVendList() {
  const suc = el("r-sucursal").value;
  const list = vendedores.filter((v) => !suc || v.sucursal === suc);
  el("vend-count").textContent = `(${list.length})`;
  if (!list.length) { el("vend-list").innerHTML = `<div class="loader">Sin vendedores</div>`; return; }
  el("vend-list").innerHTML = list.map((v) => {
    const n = reportesDe(v.id).length;
    return `<div class="vend-item ${selectedVendedor === v.id ? "active" : ""}" data-id="${v.id}">
      <div><div class="name">${esc(v.nombre)}</div><div class="suc">${esc(v.sucursal)}</div></div>
      <span class="badge ${n === 0 ? "zero" : ""}">${n}</span>
    </div>`;
  }).join("");
  el("vend-list").querySelectorAll(".vend-item").forEach((it) =>
    it.addEventListener("click", () => { selectedVendedor = it.dataset.id; renderVendList(); renderDetail(selectedVendedor); })
  );
}

function conteoPorSituacion(rs) {
  const map = {};
  rs.forEach((r) => {
    const key = r.situacion.trim();
    const norm = key.toLowerCase();
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
    <div class="entry">
      <div class="entry-top">
        <span class="sit">${esc(r.situacion)}</span>
        <span class="date">${fmtDate(r.created_at)}</span>
      </div>
      ${r.cuerpo ? `<p class="body">${esc(r.cuerpo)}</p>` : ""}
      ${r.imagen_url ? `<div class="thumb"><img src="${r.imagen_url}" data-full="${r.imagen_url}" alt="captura" /></div>` : ""}
    </div>`).join("");

  el("detail").innerHTML = `
    <div class="card">
      <h1>${esc(v.nombre)}</h1>
      <p class="sub">${esc(v.sucursal)} · ${rs.length} situación(es) registradas</p>
      <strong class="no-print" style="font-size:13px;color:var(--muted);">Conteo por situación</strong>
      ${summary}
      <div id="entries">${entries || '<p class="muted">Sin registros.</p>'}</div>
    </div>`;

  el("detail").querySelectorAll(".thumb img").forEach((img) =>
    img.addEventListener("click", () => openLightbox(img.dataset.full))
  );
}

/* ---------- lightbox ---------- */
function openLightbox(src) {
  const lb = el("lightbox");
  lb.querySelector("img").src = src;
  lb.className = "lightbox show";
}
el("lightbox").addEventListener("click", () => { el("lightbox").className = "lightbox"; });

/* ========================================================
   EXPORTAR
======================================================== */
el("btn-excel").addEventListener("click", () => {
  const suc = el("r-sucursal").value;
  const list = vendedores.filter((v) => !suc || v.sucursal === suc);
  const ids = new Set(list.map((v) => v.id));
  const vmap = Object.fromEntries(vendedores.map((v) => [v.id, v]));
  const rows = reportes
    .filter((r) => ids.has(r.vendedor_id))
    .map((r) => ({
      Sucursal: vmap[r.vendedor_id]?.sucursal || "",
      Vendedor: vmap[r.vendedor_id]?.nombre || "",
      Situacion: r.situacion,
      Cuerpo: r.cuerpo || "",
      Fecha: fmtDate(r.created_at),
      Imagen: r.imagen_url || "",
    }));
  if (!rows.length) { toast("No hay datos para exportar", true); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 50 }, { wch: 18 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reportes");
  XLSX.writeFile(wb, `reporte-vendedores${suc ? "-" + suc.replace(/\s+/g, "_") : ""}.xlsx`);
});

el("btn-pdf").addEventListener("click", () => {
  if (!selectedVendedor) { toast("Elegí un vendedor para imprimir su legajo", true); return; }
  window.print();
});

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
    if (tab === "reporte") renderVendList();
  })
);

(async function init() {
  await Promise.all([loadVendedores(), loadReportes()]);
  fillSucursalSelects();
  fillVendedorSelect();
  renderVendList();
})();
