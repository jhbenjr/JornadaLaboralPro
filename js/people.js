/* ══════════════════════════ CROP TOOL ══════════════════════════ */
const VIEW_SIZE = 260;  // tamaño visible del círculo en pantalla (debe coincidir con .crop-viewport del CSS)
const CROP_SIZE = 512;  // resolución de salida del archivo (~125ppi a 1in, nítida)
let _cropX = 0, _cropY = 0, _cropScale = 1;
let _cropNatW = 0, _cropNatH = 0;
let _cropDrag = false, _cropLX = 0, _cropLY = 0;
let _cropSrc = null;
let _cropOldPhotoUrl = null;
let _photoUploading = false;

function _cropClamp() {
  // Reencuadre clásico: la foto se puede desplazar por todo su contenido
  // mientras siga cubriendo el círculo; al alejar (zoom-out) se centra.
  const iw = _cropNatW * _cropScale;
  const ih = _cropNatH * _cropScale;
  const maxX = Math.max(0, (iw - VIEW_SIZE) / 2);
  const maxY = Math.max(0, (ih - VIEW_SIZE) / 2);
  _cropX = Math.min(Math.max(_cropX, -maxX), maxX);
  _cropY = Math.min(Math.max(_cropY, -maxY), maxY);
}

function _applyCropTransform() {
  const img = document.getElementById('crop-img');
  if(!img) return;
  const cx = VIEW_SIZE / 2 + _cropX;
  const cy = VIEW_SIZE / 2 + _cropY;
  img.style.width  = (_cropNatW * _cropScale) + 'px';
  img.style.height = (_cropNatH * _cropScale) + 'px';
  img.style.left   = (cx - _cropNatW * _cropScale / 2) + 'px';
  img.style.top    = (cy - _cropNatH * _cropScale / 2) + 'px';
}

window._cropOnZoom = function(val) {
  _cropScale = parseFloat(val);
  _cropClamp();
  _applyCropTransform();
};

window._cancelCrop = function() {
  document.getElementById('crop-modal').classList.remove('open');
  _cropSrc = null;
};

window._confirmCrop = async function() {
  const preview = document.getElementById('p-photo-preview');
  document.getElementById('crop-modal').classList.remove('open');
  preview.innerHTML = '⏳';
  preview.style.backgroundImage = 'none';
  _photoUploading = true;
  const saveBtn = document.getElementById('person-save-btn');
  if(saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Subiendo foto…'; }

  const canvas = document.createElement('canvas');
  canvas.width = CROP_SIZE; canvas.height = CROP_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(CROP_SIZE/2, CROP_SIZE/2, CROP_SIZE/2, 0, Math.PI*2);
  ctx.clip();
  // Fondo blanco para que las zonas sin foto (al alejar o mover) no salgan en negro
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

  const iw = _cropNatW * _cropScale;
  const ih = _cropNatH * _cropScale;
  // Posición/región calculadas en coordenadas de visualización (VIEW_SIZE)
  const imgLeft = VIEW_SIZE/2 + _cropX - iw/2;
  const imgTop  = VIEW_SIZE/2 + _cropY - ih/2;
  const srcX = -imgLeft / _cropScale;
  const srcY = -imgTop  / _cropScale;
  const srcW = VIEW_SIZE / _cropScale;
  const srcH = VIEW_SIZE / _cropScale;

  const imgEl = new Image();
  imgEl.onload = () => {
    ctx.drawImage(imgEl, srcX, srcY, srcW, srcH, 0, 0, CROP_SIZE, CROP_SIZE);
    canvas.toBlob(async blob => {
      const code = document.getElementById('p-code')?.value.trim().toUpperCase().replace(/[^A-Z0-9\-]/g,'') || '';
      const filename = code ? `${code}_${Date.now()}.jpg` : `person_${Date.now()}.jpg`;
      try {
        const res = await fetch(`${SUPA_URL}/storage/v1/object/avatars/${filename}`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
          body: blob
        });
        if(!res.ok) throw new Error(await res.text());
        editingPersonPhoto = `${SUPA_URL}/storage/v1/object/public/avatars/${filename}`;
        preview.style.backgroundImage = `url(${editingPersonPhoto})`;
        preview.style.color = 'transparent';
        preview.innerHTML = '';
        document.getElementById('btn-recrop').style.display = '';
        showToast('✅ Foto lista — ya puedes guardar');
        // Guardar la URL vieja para borrarla DESPUÉS de sincronizar
        window._pendingPhotoDelete = _cropOldPhotoUrl;
        _cropOldPhotoUrl = null;
      } catch(err) {
        showToast('❌ Error al subir: ' + err.message);
        preview.innerHTML = '📷';
      } finally {
        _photoUploading = false;
        const saveBtn = document.getElementById('person-save-btn');
        if(saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }
      }
    }, 'image/jpeg', 0.92);
  };
  imgEl.src = _cropSrc;
};

// Eventos de arrastre (mouse + touch)
document.addEventListener('DOMContentLoaded', () => {
  const vp = document.getElementById('crop-viewport');
  if(!vp) return;
  const onStart = e => {
    _cropDrag = true;
    const pt = e.touches ? e.touches[0] : e;
    _cropLX = pt.clientX; _cropLY = pt.clientY;
    e.preventDefault();
  };
  const onMove = e => {
    if(!_cropDrag) return;
    const pt = e.touches ? e.touches[0] : e;
    _cropX += pt.clientX - _cropLX;
    _cropY += pt.clientY - _cropLY;
    _cropLX = pt.clientX; _cropLY = pt.clientY;
    _cropClamp();
    _applyCropTransform();
    e.preventDefault();
  };
  const onEnd = () => { _cropDrag = false; };
  vp.addEventListener('mousedown',  onStart, { passive: false });
  vp.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove',  onMove, { passive: false });
  document.addEventListener('touchmove',  onMove, { passive: false });
  document.addEventListener('mouseup',  onEnd);
  document.addEventListener('touchend', onEnd);

  // Zoom con rueda del ratón
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomEl = document.getElementById('crop-zoom');
    _cropScale = Math.min(parseFloat(zoomEl.max), Math.max(parseFloat(zoomEl.min), _cropScale - e.deltaY * 0.001));
    zoomEl.value = _cropScale;
    _cropClamp();
    _applyCropTransform();
  }, { passive: false });
});

