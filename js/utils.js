/* ══════════════════════════ PIN HASHING ══════════════════════════ */
async function _hashPin(pin) {
    const salt = 'elim-depcom-mce-2025';
    const data = new TextEncoder().encode(salt + String(pin));
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ══════════════════════════ CLOCK, DATES & REFRESH ══════════════════════════ */
function tick(){
  const el = document.getElementById('live-clock');
  if(el) el.textContent=new Date().toLocaleString('es-ES',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(tick,1000);
setInterval(() => { if(currentTab === 'acts') renderCards(); }, 60000);
/* Fecha en zona horaria de El Salvador (UTC-6, sin horario de verano), formato YYYY-MM-DD.
   Independiente de la zona horaria del dispositivo. */
function _svDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/El_Salvador', year:'numeric', month:'2-digit', day:'2-digit' }).format(d || new Date());
}
// Partes numéricas (año, mes, día) de la fecha de El Salvador
function _svDateParts(d) { return _svDateStr(d).split('-').map(Number); }
const nd=new Date(), p2=n=>String(n).padStart(2,'0');
const todayStr = _svDateStr();

/* ══════════════════════════ GENDER FORMATTING UTILS ══════════════════════════ */
function formatGender(role, sex) {
    if(!role || role === 'Ninguno') return role;
    if (sex === 'Femenino') {
        if (role === 'Servidor') return 'Servidora';
        if (role === 'Colaborador') return 'Colaboradora';
        if (role === 'Coordinador General') return 'Coordinadora General';
        if (role === 'Director Operativo') return 'Directora Operativa';
        if (role === 'Coordinador') return 'Coordinadora';
        if (role === 'Director') return 'Directora';
    }
    return role;
}

function formatCargoObj(cObj, sex) {
    if(!cObj || !cObj.role || cObj.role === 'Ninguno') return null;
    let formattedRole = formatGender(cObj.role, sex);
    if(cObj.area) return `${formattedRole} de ${cObj.area}`;
    return formattedRole;
}


/* ══════════════════════════ UTILS ══════════════════════════ */
function avc(n){let h=0;for(let c of n)h=(h*31+c.charCodeAt(0))>>>0;return AVC[h%AVC.length];}
function ini(n){return n.trim().split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase();}
/* Devuelve el nombre de visualización de una persona a partir de su nombre canónico */
function _dn(name) {
  if(!name) return name;
  const p = typeof people !== 'undefined' ? people.find(x => x.name === name) : null;
  return (p && window._getDisplayName) ? _getDisplayName(p) : name;
}
/* Devuelve style e innerHTML para un avatar, usando foto de Talento Humano si existe */
function personAv(name){
  const p = typeof people !== 'undefined' ? people.find(x => x.name === name) : null;
  const style = p?.photo
    ? `background-image:url(${p.photo});background-size:cover;background-color:transparent;color:transparent;font-size:0;`
    : `background:${avc(name)}`;
  const content = p?.photo ? '' : ini(name);
  return {style, content};
}
function formatDateStr(dStr){
  if(!dStr)return '';
  const [y,m,d]=dStr.split('-');
  return `${d}/${m}/${y}`;
}
function formatEventName(title, dateStr) {
    const [y, m, d] = dateStr.split('-');
    const fullMonths = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fMonth = fullMonths[parseInt(m, 10) - 1];
    return `${title} - ${d}/${fMonth}`;
}

function esc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}
let tTimer;
function showToast(msg){
  const t=document.getElementById('toast');
  if(t) {
      t.textContent=msg;
      t.classList.add('show');
      clearTimeout(tTimer);
      tTimer=setTimeout(()=>t.classList.remove('show'),2600);
  }
}
function customAlert(msg) {
  customConfirm(msg, null, null);
  // Ocultar botón No para usar como alert simple
  const btnNo = document.getElementById('confirm-btn-no');
  if(btnNo) btnNo.style.display = 'none';
  const btnYes = document.getElementById('confirm-btn-yes');
  if(btnYes) {
    btnYes.textContent = 'Entendido';
    btnYes.onclick = () => {
      document.getElementById('confirm-overlay')?.classList.remove('open');
      if(btnNo) btnNo.style.display = '';
      if(btnYes) btnYes.textContent = 'Confirmar';
    };
  }
}

function customConfirm(msg, onYes, onNo) {
  const el = document.getElementById('confirm-overlay');
  const msgEl = document.getElementById('confirm-msg');
  if(msgEl) {
    if(/<[a-z][\s\S]*>/i.test(msg)) {
      msgEl.innerHTML = msg;
      msgEl.style.whiteSpace = 'normal';
      msgEl.style.padding = '18px 20px';
    } else {
      msgEl.textContent = msg;
      msgEl.style.whiteSpace = 'pre-wrap';
      msgEl.style.padding = '25px 20px';
    }
  }
  if(el) el.classList.add('open');
  
  const btnYes = document.getElementById('confirm-btn-yes');
  const btnNo = document.getElementById('confirm-btn-no');
  if(btnYes) { btnYes.onclick = () => { if(el) el.classList.remove('open'); if(onYes) onYes(); }; }
  if(btnNo) { btnNo.onclick = () => { if(el) el.classList.remove('open'); if(onNo) onNo(); }; }
}

/* ══════════════════════════ CARGA DE TRABAJO POR PERSONA (#7) ══════════════════════════
   Cuenta tareas ACTIVAS (no hechas, no canceladas) en eventos de hoy en adelante.
   Pondera por prioridad y diferencia líder vs apoyo (el apoyo pesa menos). */
const _PRIO_W = { 'Alta': 3, 'Media': 2, 'Normal': 1, 'Baja': 1 };
function _personWorkload(name) {
    if(!name) return { total:0, asLeader:0, asSupport:0, weighted:0, week:0 };
    const today = (typeof todayStr !== 'undefined' && todayStr) ? todayStr : new Date().toISOString().slice(0,10);
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const weekLimit = in7.toISOString().slice(0,10);
    let asLeader = 0, asSupport = 0, weighted = 0, week = 0;
    activities.forEach(a => {
        const ev = (typeof events !== 'undefined') ? events.find(e => e.id === a.eventId) : null;
        const date = (ev && ev.date) || a.fecha || '';
        if(date && date < today) return; // solo hoy en adelante
        (a.tasks||[]).forEach(t => {
            if(t.done || t.cancelled) return;
            const isLeader  = t.responsable === name;
            const isSupport = (t.coliders||[]).includes(name) || (t.assignedPeople||[]).includes(name);
            if(!isLeader && !isSupport) return;
            if(isLeader) asLeader++; else asSupport++;
            const w = _PRIO_W[a.prioridad] || 1;
            weighted += isLeader ? w : w * 0.6;
            if(date && date <= weekLimit) week++;
        });
    });
    return { total: asLeader + asSupport, asLeader, asSupport, weighted: Math.round(weighted*10)/10, week };
}
function _workloadColor(weighted) {
    if(weighted <= 2) return { c:'var(--green)', dot:'🟢', label:'ligera' };
    if(weighted <= 4) return { c:'var(--amber)', dot:'🟡', label:'media' };
    return { c:'var(--red)', dot:'🔴', label:'alta' };
}
// Chip HTML para listas (Por Persona, Equipos…)
function _workloadChip(name) {
    const wl  = _personWorkload(name);
    const col = _workloadColor(wl.weighted);
    return `<span title="Carga ${col.label}: ${wl.total} tarea(s) activa(s) — ${wl.asLeader} como líder, ${wl.asSupport} de apoyo"
        style="display:inline-flex;align-items:center;gap:3px;font-size:.6rem;font-weight:800;padding:1px 7px;border-radius:20px;
        background:${col.c}1a;color:${col.c};border:1px solid ${col.c}55;white-space:nowrap;">${col.dot} ${wl.total}</span>`;
}

function getPeopleOptions(selectedVal, excludeList = []) {
    let html = '<option value="">-- Seleccionar del Talento Humano --</option>';
    people.forEach(p => {
        if (p.archived && p.name !== selectedVal) return;
        if (excludeList.includes(p.name) && p.name !== selectedVal) return;
        const isSel = p.name === selectedVal ? 'selected' : '';
        const wl = _personWorkload(p.name);
        const dot = _workloadColor(wl.weighted).dot;
        html += `<option value="${esc(p.name)}" ${isSel}>${esc(_dn(p.name))} (${esc(p.type)}) · ${dot}${wl.total}</option>`;
    });
    return html;
}

/* ══════════════════════════ SCHEDULE WARNING SYSTEM ══════════════════════════ */
function checkPersonSchedule(name, onYes, onNo, scheduleHint) {
    const p = people.find(x => x.name === name);
    const schedules = scheduleHint ? [scheduleHint] : modalSchedules;
    if(!p || !p.schedules || p.schedules.length === 0 || !schedules.length) {
        if(onYes) onYes();
        return;
    }
    const hasMatch = schedules.some(s => p.schedules.includes(s));
    if(hasMatch) {
        if(onYes) onYes();
    } else {
        const hs = p.schedules.join(', ');
        const sLabel = schedules.join(', ');
        customConfirm(`⚠️ ${esc(name)} normalmente asiste en otro horario (${hs}).\n\n¿Estás seguro de asignarlo a este bloque programado para: ${sLabel}?`, onYes, onNo);
    }
}

/* ── Conflict check: person already assigned overlapping hours same date ── */
function _timesOverlap(a1, a2, b1, b2) {
    if(!a1 || !a2 || !b1 || !b2) return true; // si faltan horas asumir solapamiento
    return a1 < b2 && b1 < a2;
}

function checkPersonAssignmentConflict(name, onYes, onNo, timeRange) {
    const eventId = document.getElementById('f-evento')?.value;
    const evt = events.find(e => e.id === eventId);
    const evtDate = evt?.date || '';
    if(!evtDate) { onYes?.(); return; }

    // Solo advertir si tenemos horas para comparar
    if(!timeRange?.inicio || !timeRange?.fin) { onYes?.(); return; }

    // Recopilar tareas con solapamiento de horas confirmado
    const conflictTasks = [];
    activities.forEach(a => {
        if(a.id === editingId) return;
        const aEvt = events.find(e => e.id === a.eventId);
        if(aEvt?.date !== evtDate) return;
        (a.tasks||[]).forEach(t => {
            if(t.cancelled) return;
            if(!t.inicio || !t.fin) return; // sin horas → no se puede confirmar conflicto
            const assigned = t.responsable === name || (t.coliders||[]).includes(name) || (t.assignedPeople||[]).includes(name);
            if(!assigned) return;
            if(!_timesOverlap(timeRange.inicio, timeRange.fin, t.inicio, t.fin)) return;
            conflictTasks.push({ a, t });
        });
    });

    if(conflictTasks.length > 0) {
        const color = typeof avc === 'function' ? avc : () => '#4a25aa';
        const chips = conflictTasks.map(({a, t}) => {
            const bg = color(a.activity);
            const hours = (t.inicio && t.fin) ? `${t.inicio}–${t.fin}` : '';
            return `<span style="display:inline-flex;align-items:center;gap:5px;background:${bg}22;border:1px solid ${bg};color:var(--fg);border-radius:20px;padding:3px 10px;font-size:.72rem;margin:2px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${bg};flex-shrink:0;"></span>
              <strong>${esc(a.activity)}</strong>${hours ? ` <span style="color:var(--muted);">⏰ ${hours}</span>` : ''}
            </span>`;
        }).join('');
        customConfirm(`<div style="font-size:.82rem;line-height:1.5;">⚠️ <strong>${esc(name)}</strong> ya tiene asignación en esta fecha con horario que se solapa:<br><br><div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;">${chips}</div><br>¿Deseas asignarlo igualmente?</div>`, onYes, onNo);
    } else {
        onYes?.();
    }
}

function _checkFull(name, onYes, onNo, scheduleHint, timeRange) {
    checkPersonSchedule(name,
        () => checkPersonAssignmentConflict(name, onYes, onNo, timeRange),
        onNo,
        scheduleHint
    );
}

window.handleActResponsable = function(sel) {
    const name = sel.value;
    if(!name) { oldActResp = ''; return; }
    _checkFull(name,
        () => { oldActResp = name; },
        () => { sel.value = oldActResp; }
    );
};

window.addColider = function(tid) {
  const b = modalTaskBlocks.find(x=>x.id===tid);
  if(!b || (b.coliders||[]).length >= 2) return;
  b.coliders = [...(b.coliders||[]), ''];
  renderTasksBuilder();
};
window.removeColider = function(tid, ci) {
  const b = modalTaskBlocks.find(x=>x.id===tid);
  if(!b) return;
  b.coliders = (b.coliders||[]).filter((_,i)=>i!==ci);
  renderTasksBuilder();
};
window.handleTaskColider = function(tid, ci, sel, oldVal) {
  const name = sel.value;
  const b = modalTaskBlocks.find(x=>x.id===tid);
  if(!b) return;
  if(!name) { b.coliders[ci]=''; renderTasksBuilder(); return; }
  _checkFull(name,
    () => { b.coliders[ci]=name; renderTasksBuilder(); },
    () => { sel.value = oldVal; },
    b.horario,
    { inicio: b.inicio, fin: b.fin }
  );
};
window.handleTaskResp = function(tid, sel, oldVal) {
    const name = sel.value;
    if(!name) {
        updateTaskField(tid, 'responsable', '');
        renderTasksBuilder();
        return;
    }
    const b = modalTaskBlocks.find(x=>x.id===tid);
    _checkFull(name,
        () => {
            updateTaskField(tid, 'responsable', name);
            renderTasksBuilder();
            // Aviso de sobrecarga
            const wl = _personWorkload(name);
            if(_workloadColor(wl.weighted).dot === '🔴')
                showToast(`⚠️ ${name} ya tiene carga alta (${wl.total} tareas activas)`);
        },
        () => { sel.value = oldVal; },
        b?.horario,
        { inicio: b?.inicio, fin: b?.fin }
    );
};

/* ══════════════════════════ THEME TOGGLE ══════════════════════════ */
let isLight = localStorage.getItem('elim_theme') === 'light';
if(isLight) document.documentElement.setAttribute('data-theme', 'light');

function toggleTheme() {
    isLight = !isLight;
    if(isLight) {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('elim_theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('elim_theme', 'dark');
    }
    updateThemeBtn();
    if(window._applyHeaderLogo) _applyHeaderLogo();
}
function updateThemeBtn() {
    const btn = document.getElementById('theme-btn');
    if(btn) btn.textContent = isLight ? '☀️' : '🌙';
}
window.addEventListener('DOMContentLoaded', updateThemeBtn);
