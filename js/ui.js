/* ══════════════════════════ MAIN UI FLOW ══════════════════════════ */
function switchTab(tab) {
    if(tab === 'people') {
        requestPin(3, () => performSwitchTab(tab));
    } else if(tab === 'evals') {
        if(authLevel >= 3) {
            performSwitchTab(tab);
        } else if(authLevel === 2) {
            const myIdentity = currentUser?.linkedPerson || currentUser?.name;
            const myPObj = myIdentity ? people.find(p => p.name === myIdentity) : null;
            const isCoord = myIdentity && activities.some(a => a.responsable === myIdentity);
            const isTeamLead = myPObj && teams.some(t => t.leaderId === myPObj.id);
            if(isCoord || isTeamLead) {
                performSwitchTab(tab);
            } else {
                showToast('⚠️ Solo coordinadores de actividades o líderes de equipo pueden acceder a Evaluaciones');
            }
        } else {
            requestPin(3, () => performSwitchTab(tab));
        }
    } else if(tab === 'attendance') {
        if(authLevel < 1) return;
        performSwitchTab(tab);
    } else {
        performSwitchTab(tab);
    }
}

function performSwitchTab(tab) {
    currentTab = tab;
    try { localStorage.setItem('elim_last_tab', tab); } catch(e) {}
    ['acts','people','evals','live','teams','attendance'].forEach(t => {
        const btn = document.getElementById('tab-'+t);
        const view = document.getElementById('view-'+t);
        if(btn) btn.classList.toggle('active', t === tab);
        if(view) view.classList.toggle('active', t === tab);
    });

    if(tab === 'acts') { renderEventTabs(); renderCards(); }
    if(tab === 'people') renderPeople();
    if(tab === 'evals') renderEvals();
    if(tab === 'live') renderLivePanel();
    if(tab === 'teams') renderTeams();
    if(tab === 'attendance') {
        const inner = document.getElementById('att-view-inner');
        if(typeof renderAttendanceView === 'function') {
            renderAttendanceView();
        } else if(inner) {
            inner.innerHTML = `<div style="padding:30px;text-align:center;color:var(--red);font-size:.8rem;">
                ⚠️ DIAG: renderAttendanceView no está definida (attendance.js no cargó).</div>`;
        }
        if(inner && !inner.innerHTML.trim()) {
            inner.innerHTML = `<div style="padding:30px;text-align:center;color:var(--amber);font-size:.8rem;">
                ⚠️ DIAG: vista vacía · authLevel=${typeof authLevel!=='undefined'?authLevel:'?'} ·
                user=${(typeof currentUser!=='undefined'&&currentUser)?'sí':'no'}</div>`;
        }
    }
}

function computeStatus(activity){
  const tasks = (activity.tasks||[]).filter(t=>!t.cancelled);
  if(!tasks.length) return 'No iniciada';
  const doneCount = tasks.filter(t=>t.done).length;
  if(doneCount===0) return 'No iniciada';
  if(doneCount===tasks.length) return 'Finalizada';
  return 'En proceso';
}

function applyPDFExportState() {
  // Populate report header
  const activeEvt = events.find(e => e.id === activeEventId);
  const hdrEvent = document.getElementById('pdf-hdr-event');
  const hdrDate  = document.getElementById('pdf-hdr-date');
  if(hdrEvent) hdrEvent.textContent = activeEvt ? activeEvt.name : 'Informe de Actividades';
  if(hdrDate)  hdrDate.textContent  = 'Generado el ' + new Date().toLocaleDateString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  document.body.classList.add('pdf-export-mode');
  document.querySelectorAll('.task-body').forEach(el => el.classList.add('open'));
  document.querySelectorAll('[id^="sch-body-"]').forEach(el => el.style.display = 'block');
}

function removePDFExportState() {
  document.body.classList.remove('pdf-export-mode');
  renderCards();
}

// Carta: 8.5 × 11 in. A 96dpi = 816 × 1056 px. A 300ppi (scale 3.125) = 2550 × 3300 px.
const LETTER_W_IN = 8.5;
const LETTER_H_IN = 11;
const PDF_MARGIN   = 0.4; // pulgadas
const PDF_SCALE    = 3.125; // 300 / 96
const PREVIEW_SCALE = 1.5;
const LETTER_W_PX_PREV = Math.round(LETTER_W_IN * 96 * PREVIEW_SCALE);
const LETTER_H_PX_PREV = Math.round(LETTER_H_IN * 96 * PREVIEW_SCALE);