/* ══════════════════════════ TALENTO HUMANO (DIRECTORIO) ══════════════════════════ */
async function _openCropForExistingPhoto() {
    if(authLevel < 3 || !editingPersonPhoto) return;
    const existingPerson = editingPersonId ? people.find(x => x.id === editingPersonId) : null;
    _cropOldPhotoUrl = existingPerson?.photo || null;
    try {
        const res = await fetch(editingPersonPhoto + '?t=' + Date.now());
        const blob = await res.blob();
        _cropSrc = URL.createObjectURL(blob);
        const img = document.getElementById('crop-img');
        img.onload = () => {
            _cropNatW = img.naturalWidth;
            _cropNatH = img.naturalHeight;
            const coverScale = VIEW_SIZE / Math.min(_cropNatW, _cropNatH);
            _cropScale = coverScale;
            _cropX = 0; _cropY = 0;
            const zoomEl = document.getElementById('crop-zoom');
            zoomEl.min   = (coverScale * 0.8).toFixed(3);
            zoomEl.max   = (coverScale * 5).toFixed(3);
            zoomEl.value = coverScale;
            _applyCropTransform();
            document.getElementById('crop-modal').classList.add('open');
        };
        img.src = _cropSrc;
    } catch(e) {
        showToast('No se pudo cargar la foto para recortar');
    }
}

function handlePhotoUpload(event) {
    if(authLevel < 3) return;
    const file = event.target.files[0];
    if(!file) return;
    event.target.value = ''; // permite volver a seleccionar el mismo archivo

    const reader = new FileReader();
    // Guardar URL de foto anterior para borrarla si se reemplaza
    const existingPerson = editingPersonId ? people.find(x => x.id === editingPersonId) : null;
    _cropOldPhotoUrl = existingPerson?.photo || null;

    reader.onload = e => {
        _cropSrc = e.target.result;
        const img = document.getElementById('crop-img');
        img.onload = () => {
            _cropNatW = img.naturalWidth;
            _cropNatH = img.naturalHeight;
            // Escala para que la imagen cubra el círculo (cover)
            const coverScale = VIEW_SIZE / Math.min(_cropNatW, _cropNatH);
            _cropScale = coverScale;
            _cropX = 0; _cropY = 0;
            const zoomEl = document.getElementById('crop-zoom');
            zoomEl.min   = (coverScale * 0.8).toFixed(3);
            zoomEl.max   = (coverScale * 5).toFixed(3);
            zoomEl.value = coverScale;
            _applyCropTransform();
            document.getElementById('crop-modal').classList.add('open');
        };
        img.src = _cropSrc;
    };
    reader.readAsDataURL(file);
}

/* ── Formato de nombre de visualización ── */
// Divide el nombre completo en partes automáticamente.
// Soporta "de" como conector de apellido de casada.
// Ej: "María Elena Pérez de García" → first=María, second=Elena, s1=Pérez, de+s2=García
function _splitName(fullName) {
  const words = (fullName || '').trim().split(/\s+/);
  let first = '', second = '', s1 = '', s2 = '';
  // Detectar "de" como conector
  const deIdx = words.findIndex((w, i) => i > 0 && w.toLowerCase() === 'de');
  if(deIdx !== -1 && deIdx < words.length - 1) {
    s2 = 'de ' + words.slice(deIdx + 1).join(' ');
    const before = words.slice(0, deIdx);
    if(before.length >= 3) { first = before[0]; second = before[1]; s1 = before.slice(2).join(' '); }
    else if(before.length === 2) { first = before[0]; s1 = before[1]; }
    else { first = before[0] || ''; }
  } else if(words.length >= 4) {
    first = words[0]; second = words[1]; s1 = words[2]; s2 = words.slice(3).join(' ');
  } else if(words.length === 3) {
    first = words[0]; s1 = words[1]; s2 = words[2];
  } else if(words.length === 2) {
    first = words[0]; s1 = words[1];
  } else {
    first = words[0] || '';
  }
  return { first, second, s1, s2 };
}

window._updateDisplayFormatOpts = function(savedFormat) {
  const sel = document.getElementById('p-display-format');
  if(!sel) return;
  const name = document.getElementById('p-name')?.value.trim() || '';
  const prev = savedFormat !== undefined ? savedFormat : sel.value;
  const { first, second, s1, s2 } = _splitName(name);
  const both = [first, second].filter(Boolean).join(' ');
  const opts = [
    { key:'full',     label: name || 'Nombre completo' },
    { key:'fn_s1',    label: [first, s1].filter(Boolean).join(' ') || '1er nombre + 1er apellido' },
    { key:'fn_s2',    label: [first, s2].filter(Boolean).join(' ') || '1er nombre + 2do apellido' },
    { key:'sn_s1',    label: [second, s1].filter(Boolean).join(' ') || '2do nombre + 1er apellido' },
    { key:'sn_s2',    label: [second, s2].filter(Boolean).join(' ') || '2do nombre + 2do apellido' },
    { key:'both_s1',  label: [both, s1].filter(Boolean).join(' ') || 'Ambos nombres + 1er apellido' },
    { key:'both_s2',  label: [both, s2].filter(Boolean).join(' ') || 'Ambos nombres + 2do apellido' },
  ];
  sel.innerHTML = opts.map(o => `<option value="${o.key}"${prev===o.key?' selected':''}>${esc(o.label)}</option>`).join('');
};

window._getDisplayName = function(p) {
  const fmt = p.displayFormat || 'full';
  if(fmt === 'full') return p.name;
  const { first, second, s1, s2 } = _splitName(p.name);
  const both = [first, second].filter(Boolean).join(' ');
  switch(fmt) {
    case 'fn_s1':   return [first, s1].filter(Boolean).join(' ') || p.name;
    case 'fn_s2':   return [first, s2].filter(Boolean).join(' ') || p.name;
    case 'sn_s1':   return [second, s1].filter(Boolean).join(' ') || p.name;
    case 'sn_s2':   return [second, s2].filter(Boolean).join(' ') || p.name;
    case 'both_s1': return [both, s1].filter(Boolean).join(' ') || p.name;
    case 'both_s2': return [both, s2].filter(Boolean).join(' ') || p.name;
    default:        return p.name;
  }
};

// Elimina evals referentes a tareas que ya no existen
function _pruneStaleEvals(person) {
    if(!person?.evals?.length) return;
    const allTaskIds = new Set(activities.flatMap(a => (a.tasks||[]).map(t => t.id)));
    person.evals = person.evals.filter(e => allTaskIds.has(e.taskId));
}

window._setCargoFilter = function(key) {
    _cargoFilter = key;
    renderPeople();
};

function togglePersonCard(id) {
    if(_expandedPeople.has(id)) _expandedPeople.delete(id);
    else _expandedPeople.add(id);
    const el = document.getElementById('pc-' + id);
    if(el) el.classList.toggle('pc-open', _expandedPeople.has(id));
}

let _rpTimer = null;
window._debouncedRenderPeople = function() {
    clearTimeout(_rpTimer);
    _rpTimer = setTimeout(renderPeople, 150);
};