async function descargarPDF() {
  if (getActiveActivities().length === 0) {
    showToast("⚠️ No hay actividades para exportar en el evento seleccionado.");
    return;
  }

  const modal      = document.getElementById('pdf-preview-modal');
  const previewBody = document.getElementById('pdf-preview-body');
  const infoEl     = document.getElementById('pdf-preview-info');
  const confirmBtn = document.getElementById('pdf-confirm-btn');

  const spinner = `<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:50px 20px;color:#ccc;">
    <div style="width:44px;height:44px;border:3px solid rgba(255,255,255,.15);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;"></div>
    <span style="font-size:.82rem;opacity:.8;">Renderizando vista previa…</span>
  </div>`;

  previewBody.innerHTML = spinner;
  infoEl.textContent = '';
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `⏳ Preparando…`;
  modal.classList.add('open');

  await new Promise(r => setTimeout(r, 80));

  applyPDFExportState();
  await new Promise(r => setTimeout(r, 60));

  try {
    const canvas = await html2canvas(document.body, {
      scale: PREVIEW_SCALE,
      useCORS: true,
      allowTaint: true,
      windowWidth: Math.round(LETTER_W_IN * 96),   // 816px — ancho carta
      backgroundColor: '#ffffff',
      logging: false,
      removeContainer: true
    });

    removePDFExportState();

    // Dividir el canvas en páginas carta
    const pageW = canvas.width;
    const pageH = LETTER_H_PX_PREV;
    const totalPages = Math.ceil(canvas.height / pageH);

    previewBody.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const sliceH = Math.min(pageH, canvas.height - i * pageH);
      const pg = document.createElement('canvas');
      pg.width  = pageW;
      pg.height = sliceH;
      pg.className = 'pdf-page-preview';
      pg.getContext('2d').drawImage(canvas, 0, i * pageH, pageW, sliceH, 0, 0, pageW, sliceH);
      previewBody.appendChild(pg);

      // Separador entre páginas
      if (i < totalPages - 1) {
        const sep = document.createElement('div');
        sep.style.cssText = 'width:100%;max-width:820px;text-align:center;font-size:.62rem;color:#aaa;padding:2px 0;letter-spacing:.08em;';
        sep.textContent = `— Página ${i+1} / ${totalPages} —`;
        previewBody.appendChild(sep);
      }
    }

    infoEl.textContent = `${totalPages} página${totalPages !== 1 ? 's' : ''} · Carta (8.5×11in) · 300ppi al descargar`;
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Descargar PDF (300ppi)`;

  } catch (err) {
    removePDFExportState();
    previewBody.innerHTML = `<div style="padding:36px;color:#f87;font-size:.82rem;text-align:center;">
      ❌ No se pudo generar la vista previa.<br>
      <span style="opacity:.6;font-size:.72rem;">${esc(err.message||'Error desconocido')}</span>
    </div>`;
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `⬇️ Descargar PDF (300ppi)`;
    infoEl.textContent = 'Vista previa no disponible — puedes descargar de todas formas.';
  }
}

function closePDFPreview() {
  document.getElementById('pdf-preview-modal').classList.remove('open');
  document.getElementById('pdf-preview-body').innerHTML = '';
}

function confirmPDFDownload() {
  const btn = document.getElementById('pdf-confirm-btn');
  btn.disabled = true;
  btn.innerHTML = `<div style="width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;display:inline-block;margin-right:6px;vertical-align:middle;"></div>Generando PDF…`;

  applyPDFExportState();

  const activeEvt = events.find(e => e.id === activeEventId);
  const filename  = `DEPCOM_${(activeEvt?.name||'Informe').replace(/[^a-z0-9]/gi,'_')}.pdf`;

  const opt = {
    margin:      [PDF_MARGIN, PDF_MARGIN, PDF_MARGIN, PDF_MARGIN],
    filename,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: PDF_SCALE,
      useCORS: true,
      allowTaint: true,
      windowWidth: Math.round(LETTER_W_IN * 96),
      backgroundColor: '#ffffff',
      letterRendering: true,
      logging: false
    },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(document.body).save().then(() => {
    removePDFExportState();
    closePDFPreview();
    showToast('✅ PDF descargado · Carta · 300ppi');
  }).catch(() => {
    removePDFExportState();
    btn.disabled = false;
    btn.innerHTML = `⬇️ Descargar PDF (300ppi)`;
    showToast('❌ Error al generar el PDF');
  });
}