// Rango jerárquico: número menor = mayor rango en el listado
const CARGO_ORDER = {
  'Coordinador General':1,'Coordinadora General':1,
  'Asistente de Coordinación':2,
  'Director Operativo':3,'Directora Operativa':3,
  'Enlace':4,
  'Servidor':5,'Servidora':5,
  'Colaborador':6,'Colaboradora':6
};

const CARGO_FILTER_GROUPS = [
  { key:'ALL',   label:'Todos' },
  { key:'coord', label:'Coordinación' },
  { key:'dir',   label:'Directores Op.' },
  { key:'enl',   label:'Enlaces' },
  { key:'serv',  label:'Servidores' },
  { key:'colab', label:'Colaboradores' },
];
// Qué cargo(s) de cargo1 incluye cada grupo
const _CARGO_FILTER_MAP = {
  coord: ['Coordinador General','Coordinadora General','Asistente de Coordinación'],
  dir:   ['Director Operativo','Directora Operativa'],
  enl:   ['Enlace'],
  serv:  ['Servidor','Servidora'],
  colab: ['Colaborador','Colaboradora'],
};
let _cargoFilter = 'ALL';

function renderPeople() {
    if(currentTab !== 'people') return;
    const grid = document.getElementById('people-grid');
    const query = document.getElementById('search-people').value.toLowerCase();
    const typeF = document.getElementById('filter-p-type').value;
    const distF = document.getElementById('filter-p-dist').value;
    const statusF = document.getElementById('filter-p-status').value;
    const skillF = document.getElementById('filter-p-skill').value;
    
    const skSel = document.getElementById('filter-p-skill');
    if(skSel.options.length <= 1) {
        let html = `<option value="ALL">Todas las Habilidades</option>`;
        KNOWN_SKILLS.forEach(s => html += `<option value="${s}">${s}</option>`);
        skSel.innerHTML = html;
        skSel.value = skillF;
    }

    // Llenar selector de equipos dinámicamente
    const teamSel = document.getElementById('filter-p-team');
    const teamF = teamSel?.value || 'ALL';
    if(teamSel) {
        const prev = teamSel.value;
        teamSel.innerHTML = '<option value="ALL">Todos los Equipos</option>' +
            teams.map(tm => `<option value="${tm.id}">${esc(tm.name)}</option>`).join('');
        teamSel.value = prev;
    }

    let filtered = people.filter(p => {
        let matchQuery = p.name.toLowerCase().includes(query) || (p.district && p.district.toLowerCase().includes(query));
        let matchType = typeF === 'ALL' || p.type === typeF;
        let matchDist = distF === 'ALL' || p.district === distF;
        let matchStatus = statusF === 'active' ? !p.archived : !!p.archived;
        let matchSkill = skillF === 'ALL' || (p.skills && p.skills.some(s => s.name === skillF && s.rating >= 7));
        let matchTeam = teamF === 'ALL' || (() => {
            const tm = teams.find(t => t.id === teamF);
            if(!tm) return false;
            return (tm.leaderIds||[]).includes(p.id) || (tm.memberIds||[]).includes(p.id);
        })();
        let matchCargo = _cargoFilter === 'ALL' || (() => {
            const c1Role = p.cargos?.[0]?.role || p.type;
            const c2Role = p.cargos?.[1]?.role;
            const allowed = _CARGO_FILTER_MAP[_cargoFilter] || [];
            return allowed.includes(c1Role) || allowed.includes(c2Role);
        })();
        return matchQuery && matchType && matchDist && matchStatus && matchSkill && matchTeam && matchCargo;
    });

    // Ordenamiento
    if(skillF !== 'ALL') {
        filtered.sort((a, b) => {
            const rA = (a.skills||[]).find(s => s.name === skillF)?.rating || 0;
            const rB = (b.skills||[]).find(s => s.name === skillF)?.rating || 0;
            return rB - rA;
        });
    } else {
        filtered.sort((a, b) => {
            const c1A = a.cargos?.[0]?.role || a.type || '';
            const c1B = b.cargos?.[0]?.role || b.type || '';
            const oA = CARGO_ORDER[c1A] || 5;
            const oB = CARGO_ORDER[c1B] || 5;
            return oA - oB; // ascendente: menor número = mayor jerarquía
        });
    }

    const pc = document.getElementById('people-count');
    if(pc) pc.textContent = `Total: ${filtered.length}`;

    // Chips de filtro por cargo
    const cbar = document.getElementById('cargo-filter-bar');
    if(cbar) {
        cbar.innerHTML = CARGO_FILTER_GROUPS.map(g =>
            `<span class="cargochip${_cargoFilter===g.key?' active':''}" onclick="_setCargoFilter('${g.key}')">${g.label}</span>`
        ).join('');
    }

    // Banner de edición bloqueada para nivel 3
    const lockBanner = document.getElementById('people-lock-banner');
    if(lockBanner) {
        lockBanner.style.display = (authLevel >= 3 && !_editUnlocked) ? 'flex' : 'none';
    }

    if(filtered.length === 0) {
        grid.innerHTML = `<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">Directorio vacío o sin coincidencias</div><div class="empty-sub">Agrega talento humano o ajusta los filtros</div></div>`;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        let age = '-';
        if(p.dob) {
            const birthDate = new Date(p.dob); const diff = Date.now() - birthDate.getTime();
            age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
        }
        
        let topSkills = (p.skills||[]).filter(sk => sk.rating >= 7).sort((a,b)=>b.rating-a.rating);
        const skHTML = topSkills.map(sk => {
            const c = _skillColor(sk.rating);
            return `<div class="pc-skill">
                <span class="pc-sk-name">${esc(sk.name)}</span>
                <div style="flex:1;height:3px;background:var(--border);border-radius:2px;margin:0 5px;min-width:20px;">
                  <div style="width:${sk.rating*10}%;height:100%;background:${c};border-radius:2px;"></div>
                </div>
                <span style="color:${c};font-size:.65rem;font-weight:800;flex-shrink:0;">${sk.rating}</span>
            </div>`;
        }).join('');
        const noSkillsHTML = `<div style="font-size:.65rem; color:var(--muted); font-style:italic; padding: 5px;">Aún en desarrollo (Niveles &lt; 7)</div>`;

        const evals = p.evals || [];
        let avgEval = '-';
        if(evals.length > 0) { avgEval = (evals.reduce((sum, e) => sum + e.rating, 0) / evals.length).toFixed(1); }
        const schHTML = (p.schedules||[]).map(h => `<span class="sch-chip">${h}</span>`).join('');
        const arcBtn = p.archived
          ? `<button class="btn btn-danger btn-sm req-auth-3 perm-btn" onclick="toggleArchivePerson('${p.id}', event)" title="Eliminar permanentemente">🗑 Eliminar</button>
             <button class="btn btn-ghost btn-sm req-auth-3 perm-btn" onclick="toggleArchivePerson('${p.id}', event, true)" title="Desarchivar" style="font-size:.65rem;">↩️</button>`
          : `<button class="ico-btn req-auth-3 perm-btn" onclick="toggleArchivePerson('${p.id}', event)" title="Archivar persona" style="opacity:.35;transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.35">📥</button>`;

        const avStyle = p.photo ? `background-image:url(${p.photo});background-size:cover;background-color:transparent;color:transparent;font-size:0;` : `background:${avc(p.name)}`;
        const avContent = p.photo ? '' : ini(p.name);

        let sex = p.sex || 'Masculino';
        let catText = formatGender(p.type, sex);

        let c1 = p.cargos && p.cargos[0] ? p.cargos[0] : {role: p.type, area: ''};
        let c2 = p.cargos && p.cargos.length > 1 ? p.cargos[1] : null;

        let fc1 = formatCargoObj(c1, sex);
        let fc2 = formatCargoObj(c2, sex);

        let arrCargos = [];
        if(fc1 && fc1 !== catText) arrCargos.push(fc1);
        if(fc2) arrCargos.push(fc2);

        let cargoSubHtml = '';
        if(arrCargos.length > 0) {
            cargoSubHtml = `<div style="font-size:.65rem; color:var(--cyan); font-weight:700; margin-top:2px;">${arrCargos.join(' | ')}</div>`;
        }

        // Workload
        const activeTasks = activities.flatMap(a=>(a.tasks||[]).filter(t=>!t.done&&!t.cancelled&&(t.responsable===p.name||(t.assignedPeople||[]).includes(p.name)||(t.coliders||[]).includes(p.name))));
        const wlCls = activeTasks.length===0?'wl-0':activeTasks.length<=2?'wl-low':activeTasks.length<=4?'wl-mid':'wl-high';
        const wlIcon = activeTasks.length===0?'⚪':activeTasks.length<=2?'🟢':activeTasks.length<=4?'🟡':'🔴';
        const wlBadge = `<span class="wl-badge ${wlCls}">${wlIcon} ${activeTasks.length} tarea${activeTasks.length!==1?'s':''} activa${activeTasks.length!==1?'s':''}</span>`;

        // History
        const histItems = [];
        activities.forEach(a => {
            (a.tasks||[]).forEach(t => {
                const isLead = t.responsable === p.name;
                const isSupport = (t.assignedPeople||[]).includes(p.name);
                if(isLead || isSupport) {
                    const evt = events.find(e => e.id === a.eventId);
                    histItems.push({evt, a, t, isLead});
                }
            });
        });
        histItems.sort((x,y) => new Date(y.a.fecha||'2000-01-01') - new Date(x.a.fecha||'2000-01-01'));
        const histHTML = histItems.slice(0,5).map(({evt, a, t, isLead}) => {
            const evalObj = (p.evals||[]).find(e => e.taskId === t.id);
            return `<div class="hist-item">
                <div class="hist-task-name">${esc(t.name)}</div>
                <div class="hist-meta">
                    <span class="hist-role ${isLead?'hist-role-lead':'hist-role-support'}">${isLead?'👑 Líder':'👥 Apoyo'}</span>
                    <span>${esc(a.activity)}</span>
                    ${evt?`<span>📅 ${formatDateStr(evt.date)}</span>`:''}
                    ${evalObj?`<span style="color:var(--amber);">★ ${evalObj.rating}</span>`:''}
                </div>
            </div>`;
        }).join('') || `<div style="font-size:.65rem;color:var(--muted2);font-style:italic;padding:4px;">Sin participaciones registradas</div>`;
        const histExtra = histItems.length > 5 ? `<div style="font-size:.62rem;color:var(--muted);text-align:center;padding:4px;">+${histItems.length-5} más…</div>` : '';

        const isOpen = _expandedPeople.has(p.id);
        const editIcoBtn = authLevel >= 3
          ? `<button class="ico-btn req-auth-3 perm-btn" onclick="event.stopPropagation();openPersonModal('${p.id}')" title="Editar perfil" style="opacity:.45;transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.45">✏️</button>`
          : '';

        // Botón activar usuario (solo admin)
        const linkedUser = users ? users.find(u => u.linkedPerson === p.name || (!u.linkedPerson && u.name === p.name)) : null;
        const activateBtn = authLevel >= 3
          ? linkedUser
            ? `<div style="background:rgba(32,172,244,.08);border:1px solid rgba(32,172,244,.2);border-radius:6px;padding:6px 10px;font-size:.63rem;color:var(--cyan);display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px;">
                <span>🔑 Usuario: <b>${esc(linkedUser.username||linkedUser.name)}</b></span>
                <button class="btn btn-ghost" style="font-size:.6rem;padding:3px 8px;" onclick="event.stopPropagation();_openUserSettingsTab()">Editar</button>
               </div>`
            : `<button class="btn btn-ghost btn-sm req-auth-3 perm-btn" style="width:100%;margin-top:8px;font-size:.65rem;" onclick="event.stopPropagation();activatePersonAccess('${p.id}')">🔑 Activar acceso de usuario</button>`
          : '';

        return `<div class="person-card ${p.archived?'archived':''} ${isOpen?'pc-open':''}" id="pc-${p.id}">
            <div class="pc-hdr" onclick="togglePersonCard('${p.id}')">
                <div class="pc-av" style="${avStyle}">${avContent}</div>
                <div class="pc-info">
                    <div class="pc-name">${esc(_getDisplayName(p))}${p.code ? `<span class="pc-code">${esc(p.code)}</span>` : ''}</div>
                    ${arrCargos.map(c=>`<div class="pc-cargo-sub">${c}</div>`).join('')}
                    <div class="pc-meta"><span class="pc-type ${p.type==='Colaborador'?'colab':''}">${catText}</span><span>${age} años</span><span>${esc(p.district)}</span></div>
                    ${p.email ? `<div style="font-size:.58rem;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">✉️ ${esc(p.email)}</div>` : ''}
                    <div style="margin-top:6px;">${wlBadge}</div>
                </div>
                <div class="pc-hdr-right" onclick="event.stopPropagation();">
                    ${editIcoBtn}
                    ${arcBtn}
                </div>
            </div>
            <div style="padding:0 10px 10px;border-bottom:1px solid var(--border);">
                <button class="btn btn-ghost btn-sm" style="width:100%;font-size:.65rem;margin-top:10px;" onclick="togglePersonCard('${p.id}')">
                    ${isOpen ? '▲ Ocultar info' : '▼ Ver info completa'}
                </button>
            </div>
            <div class="pc-preview">
                <div class="pc-sec"><div class="pc-eval"><div><div class="pc-sec-title" style="margin:0;">Evaluación Promedio</div><div style="font-size:.63rem;color:var(--muted);">${evals.length} tarea(s) evaluada(s)</div></div><div class="pc-eval-num">★ ${avgEval}</div></div></div>
                <div class="pc-sec"><div class="pc-sec-title">Horarios Disponibles</div><div class="sch-chips">${schHTML || '<span class="ai-val muted">Sin definir</span>'}</div></div>
            </div>
            <div class="pc-detail">
                <div style="padding-top:10px;">
                  <div class="pc-sec"><div class="pc-sec-title">Habilidades Destacadas (≥ 7)</div><div class="pc-skills">${skHTML || noSkillsHTML}</div></div>
                  <div class="pc-sec"><div class="pc-sec-title">Historial de Participación (últimas 5)</div>${histHTML}${histExtra}</div>
                  ${(() => { const myTeam = teams.find(t => t.memberIds?.includes(p.id) || t.leaderId === p.id); return myTeam ? `<div class="pc-sec"><div class="pc-sec-title">Equipo</div><div style="font-size:.73rem;font-weight:700;color:var(--cyan);">👥 ${esc(myTeam.name)}${myTeam.leaderId===p.id?' <span style=\'font-size:.6rem;color:var(--amber);\'>Líder</span>':''}</div></div>` : ''; })()}
                  ${activateBtn}
                  ${editIcoBtn ? `<div class="pc-actions" style="margin-top:8px;"><button class="btn btn-primary btn-sm perm-btn" onclick="event.stopPropagation();openPersonModal('${p.id}')">✏️ Editar perfil</button></div>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

/* ── Cargo options by sex ── */
// Cargos de "cargo" (rol dentro de un área) — excluye las categorías base (Servidor/Colaborador)
const CARGOS_M = ['Coordinador General','Asistente de Coordinación','Director Operativo','Enlace'];
const CARGOS_F = ['Coordinadora General','Asistente de Coordinación','Directora Operativa','Enlace'];
const CARGOS_VAL = ['Coordinador General','Asistente de Coordinación','Director Operativo','Enlace'];

function _cargoLabel(val, sex){
  const idx = CARGOS_VAL.indexOf(val);
  if(idx < 0) return val;
  return sex === 'Femenino' ? CARGOS_F[idx] : CARGOS_M[idx];
}

function _buildCargoOpts(selId, sex, currentVal, withNone){
  const sel = document.getElementById(selId);
  if(!sel) return;
  const prev = currentVal !== undefined ? currentVal : sel.value;
  const type = document.getElementById('p-type')?.value || 'Servidor';
  // Colaboradores solo pueden tener "Ninguno" — no tienen cargos de liderazgo
  let html = `<option value="Ninguno"${(!prev||prev==='Ninguno')?' selected':''}>Ninguno</option>`;
  if(type === 'Servidor') {
    CARGOS_VAL.forEach(v => {
      html += `<option value="${v}"${prev===v?' selected':''}>${_cargoLabel(v,sex)}</option>`;
    });
  }
  sel.innerHTML = html;
  toggleArea(selId === 'p-cargo1' ? 1 : 2);
}

function _updateCargoOptions(sex){
  const s = sex || document.getElementById('p-sex')?.value || 'Masculino';
  const t = document.getElementById('p-type');
  if(t){
    const tv = t.value;
    t.innerHTML = `<option value="Servidor"${tv==='Servidor'?' selected':''}>${s==='Femenino'?'Servidora':'Servidor'}</option>`+
                  `<option value="Colaborador"${tv==='Colaborador'?' selected':''}>${s==='Femenino'?'Colaboradora':'Colaborador'}</option>`;
  }
  _buildCargoOpts('p-cargo1', s, undefined, false);
  _buildCargoOpts('p-cargo2', s, undefined, true);
}

function _getAge(dob){
  if(!dob) return null;
  const b = new Date(dob), now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if(m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function _onPersonDobChange(){
  const dob = document.getElementById('p-dob')?.value;
  const age = _getAge(dob);
  const rem = document.getElementById('p-age-reminder');
  if(rem) rem.style.display = (age === 15) ? '' : 'none';
  if(age === null) return;
  const typeEl = document.getElementById('p-type');
  if(!typeEl) return;
  if(age >= 16){
    typeEl.value = 'Servidor';
  } else if(age >= 10 && age <= 15){
    typeEl.value = 'Colaborador';
  }
  // auto-set default cargo to match type
  const sex = document.getElementById('p-sex')?.value || 'Masculino';
  const cargo1El = document.getElementById('p-cargo1');
  if(cargo1El){
    const defaultCargo = age >= 16 ? 'Servidor' : 'Colaborador';
    if(cargo1El.value === 'Servidor' || cargo1El.value === 'Colaborador') {
      cargo1El.value = defaultCargo;
    }
  }
}

window._onPersonTypeChange = function() {
  const s = document.getElementById('p-sex')?.value || 'Masculino';
  _buildCargoOpts('p-cargo1', s, 'Ninguno', false);
  _buildCargoOpts('p-cargo2', s, 'Ninguno', true);
  const type = document.getElementById('p-type')?.value || 'Servidor';
  const cefecWrap = document.getElementById('p-cefec-wrap');
  if(cefecWrap) cefecWrap.style.display = type === 'Colaborador' ? '' : '';
  // Colaboradores: limpia los cargos que no aplican
  if(type === 'Colaborador') {
    const cargo1El = document.getElementById('p-cargo1');
    const cargo2El = document.getElementById('p-cargo2');
    if(cargo1El && cargo1El.value !== 'Ninguno') cargo1El.value = 'Ninguno';
    if(cargo2El && cargo2El.value !== 'Ninguno') cargo2El.value = 'Ninguno';
    toggleArea(1); toggleArea(2);
  }
};

function _onPersonSexChange(){
  _updateCargoOptions();
}

window.toggleArea = function(num, preset) {
    const role = document.getElementById('p-cargo' + num).value;
    const wrap = document.getElementById('wrap-area' + num);
    if(!wrap) return;
    if(role === 'Enlace') {
        const opts = `<option value="">— Selecciona un departamento —</option>` +
            DEPARTMENTS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
        wrap.innerHTML = `<label>Enlace de… (departamento) *</label>
            <select id="p-area${num}">${opts}</select>`;
        wrap.style.display = 'flex';
    } else if(role === 'Director Operativo') {
        const dl = (teams||[]).map(t => `<option value="${esc(t.name)}">`).join('');
        wrap.innerHTML = `<label>Director Operativo de… (equipo o escribe) *</label>
            <input type="text" id="p-area${num}" list="team-area-list-${num}" placeholder="Elige un equipo o escribe manualmente"/>
            <datalist id="team-area-list-${num}">${dl}</datalist>`;
        wrap.style.display = 'flex';
    } else {
        wrap.innerHTML = '';
        wrap.style.display = 'none';
    }
    if(preset !== undefined) {
        const el = document.getElementById('p-area' + num);
        if(el) el.value = preset || '';
    }
}

function toggleArchivePerson(id, e, unarchive = false) {
    if(authLevel < 3) return;
    if(e) e.stopPropagation();
    const p = people.find(x => x.id === id);
    if(!p) return;

    if(unarchive) {
        p.archived = false;
        showToast('📤 Persona desarchivada');
        afterChange();
        return;
    }

    if(p.archived) {
        // Eliminar permanentemente — requiere confirmar + PIN
        requestPin(3, () => {
            customConfirm(`¿Eliminar permanentemente a "${p.name}"? Esta acción no se puede deshacer.`, () => {
                // Intentar borrar foto de Supabase Storage si existe
                if(p.photo && p.photo.includes('/storage/v1/object/public/avatars/')) {
                    const filename = p.photo.split('/avatars/').pop();
                    fetch(`${SUPA_URL}/storage/v1/object/avatars/${filename}`, {
                        method: 'DELETE',
                        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
                    }).catch(() => {});
                }
                people = people.filter(x => x.id !== id);
                showToast('🗑 Persona eliminada');
                afterChange();
            });
        });
    } else {
        customConfirm(`¿Archivar a "${p.name}"? Seguirá en el historial pero no aparecerá en asignaciones.`, () => {
            p.archived = true;
            showToast('📥 Persona archivada');
            afterChange();
        });
    }
}

function openPersonModal(id=null) {
    if(authLevel < 3) return;
    editingPersonId = id;
    document.getElementById('person-modal-ttl').textContent = id ? 'Editar Perfil' : 'Nueva Persona';
    
    document.getElementById('p-sch-opts').innerHTML = SERVICE_HOURS.map(h => 
        `<div class="sch-opt" data-val="${h}" onclick="this.classList.toggle('sel')">${h}</div>`
    ).join('');

    if(id) {
        const p = people.find(x => x.id === id);
        document.getElementById('p-id').value = p.id;
        document.getElementById('p-name').value = p.name;
        const emailEl = document.getElementById('p-email'); if(emailEl) emailEl.value = p.email || '';
        // Username vinculado (desde persona o desde usuario ligado)
        const unEl = document.getElementById('p-username');
        if(unEl) {
            const lu = typeof users !== 'undefined' ? users.find(u => u.linkedPerson === p.name || (!u.linkedPerson && u.name === p.name)) : null;
            unEl.value = p.linkedUsername || lu?.username || '';
        }
        _updateDisplayFormatOpts(p.displayFormat || 'full');
        document.getElementById('p-code').value = p.code || '';
        const sex = p.sex || 'Masculino';
        document.getElementById('p-sex').value = sex;
        _updateCargoOptions(sex);
        document.getElementById('p-type').value = p.type || 'Servidor';

        let c1 = p.cargos && p.cargos[0] ? p.cargos[0] : {role: p.type, area: ''};
        let c2 = p.cargos && p.cargos[1] ? p.cargos[1] : {role: 'Ninguno', area: ''};

        _buildCargoOpts('p-cargo1', sex, c1.role, false);
        _buildCargoOpts('p-cargo2', sex, c2.role, true);

        toggleArea(1, c1.area);
        toggleArea(2, c2.area);

        document.getElementById('p-dob').value = p.dob || '';
        document.getElementById('p-district').value = p.district || 'Distrito 1';

        document.getElementById('p-diploma-cefec').checked = p.diplomaCEFEC || false;
        document.getElementById('p-diploma-prot').checked = p.diplomaProtagonismo || false;
        const ageNow = _getAge(p.dob);
        const rem = document.getElementById('p-age-reminder');
        if(rem) rem.style.display = (ageNow === 15) ? '' : 'none';
        
        document.querySelectorAll('#p-sch-opts .sch-opt').forEach(el => {
            if((p.schedules||[]).includes(el.getAttribute('data-val'))) el.classList.add('sel');
        });
        
        renderPersonSkillsModal(p.skills || []);

        editingPersonPhoto = p.photo || null;
        if(editingPersonPhoto) {
            document.getElementById('p-photo-preview').style.backgroundImage = `url(${editingPersonPhoto})`;
            document.getElementById('p-photo-preview').innerHTML = '';
        } else {
            document.getElementById('p-photo-preview').style.backgroundImage = 'none';
            document.getElementById('p-photo-preview').innerHTML = '📷';
        }
        document.getElementById('btn-recrop').style.display = editingPersonPhoto ? '' : 'none';
    } else {
        ['p-id','p-name','p-dob','p-code','p-email','p-username'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
        _updateDisplayFormatOpts('full');
        document.getElementById('p-sex').value = 'Masculino';
        _updateCargoOptions('Masculino');
        document.getElementById('p-type').value = 'Servidor';
        _buildCargoOpts('p-cargo1', 'Masculino', 'Servidor', false);
        _buildCargoOpts('p-cargo2', 'Masculino', 'Ninguno', true);
        toggleArea(1);
        toggleArea(2);
        document.getElementById('p-diploma-cefec').checked = false;
        document.getElementById('p-diploma-prot').checked = false;
        const rem = document.getElementById('p-age-reminder');
        if(rem) rem.style.display = 'none';

        document.getElementById('p-district').value = 'Distrito 1';
        
        renderPersonSkillsModal([]);

        editingPersonPhoto = null;
        document.getElementById('p-photo-preview').style.backgroundImage = 'none';
        document.getElementById('p-photo-preview').innerHTML = '📷';
        document.getElementById('btn-recrop').style.display = 'none';
    }

    _highlightDistrictSchedules();

    // Llenar selector de equipos
    const teamSection = document.getElementById('p-team-section');
    const teamSel = document.getElementById('p-team-sel');
    if(teamSection && teamSel) {
        if(teams.length > 0) {
            teamSection.style.display = '';
            teamSel.innerHTML = '<option value="">— Ninguno —</option>' +
                teams.map(tm => `<option value="${tm.id}">${esc(tm.name)}</option>`).join('');
            // Si es persona existente, pre-seleccionar su equipo actual
            let currentTeamId = '', currentRole = 'member';
            if(id) {
                for(const tm of teams) {
                    if((tm.leaderIds || (tm.leaderId ? [tm.leaderId] : [])).includes(id)) {
                        currentTeamId = tm.id; currentRole = 'leader'; break;
                    } else if((tm.memberIds || []).includes(id)) {
                        currentTeamId = tm.id; currentRole = 'member'; break;
                    }
                }
            }
            teamSel.value = currentTeamId;
            const trEl = document.getElementById('p-team-role'); if(trEl) trEl.value = currentRole;
        } else {
            teamSection.style.display = 'none';
        }
    }

    // Historial de cambios
    const histEl = document.getElementById('p-history-section');
    if(histEl) {
      const hist = id ? (people.find(x=>x.id===id)?._personHistory||[]) : [];
      if(hist.length > 0) {
        const fmt = ts => new Date(ts).toLocaleString('es-SV',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
        histEl.innerHTML = `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">🕓 Historial de cambios (${hist.length})</div>
          ${[...hist].reverse().map(h=>`<div class="phist-item">
            <div style="flex:1;min-width:0;">
              <span class="phist-by">${esc(h.by)}</span>
              ${h.changes.map(c=>`<div style="margin-top:2px;"><span class="phist-field">${esc(c.field)}:</span> <span class="phist-val">${esc(c.from)} → ${esc(c.to)}</span></div>`).join('')}
            </div>
            <span class="phist-ts">${fmt(h.at)}</span>
          </div>`).join('')}
        </div>`;
      } else {
        histEl.innerHTML = '';
      }
    }

    document.getElementById('person-modal').classList.add('open');
    // Siempre abrir desde el inicio
    const mb = document.querySelector('#person-modal .modal-body');
    if(mb) setTimeout(() => { mb.scrollTop = 0; }, 30);
}

function _skillColor(v) {
    return v >= 8 ? 'var(--green)' : v >= 5 ? 'var(--cyan)' : v >= 1 ? 'var(--amber)' : 'var(--border)';
}
window._updateSkillBar = function(idx, val) {
    const v = parseInt(val);
    const col = _skillColor(v);
    const bar = document.getElementById('skill-bar-'+idx);
    const num = document.getElementById('skill-val-'+idx);
    if(bar) { bar.style.width = (v*10)+'%'; bar.style.background = col; }
    if(num) { num.textContent = v; num.style.color = col; }
};

function renderPersonSkillsModal(personSkills = []) {
    const container = document.getElementById('p-skills-list');
    const LABELS = ['0','','','','','5','','','','','10'];
    container.innerHTML = KNOWN_SKILLS.map((sk, idx) => {
        const existing = personSkills.find(s => s.name === sk);
        const val = existing ? existing.rating : 0;
        const col = _skillColor(val);
        return `<div style="display:flex;align-items:center;gap:8px;background:var(--s1);padding:8px 12px;border-radius:var(--rxs);border:1px solid var(--border);">
            <div style="font-size:.72rem;font-weight:700;min-width:110px;flex-shrink:0;">${esc(sk)}</div>
            <input type="range" min="0" max="10" value="${val}" class="skill-slider" id="skill-sl-${idx}"
                oninput="_updateSkillBar(${idx},this.value)" style="flex:1;min-width:60px;">
            <div style="width:56px;height:5px;background:var(--s3);border-radius:4px;overflow:hidden;flex-shrink:0;">
              <div id="skill-bar-${idx}" style="height:100%;width:${val*10}%;background:${col};border-radius:4px;transition:width .15s,background .15s;"></div>
            </div>
            <span id="skill-val-${idx}" style="font-family:'Nunito',sans-serif;font-weight:800;color:${col};width:16px;text-align:center;flex-shrink:0;">${val}</span>
        </div>`;
    }).join('');
}

function closePersonModal() {
    document.getElementById('person-modal').classList.remove('open');
}

window._checkCefecReminders = function() {
    if(typeof _getReminders !== 'function' || typeof _saveReminders !== 'function') return;
    let reminders = _getReminders();
    // Elimina recordatorios CEFEC anteriores generados por esta función
    reminders = reminders.filter(r => !r._cefecAuto);
    people.filter(p => !p.archived && p.type === 'Servidor' && !p.diplomaCEFEC).forEach(p => {
        const age = _getAge(p.dob);
        const urgent = age !== null && age >= 16;
        reminders.push({
            id: 'cefec_' + p.id,
            _cefecAuto: true,
            message: urgent
                ? `🚨 URGENTE: ${esc(p.name)} tiene ${age} años y aún NO tiene el diplomado CEFEC. Debe graduarse ya para poder seguir sirviendo.`
                : `🎓 Recordatorio: ${esc(p.name)} debe graduarse del diplomado CEFEC para continuar sirviendo.`,
            priority: urgent ? 'high' : 'normal',
            to: null,
            from: 'Sistema',
            ts: Date.now(),
        });
    });
    if(typeof _saveReminders === 'function') _saveReminders(reminders);
};

window.activatePersonAccess = function(personId) {
    if(authLevel < 3) return;
    const p = people.find(x => x.id === personId);
    if(!p) return;
    // Abrir modal de gestión de usuarios con el form pre-llenado para esta persona
    const modal = document.getElementById('user-mgmt-modal');
    if(modal) {
        modal.classList.add('open');
        if(window.renderUserMgmt) renderUserMgmt();
        setTimeout(() => {
            if(window.openUserForm) openUserForm(null, p.name, p.email || '');
        }, 100);
    }
};

window._openUserSettingsTab = function() {
    const modal = document.getElementById('user-mgmt-modal');
    if(modal) {
        modal.classList.add('open');
        if(window.renderUserMgmt) renderUserMgmt();
    }
};

function savePerson() {
    if(authLevel < 3) return;
    const name = document.getElementById('p-name').value.trim();
    const email = document.getElementById('p-email')?.value.trim().toLowerCase() || '';
    const code = document.getElementById('p-code').value.trim().toUpperCase();
    const linkedUsername = document.getElementById('p-username')?.value.trim().toLowerCase().replace(/\s+/g,'') || '';
    const sex = document.getElementById('p-sex').value;
    const type = document.getElementById('p-type').value;
    const dob = document.getElementById('p-dob').value;
    const district = document.getElementById('p-district').value.trim();

    const cargo1 = document.getElementById('p-cargo1').value;
    const area1 = document.getElementById('p-area1')?.value.trim() || '';
    const cargo2 = document.getElementById('p-cargo2').value;
    const area2 = document.getElementById('p-area2')?.value.trim() || '';

    function _hlP(id){ const el=document.getElementById(id); if(el){el.style.borderColor='var(--red)';el.style.boxShadow='0 0 0 2px rgba(251,99,126,.3)';setTimeout(()=>{el.style.borderColor='';el.style.boxShadow='';},3000);} }
    let errors = [];
    if(!name){ errors.push('p-name'); }
    if(!type){ errors.push('p-type'); }
    if(!district){ errors.push('p-district'); }
    if((cargo1 === 'Director Operativo' || cargo1 === 'Enlace') && !area1) errors.push('p-area1');
    if((cargo2 === 'Director Operativo' || cargo2 === 'Enlace') && !area2) errors.push('p-area2');
    if(errors.length){
        errors.forEach(id => _hlP(id));
        const first = document.getElementById(errors[0]);
        if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
        showToast('⚠️ Completa los campos marcados en rojo');
        return;
    }

    let cargos = [];
    if(cargo1 && cargo1 !== 'Ninguno') cargos.push({role: cargo1, area: area1});
    if(cargo2 && cargo2 !== 'Ninguno') cargos.push({role: cargo2, area: area2});

    let schedules = [];
    document.querySelectorAll('#p-sch-opts .sch-opt.sel').forEach(el => schedules.push(el.getAttribute('data-val')));

    let updatedSkills = [];
    KNOWN_SKILLS.forEach((sk, idx) => {
        let val = parseInt(document.getElementById(`skill-sl-${idx}`).value);
        updatedSkills.push({ name: sk, rating: val });
    });

    const diplomaCEFEC = document.getElementById('p-diploma-cefec')?.checked || false;
    const diplomaProtagonismo = document.getElementById('p-diploma-prot')?.checked || false;

    const existingEvals = editingPersonId ? (people.find(x=>x.id===editingPersonId).evals||[]) : [];
    const allTaskIds = new Set(activities.flatMap(a => (a.tasks||[]).map(t => t.id)));
    const cleanEvals = existingEvals.filter(e => allTaskIds.has(e.taskId));

    const displayFormat = document.getElementById('p-display-format')?.value || 'full';

    const old = editingPersonId ? people.find(x => x.id === editingPersonId) : null;

    // Detectar campos cambiados para historial
    const _histChanges = [];
    if(old) {
      const _chk = (field, label, a, b) => { if(String(a||'') !== String(b||'')) _histChanges.push({ field: label, from: String(a||'—'), to: String(b||'—') }); };
      _chk('name',    'Nombre',    old.name,    name);
      _chk('type',    'Tipo',      old.type,    type);
      _chk('district','Distrito',  old.district, district);
      _chk('sex',     'Sexo',      old.sex,     sex);
      _chk('dob',     'Fecha nac.',old.dob,     dob);
      _chk('email',   'Correo',    old.email,   email||null);
      _chk('displayFormat','Formato',old.displayFormat, displayFormat);
      const oldCargos = JSON.stringify((old.cargos||[]).map(c=>c.role+c.area));
      const newCargos = JSON.stringify(cargos.map(c=>c.role+c.area));
      if(oldCargos !== newCargos) _histChanges.push({ field: 'Cargos', from: (old.cargos||[]).map(c=>c.role).join(', ')||'—', to: cargos.map(c=>c.role).join(', ')||'—' });
      const oldSch = JSON.stringify([...(old.schedules||[])].sort());
      const newSch = JSON.stringify([...schedules].sort());
      if(oldSch !== newSch) _histChanges.push({ field: 'Horarios', from: (old.schedules||[]).join(', ')||'—', to: schedules.join(', ')||'—' });
      if(old.photo !== editingPersonPhoto) _histChanges.push({ field: 'Foto', from: old.photo?'Tenía foto':'Sin foto', to: editingPersonPhoto?'Nueva foto':'Sin foto' });
    }

    const _existingHistory = old?._personHistory || [];
    const _newHistory = _histChanges.length > 0
      ? [..._existingHistory, { by: currentUser?.name || 'Sistema', at: Date.now(), changes: _histChanges }]
      : _existingHistory;

    const obj = {
        id: editingPersonId || 'p_' + Date.now().toString(36),
        name, email: email || null, code, linkedUsername: linkedUsername || null, displayFormat, sex, type, dob, district, schedules, cargos,
        diplomaCEFEC, diplomaProtagonismo,
        photo: editingPersonPhoto,
        skills: updatedSkills,
        evals: cleanEvals,
        archived: editingPersonId ? (people.find(x=>x.id===editingPersonId).archived||false) : false,
        _personHistory: _newHistory,
        _savedAt: Date.now()
    };

    // Sincronizar correo y username con el usuario vinculado (o crear vínculo por username)
    if(typeof users !== 'undefined') {
        let linkedUser = users.find(u => u.linkedPerson === obj.name);
        // Si hay username nuevo y no hay usuario vinculado, buscar por username
        if(!linkedUser && linkedUsername) {
            linkedUser = users.find(u => (u.username||'').toLowerCase() === linkedUsername);
        }
        if(linkedUser) {
            linkedUser.name = _getDisplayName(obj);
            if(email) linkedUser.email = email;
            if(linkedUsername) linkedUser.username = linkedUsername;
            linkedUser.linkedPerson = obj.name; // asegurar vínculo
        }
    }

    if(editingPersonId) {
        const idx = people.findIndex(x=>x.id===editingPersonId);
        if(idx > -1) people[idx] = obj;
        showToast('✏️ Perfil actualizado');
    } else {
        people.push(obj);
        showToast('✅ Persona agregada al directorio');
    }
    // Asignar / reasignar equipo
    const selectedTeamId = document.getElementById('p-team-sel')?.value || '';
    const selectedRole   = document.getElementById('p-team-role')?.value || 'member';
    // Quitar de todos los equipos donde ya estuviera (para aplicar el nuevo estado limpio)
    teams.forEach(tm => {
        tm.leaderIds = (tm.leaderIds || (tm.leaderId ? [tm.leaderId] : [])).filter(i => i !== obj.id);
        tm.leaderId  = tm.leaderIds[0] || null;
        tm.memberIds = (tm.memberIds || []).filter(i => i !== obj.id);
        tm._savedAt  = Date.now();
    });
    // Agregar al equipo seleccionado
    if(selectedTeamId) {
        const tm = teams.find(t => t.id === selectedTeamId);
        if(tm) {
            if(selectedRole === 'leader') {
                tm.leaderIds = [...new Set([...tm.leaderIds, obj.id])];
                tm.leaderId  = tm.leaderIds[0];
            } else {
                tm.memberIds = [...new Set([...tm.memberIds, obj.id])];
            }
            tm._savedAt = Date.now();
        }
    }
    closePersonModal();
    _checkCefecReminders();
    afterChange();
    // Si hubo cambio de foto: sync inmediato antes de que el usuario pueda recargar,
    // y borrar la foto vieja solo después de confirmar que Supabase recibió el dato nuevo
    if(window._pendingPhotoDelete !== undefined) {
        const toDelete = window._pendingPhotoDelete;
        window._pendingPhotoDelete = undefined;
        clearTimeout(_syncTimer);
        _syncTimer = null;
        _syncToCloud().then(() => {
            if(toDelete && toDelete.includes('/storage/v1/object/public/avatars/')) {
                const oldFile = toDelete.split('/avatars/').pop();
                fetch(`${SUPA_URL}/storage/v1/object/avatars/${oldFile}`, {
                    method: 'DELETE',
                    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
                }).catch(()=>{});
            }
        });
    }
}

