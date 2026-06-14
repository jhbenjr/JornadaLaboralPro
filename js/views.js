/* ══════════════════════════ EXPORT CSV ══════════════════════════ */
function exportCSV() {
  const activeEvt = events.find(e => e.id === activeEventId);
  const acts = getActiveActivities();
  if(!acts.length) { showToast('⚠️ No hay actividades para exportar'); return; }

  const rows = [['Evento','Fecha','Actividad','Horario','Prioridad','Estado','Responsable Gral.','Tarea','Tipo Tarea','Lugar','Hora Inicio','Hora Fin','Responsable Tarea','Asignados','Entregables']];
  acts.forEach(a => {
    const status = computeStatus(a);
    if(!a.tasks || !a.tasks.length) {
      rows.push([activeEvt?.name||'', a.fecha||'', a.activity, a.horario||'', a.prioridad, status, a.responsable||'','','','','','','','','']);
    } else {
      a.tasks.forEach(t => {
        rows.push([
          activeEvt?.name||'', a.fecha||'', a.activity, a.horario||'', a.prioridad, status,
          a.responsable||'', t.name||'', t.tarea||'', t.lugar||'', t.inicio||'', t.fin||'',
          t.responsable||'', (t.assignedPeople||[]).join(' | '),
          (t.products||[]).map(p => p.name).join(' | ')
        ]);
      });
    }
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Actividades_DEPCOM.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('✅ CSV descargado');
}

/* ══════════════════════════ OVERDUE TASKS ══════════════════════════ */
function checkOverdueTasks() {
  const banner = document.getElementById('overdue-banner');
  if(!banner) return;
  const now = new Date();
  const items = [];
  getActiveActivities().forEach(a => {
    (a.tasks||[]).forEach(t => {
      if(t.done || !a.fecha || !t.fin) return;
      if(new Date(`${a.fecha}T${t.fin}`) < now) items.push({a, t});
    });
  });
  if(!items.length) { banner.style.display = 'none'; return; }

  const pills = items.slice(0,5).map(({a, t}) => {
    const diffH = Math.round((now - new Date(`${a.fecha}T${t.fin}`)) / 3600000);
    const lbl = diffH < 1 ? 'hace <1h' : diffH < 24 ? `hace ${diffH}h` : `hace ${Math.round(diffH/24)}d`;
    return `<span class="overdue-pill">⚙️ ${esc(t.name)} <span style="opacity:.7;">(${lbl})</span></span>`;
  }).join('');
  const extra = items.length > 5 ? `<span style="font-size:.65rem;color:var(--muted);margin-left:4px;">+${items.length-5} más</span>` : '';

  banner.style.display = 'block';
  banner.innerHTML = `<div class="overdue-banner">
    <div class="bday-banner-icon">⚠️</div>
    <div class="bday-banner-body">
      <div class="overdue-banner-title">${items.length} tarea${items.length>1?'s':''} vencida${items.length>1?'s':''} sin completar</div>
      <div class="bday-banner-list">${pills}${extra}</div>
    </div>
    <button class="bday-close" onclick="document.getElementById('overdue-banner').style.display='none'">✕</button>
  </div>`;
}

/* ══════════════════════════ URGENT TASK ALERTS ══════════════════════════ */
function _showUrgentTaskAlert(t, a) {
    const existing = document.getElementById('urgent-alert-toast');
    if(existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'urgent-alert-toast';
    toast.className = 'urgent-alert';
    toast.innerHTML = `
        <div class="ua-icon">⏰</div>
        <div class="ua-body">
            <div class="ua-title">Tarea vence en menos de 1 hora</div>
            <div class="ua-task">${esc(t.name)}</div>
            <div class="ua-meta">${esc(a.activity)} · Vence: ${t.fin || '—'}${t.responsable ? ' · ' + esc(t.responsable) : ''}</div>
        </div>
        <button class="ua-close" onclick="this.parentElement.remove()">✕</button>`;
    document.body.appendChild(toast);
    setTimeout(() => { if(toast.parentElement) toast.remove(); }, 15000);
}

function _checkUrgentTasks() {
    if(!currentUser) return;
    const myName = currentUser.linkedPerson || currentUser.name;
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 60 * 1000);
    const warned = new Set(JSON.parse(sessionStorage.getItem('elim_warned_tasks') || '[]'));
    const newWarned = [];
    activities.forEach(a => {
        if(!a.fecha) return;
        (a.tasks || []).forEach(t => {
            if(t.done || t.cancelled || !t.fin) return;
            const involved = [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean);
            if(!involved.includes(myName)) return;
            const key = a.id + '::' + t.id;
            if(warned.has(key)) return;
            const due = new Date(`${a.fecha}T${t.fin}`);
            if(due > now && due <= in60) {
                newWarned.push(key);
                _showUrgentTaskAlert(t, a);
            }
        });
    });
    if(newWarned.length) {
        const merged = [...warned, ...newWarned];
        sessionStorage.setItem('elim_warned_tasks', JSON.stringify(merged));
    }
}

setInterval(_checkUrgentTasks, 5 * 60 * 1000);

/* ══════════════════════════ QUICK NOTES ══════════════════════════ */
window.addQuickNote = function(actId, taskId) {
  if(authLevel < 2) { showToast('⚠️ Necesitas permiso de Director/Enlace para agregar notas'); return; }
  const inp = document.getElementById(`qn-${actId}-${taskId}`);
  const text = inp ? inp.value.trim() : '';
  if(!text) return;
  const a = activities.find(x => x.id === actId);
  if(!a) return;
  const t = a.tasks.find(x => x.id === taskId);
  if(!t) return;
  if(!t.taskNotes) t.taskNotes = [];
  t.taskNotes.push({ text, ts: new Date().toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) });
  inp.value = '';
  afterChange();
};

/* ══════════════════════════ CALENDAR ══════════════════════════ */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function renderCalendar() {
  if(currentTab !== 'cal') return;
  const container = document.getElementById('cal-content');
  if(!container) return;

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay  = new Date(calYear, calMonth + 1, 0);

  // Para nivel 1: solo mostrar eventos donde tenga tareas asignadas
  const _myName = (authLevel === 1 && currentUser) ? currentUser.name : null;
  const monthEvts = events.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    if(d.getMonth() !== calMonth || d.getFullYear() !== calYear) return false;
    if(!_myName) return true;
    return activities.some(a => a.eventId === e.id &&
      (a.tasks||[]).some(t => t.responsable === _myName || (t.assignedPeople||[]).includes(_myName)));
  });
  const evtByDay = {};
  monthEvts.forEach(e => {
    const d = parseInt(e.date.split('-')[2]);
    if(!evtByDay[d]) evtByDay[d] = [];
    evtByDay[d].push(e);
  });

  const tD = new Date();
  const isCurMo = tD.getMonth() === calMonth && tD.getFullYear() === calYear;

  let html = `
  <div class="cal-nav">
    <button class="cal-nav-btn" onclick="calNav(-1)">◀ Anterior</button>
    <div class="cal-month-title">${MONTHS[calMonth]} ${calYear}</div>
    <button class="cal-nav-btn" onclick="calNav(1)">Siguiente ▶</button>
  </div>
  <div class="cal-grid">
    ${DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
    ${Array(firstDay.getDay()).fill('<div class="cal-cell cal-empty"></div>').join('')}`;

  for(let d = 1; d <= lastDay.getDate(); d++) {
    const isToday = isCurMo && d === tD.getDate();
    const evts = evtByDay[d] || [];
    const chips = evts.map(e => {
      const cnt = activities.filter(a => a.eventId === e.id).length;
      const nm = e.name.length > 20 ? e.name.substring(0,20)+'…' : e.name;
      return `<div class="cal-evt-chip" onclick="goToEvent('${e.id}')" title="${esc(e.name)}">${esc(nm)} <span style="opacity:.6;">(${cnt})</span></div>`;
    }).join('');
    html += `<div class="cal-cell${isToday?' cal-today':''}${evts.length?' cal-has-evts':''}">
      <div class="cal-day-num">${d}</div>${chips}</div>`;
  }

  const totalActs  = monthEvts.reduce((s,e) => s + activities.filter(a => a.eventId===e.id).length, 0);
  const totalTasks = monthEvts.reduce((s,e) => s + activities.filter(a => a.eventId===e.id).flatMap(a=>a.tasks||[]).length, 0);

  html += `</div><div class="cal-stats">${monthEvts.length} evento(s) · ${totalActs} actividad(es) · ${totalTasks} tarea(s) en ${MONTHS[calMonth]} ${calYear}</div>`;
  container.innerHTML = html;
}

window.calNav = function(dir) {
  calMonth += dir;
  if(calMonth > 11){ calMonth = 0; calYear++; }
  if(calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
};

function goToEvent(id) {
  activeEventId = id;
  performSwitchTab('acts');
}

/* ══════════════════════════ TEAMS ══════════════════════════ */
let _editingTeamId = null;

function renderTeams() {
    if(currentTab !== 'teams') return;
    const grid = document.getElementById('teams-grid');
    if(!grid) return;
    if(authLevel < 1) { grid.innerHTML = ''; return; }

    // Filtrar equipos: nivel 1 solo ve los equipos donde es miembro o líder
    let visibleTeams = teams;
    if(authLevel === 1 && currentUser) {
        const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
        // Resolver mi persona probando linkedPerson y luego el nombre de usuario
        const myPerson = people.find(p => _norm(p.name) === _norm(currentUser.linkedPerson))
                      || people.find(p => _norm(p.name) === _norm(currentUser.name));
        const myId   = myPerson ? myPerson.id : null;
        const myNorm = _norm(myPerson ? myPerson.name : (currentUser.linkedPerson || currentUser.name));

        visibleTeams = teams.filter(tm => {
            const tmLeaderIds = tm.leaderIds || (tm.leaderId ? [tm.leaderId] : []);
            const memberIds   = tm.memberIds || [];
            // Coincidencia por id
            if(myId && (tmLeaderIds.includes(myId) || memberIds.includes(myId))) return true;
            // Coincidencia por nombre normalizado (cubre ids desincronizados)
            const leaderNames = tmLeaderIds.map(id => people.find(p => p.id === id)).filter(Boolean).map(p => _norm(p.name));
            const memberNames = memberIds.map(id => people.find(p => p.id === id)).filter(Boolean).map(p => _norm(p.name));
            return leaderNames.includes(myNorm) || memberNames.includes(myNorm);
        });
    }

    // Aviso si el usuario nivel 1 no tiene persona vinculada al directorio
    if(authLevel === 1 && currentUser && !people.find(p => {
        const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
        const n = currentUser.linkedPerson || currentUser.name;
        return _norm(p.name) === _norm(n);
    })) {
        const warn = document.createElement('div');
        warn.style.cssText = 'grid-column:1/-1;background:var(--warn,#fff3cd);color:#856404;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;font-size:.8rem;margin-bottom:8px;';
        warn.innerHTML = '⚠️ Tu cuenta no está vinculada a ninguna persona del directorio. Pide a un administrador que configure el campo <b>"Vincular a persona"</b> en tu usuario para que puedas ver tus equipos.';
        grid.innerHTML = '';
        grid.appendChild(warn);
    }

    if(!visibleTeams.length) {
        const msg = authLevel === 1 || authLevel === 2
            ? 'Aún no perteneces a ningún equipo'
            : 'Sin equipos registrados';
        const sub = authLevel === 1 || authLevel === 2
            ? 'Cuando un administrador te asigne a un equipo aparecerá aquí'
            : 'Crea tu primer equipo con el botón de arriba';
        grid.innerHTML += `<div class="empty" style="grid-column:1/-1;"><div class="empty-icon">👥</div><div class="empty-text">${msg}</div><div class="empty-sub">${sub}</div></div>`;
        return;
    }
    grid.innerHTML = visibleTeams.map(tm => {
        // Retrocompatibilidad: leaderIds o leaderId legacy
        const leaderIds = tm.leaderIds || (tm.leaderId ? [tm.leaderId] : []);
        const leaders = leaderIds.map(id => people.find(p => p.id === id)).filter(Boolean);
        const members = (tm.memberIds||[]).map(id => people.find(p => p.id === id)).filter(Boolean);
        const leaderIdSet = new Set(leaderIds);

        const leadersHTML = leaders.length
            ? leaders.map(l => {
                const ldn = _getDisplayName(l);
                const avS = l.photo ? `background-image:url(${l.photo});background-size:cover;` : `background:${avc(l.name)}`;
                return `<span class="av-chip" title="${esc(ldn)}" style="border-color:rgba(38,208,124,.35);">
                    <span class="av-mini" style="${avS}">${l.photo?'':ini(l.name)}</span>
                    <span style="color:var(--green);font-size:.55rem;margin-right:1px;">👑</span>${esc(ldn)}
                </span>`;
            }).join('')
            : '<span style="font-size:.65rem;color:var(--muted2);">Sin líder</span>';

        const membersHTML = members.slice(0,8).map(m => { const mdn=_getDisplayName(m); return `<span class="av-chip" title="${esc(mdn)}"><span class="av-mini" style="${m.photo?`background-image:url(${m.photo});background-size:cover;`:`background:${avc(m.name)}`}">${m.photo?'':ini(m.name)}</span>${esc(mdn)} ${_workloadChip(m.name)}</span>`; }).join('');
        const extra = members.length > 8 ? `<span style="font-size:.65rem;color:var(--muted);">+${members.length-8} más</span>` : '';
        const editBtn = authLevel >= 3 ? `<button class="ico-btn perm-btn" onclick="event.stopPropagation();openTeamModal('${tm.id}')" title="Editar equipo" style="opacity:.5;transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.5">✏️</button>
          <button class="ico-btn perm-btn" onclick="event.stopPropagation();duplicateTeam('${tm.id}')" title="Duplicar estructura" style="opacity:.5;transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.5">📄</button>
          <button class="ico-btn perm-btn" onclick="event.stopPropagation();deleteTeam('${tm.id}')" title="Eliminar equipo" style="opacity:.5;color:var(--red);transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.5">🗑</button>` : '';
        return `<div class="act-card">
            <div class="card-stripe" style="background:var(--cyan)"></div>
            <div class="card-hdr">
                <div class="card-title-wrap">
                    <div style="font-size:.65rem;color:var(--cyan);font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">👥 EQUIPO</div>
                    <div class="card-activity">${esc(tm.name)}</div>
                    ${tm.description ? `<div style="font-size:.65rem;color:var(--muted);margin-top:2px;">${esc(tm.description)}</div>` : ''}
                </div>
                <div style="display:flex;gap:4px;align-items:center;">${editBtn}</div>
            </div>
            <div class="task-body" style="display:block;border-top:1px solid var(--border);padding-top:10px;">
                <div style="font-size:.65rem;color:var(--green);font-weight:700;margin-bottom:5px;">🎯 DIRECTORES OPERATIVOS (${leaders.length})</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${leadersHTML}</div>
                <div style="font-size:.65rem;color:var(--muted);font-weight:700;margin-bottom:5px;">MIEMBROS (${members.length})</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">${membersHTML}${extra}</div>
            </div>
        </div>`;
    }).join('');
}

function _tmPersonRow(p, checked, accentColor) {
    const avStyle = p.photo ? `background-image:url(${p.photo});background-size:cover;` : `background:${avc(p.name)}`;
    return `<label class="tm-row"><input type="checkbox" class="tm-row-ck" value="${p.id}" ${checked?'checked':''} style="accent-color:${accentColor};" onchange="_syncTeamLists()"/><span class="av-mini" style="${avStyle};width:18px;height:18px;font-size:.5rem;flex-shrink:0;">${p.photo?'':ini(p.name)}</span><span class="tm-row-name">${esc(p.name)} <span style="font-size:.6rem;color:var(--muted);">${esc(p.district||'')}</span></span></label>`;
}

window._syncTeamLists = function() {
    const selectedLeaderIds = new Set(
        [...document.querySelectorAll('#t-leaders-list input[type=checkbox]:checked')].map(cb => cb.value)
    );
    // Ocultar líderes de la lista de miembros y desmarcarlos
    document.querySelectorAll('#t-members-list input[type=checkbox]').forEach(cb => {
        const row = cb.closest('label');
        if(selectedLeaderIds.has(cb.value)) {
            cb.checked = false;
            row.style.display = 'none';
        } else {
            row.style.display = '';
        }
    });
};

window.openTeamModal = function(id = null) {
    _editingTeamId = id;
    document.getElementById('team-modal-ttl').textContent = id ? '✏️ Editar Equipo' : '👥 Nuevo Equipo';
    document.getElementById('t-id').value = id || '';

    const tm = id ? teams.find(t => t.id === id) : null;
    // Retrocompatibilidad: leaderId antiguo → leaderIds
    const currentLeaderIds = new Set(tm ? (tm.leaderIds || (tm.leaderId ? [tm.leaderId] : [])) : []);
    const currentMemberIds = new Set(tm ? (tm.memberIds || []) : []);
    const sortedPeople = people.filter(p => !p.archived).sort((a,b) => a.name.localeCompare(b.name));
    // Solo Directores Operativos pueden ser líderes de equipo
    const dirOps = sortedPeople.filter(p =>
        (p.cargos||[]).some(c => c.role === 'Director Operativo' || c.role === 'Directora Operativa')
    );

    document.getElementById('t-leaders-list').innerHTML = dirOps.length
        ? dirOps.map(p => _tmPersonRow(p, currentLeaderIds.has(p.id), 'var(--green)')).join('')
        : `<div style="font-size:.7rem;color:var(--muted2);padding:6px;">No hay personas con cargo de Director Operativo asignado aún.</div>`;

    document.getElementById('t-members-list').innerHTML = sortedPeople
        .map(p => _tmPersonRow(p, currentMemberIds.has(p.id) && !currentLeaderIds.has(p.id), 'var(--cyan)')).join('');

    document.getElementById('t-name').value = tm?.name || '';
    document.getElementById('t-desc').value = tm?.description || '';

    // Ocultar en miembros quienes ya son líderes
    _syncTeamLists();
    document.getElementById('team-modal').classList.add('open');
};

window.closeTeamModal = function() {
    document.getElementById('team-modal').classList.remove('open');
    _editingTeamId = null;
};

window.saveTeam = function() {
    const name = document.getElementById('t-name').value.trim();
    if(!name) { showToast('⚠️ El nombre del equipo es obligatorio'); return; }
    const leaderIds = [...document.querySelectorAll('#t-leaders-list input[type=checkbox]:checked')].map(cb => cb.value);
    const desc = document.getElementById('t-desc').value.trim();
    // Excluir líderes de miembros por si acaso
    const leaderSet = new Set(leaderIds);
    const memberIds = [...document.querySelectorAll('#t-members-list input[type=checkbox]:checked')]
        .map(cb => cb.value).filter(id => !leaderSet.has(id));

    if(!leaderIds.length) { showToast('⚠️ Selecciona al menos un Director Operativo'); return; }

    let prevLeaderIds = [];
    let prevMemberIds = [];
    if(_editingTeamId) {
        const tm = teams.find(t => t.id === _editingTeamId);
        if(tm) {
            prevLeaderIds = tm.leaderIds || (tm.leaderId ? [tm.leaderId] : []);
            prevMemberIds = tm.memberIds || [];
            tm.name = name; tm.leaderIds = leaderIds; tm.leaderId = leaderIds[0] || null;
            tm.description = desc; tm.memberIds = memberIds;
            tm._savedAt = Date.now();
        }
    } else {
        teams.push({ id: 'tm_'+Date.now().toString(36), name, leaderIds, leaderId: leaderIds[0]||null, description: desc, memberIds, _savedAt: Date.now() });
    }
    autoSave();
    closeTeamModal();
    renderTeams();
    showToast('✅ Equipo guardado');

    _notifyTeamMembers(name, leaderIds, memberIds, prevLeaderIds, prevMemberIds);
};

function _notifyTeamMembers(teamName, leaderIds, memberIds, prevLeaderIds, prevMemberIds) {
    // Push a quienes fueron AGREGADOS al equipo (nuevos líderes o miembros)
    const prev = new Set([...(prevLeaderIds || []), ...(prevMemberIds || [])]);
    const nowIds = [...new Set([...(leaderIds || []), ...(memberIds || [])])];
    const addedIds = nowIds.filter(id => !prev.has(id));
    if(!addedIds.length) return;
    const myName = currentUser?.linkedPerson || currentUser?.name;
    const names = addedIds
        .map(id => people.find(p => p.id === id)?.name)
        .filter(Boolean)
        .filter(n => n !== myName);
    if(names.length && typeof _sendPushToRecipients === 'function') {
        _sendPushToRecipients(names, '👥 Nuevo equipo — DEPCOM MCE', `Has sido agregado/a al equipo "${teamName}"`);
    }
}

window.duplicateTeam = function(id) {
    const tm = teams.find(t => t.id === id);
    if(!tm) return;
    const copy = {
        id: 'tm_' + Date.now().toString(36),
        name: tm.name + ' (copia)',
        description: tm.description || '',
        leaderIds: [...(tm.leaderIds || (tm.leaderId ? [tm.leaderId] : []))],
        leaderId: tm.leaderId || null,
        memberIds: [...(tm.memberIds || [])],
        _savedAt: Date.now()
    };
    teams.push(copy);
    autoSave();
    renderTeams();
    showToast('📄 Equipo duplicado — edítalo para ajustar el nombre');
};

window.deleteTeam = function(id) {
    customConfirm('¿Eliminar este equipo?', () => {
        teams = teams.filter(t => t.id !== id);
        autoSave();
        renderTeams();
        showToast('🗑 Equipo eliminado');
    });
};

/* ══════════════════════════ LIVE PANEL ══════════════════════════ */
function renderLivePanel() {
  if(currentTab !== 'live') return;
  const container = document.getElementById('live-content');
  if(!container) return;

  const activeEvt = events.find(e => e.id === activeEventId);
  if(!activeEvt) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">⚡</div><div class="empty-text">Ningún evento seleccionado</div><div class="empty-sub">Selecciona un evento en la pestaña Actividades</div></div>`;
    return;
  }

  const now = new Date();
  const isToday = activeEvt.date === todayStr;
  const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 horas

  // Clasificar tareas
  const overdue = [], active = [], upcoming = [], done = [];

  getActiveActivities().forEach(a => {
    (a.tasks || []).forEach(t => {
      if(t.cancelled) return; // canceladas: no aparecen en En Vivo
      const startDT = a.fecha && t.inicio ? new Date(`${a.fecha}T${t.inicio}`) : null;
      const endDT   = a.fecha && t.fin   ? new Date(`${a.fecha}T${t.fin}`)   : null;
      const item = { a, t, startDT, endDT };

      if(t.done) { done.push(item); return; }
      if(endDT && endDT < now)                            { overdue.push(item);  return; }
      if(startDT && endDT && startDT <= now && now <= endDT) { active.push(item); return; }
      if(startDT && startDT > now && (startDT - now) <= WINDOW_MS) { upcoming.push(item); return; }
      if(!isToday && startDT && (startDT - now) <= WINDOW_MS) upcoming.push(item);
      // tareas más de 2h en el futuro: no mostrar
    });
  });

  overdue.sort((x,y)  => (x.endDT||0)   - (y.endDT||0));
  active.sort((x,y)   => (x.startDT||0) - (y.startDT||0));
  upcoming.sort((x,y) => (x.startDT||0) - (y.startDT||0));

  const isLocked = !_editUnlocked || authLevel < 2;

  function taskCard(item, cls) {
    const {a, t, startDT, endDT} = item;
    const allPeople = [t.responsable, ...(t.assignedPeople||[])].filter(Boolean);
    const uniquePeople = [...new Set(allPeople)];

    let timeBadge = '', timeCls = 'lt-neutral';
    if(endDT && endDT < now && !t.done) {
      const diffH = Math.round((now - endDT) / 3600000);
      timeBadge = `⚠️ Vencida hace ${diffH < 1 ? '<1h' : diffH + 'h'}`;
      timeCls = 'lt-overdue';
    } else if(startDT && endDT && startDT <= now && now <= endDT) {
      const remMin = Math.round((endDT - now) / 60000);
      timeBadge = `🟡 En curso · ${remMin < 60 ? remMin+'min restantes' : Math.round(remMin/60)+'h restantes'}`;
      timeCls = 'lt-active';
    } else if(startDT && startDT > now) {
      const inMin = Math.round((startDT - now) / 60000);
      timeBadge = `🟢 En ${inMin < 60 ? inMin+'min' : Math.round(inMin/60)+'h'}`;
      timeCls = 'lt-next';
    } else if(t.inicio) {
      timeBadge = `${t.inicio}${t.fin?' → '+t.fin:''}`;
      timeCls = 'lt-neutral';
    }

    const peopleHTML = uniquePeople.map(n => {
      const pObj = people.find(x => x.name === n);
      const isLead = t.responsable === n;
      const avL = personAv(n);
      return `<span class="av-chip"><span class="av-mini" style="${avL.style}">${pObj?.photo?'':ini(_dn(n))}</span>${esc(_dn(n))}${isLead?' 👑':''}</span>`;
    }).join('');

    const doneBtn = isLocked
      ? `<button class="live-done-btn ${t.done?'isdone':'undone'}" onclick="showToast('⚠️ Solo Director/Enlace o Admin pueden marcar tareas')">${t.done?'✅ Hecha':'Marcar lista'}</button>`
      : `<button class="live-done-btn ${t.done?'isdone':'undone'}" onclick="toggleTaskDone('${a.id}','${t.id}')">${t.done?'✅ Hecha':'Marcar lista'}</button>`;

    return `<div class="live-card ${cls}">
      <div class="live-card-body">
        <div class="live-act-label">📋 ${esc(a.activity)}</div>
        <div class="live-task-name">${esc(t.name)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px;">
          ${timeBadge ? `<span class="live-time-badge ${timeCls}">${timeBadge}</span>` : ''}
          ${t.lugar ? `<span class="live-time-badge lt-neutral">📍 ${esc(t.lugar)}</span>` : ''}
        </div>
        ${(startDT && endDT && startDT <= now && now <= endDT) ? (() => {
          const pct = Math.min(100, Math.round((now - startDT) / (endDT - startDT) * 100));
          const urgColor = pct > 80 ? '#fb637e' : pct > 60 ? '#ffc600' : '#26d07c';
          return `<div style="height:3px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${urgColor};transition:width 1s;"></div></div>`;
        })() : ''}
        ${(endDT && endDT < now && !t.done) ? (() => {
          const minsLate = Math.round((now - endDT) / 60000);
          return `<div style="margin-top:4px;font-size:.62rem;color:#fb637e;font-weight:700;animation:pulse 1.5s infinite;">⚠️ ${minsLate < 60 ? minsLate + ' min de retraso' : Math.floor(minsLate/60) + 'h ' + (minsLate%60) + 'min de retraso'}</div>`;
        })() : ''}
        <div class="live-people">${peopleHTML||'<span style="font-size:.68rem;color:var(--muted2)">Sin asignar</span>'}</div>
      </div>
      ${doneBtn}
    </div>`;
  }

  function section(title, cls, hdrCls, items, collapsed=false) {
    if(!items.length) return '';
    const id = 'lsec-' + Math.random().toString(36).slice(2,6);
    return `<div class="live-section">
      <div class="live-section-hdr ${hdrCls}" onclick="toggleLiveSection('${id}',this)" style="cursor:pointer;justify-content:space-between;">
        <span>${title} <span style="opacity:.7;font-size:.7rem;">(${items.length})</span></span>
        <span id="${id}-chev" class="chevron ${collapsed?'':'open'}">▼</span>
      </div>
      <div id="${id}" style="display:${collapsed?'none':'block'};">
        ${items.map(i => taskCard(i, cls)).join('')}
      </div>
    </div>`;
  }

  const total = overdue.length + active.length + upcoming.length + done.length;
  if(!total) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin tareas en este evento</div></div>`;
    return;
  }

  const pct = total ? Math.round(done.length/total*100) : 0;
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
      <div style="font-family:'Nunito',sans-serif;font-size:.95rem;font-weight:800;">⚡ En Vivo — <span style="color:var(--cyan);">${esc(activeEvt.name)}</span></div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="prog-bar" style="width:100px;height:7px;"><div class="prog-fill" style="width:${pct}%"></div></div>
        <span style="font-size:.72rem;color:var(--muted);font-weight:700;">${done.length}/${total} completadas</span>
        ${overdue.length+active.length+upcoming.length===0 && done.length>0 ? `<button class="btn btn-add" style="font-size:.7rem;padding:5px 12px;" onclick="showEventSummaryModal()">📊 Ver Resumen</button>` : ''}
      </div>
    </div>
    <div class="live-refresh">🔄 Se actualiza automáticamente cada minuto</div>
    ${section('🔴 Tareas Vencidas','lc-overdue','live-hdr-overdue',overdue)}
    ${section('🟡 En Curso Ahora','lc-active','live-hdr-active',active)}
    ${section('🟢 Próximas (2h)','lc-next','live-hdr-next',upcoming)}
    ${section('✅ Completadas','lc-done','live-hdr-done',done,true)}
  `;
}

window.toggleLiveSection = function(id, hdr) {
  const el = document.getElementById(id);
  const chev = document.getElementById(id+'-chev');
  if(!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if(chev) chev.classList.toggle('open', !open);
};

/* ══════════════════════════ BY PERSON VIEW ══════════════════════════ */
let _bypSort = 'cargo'; // 'cargo' | 'carga'
window.setBypSort = function(s) { _bypSort = s; renderByPerson(); };

function renderByPerson() {
  if(currentTab !== 'acts' || _actsView !== 'byp') return;
  const container = document.getElementById('byp-content');
  if(!container) return;

  const activeEvt = events.find(e => e.id === activeEventId);
  if(!activeEvt) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">👤</div><div class="empty-text">Ningún evento seleccionado</div></div>`;
    return;
  }

  const now = new Date();
  const personMap = {};

  getActiveActivities().forEach(a => {
    (a.tasks||[]).forEach(t => {
      const involved = [...new Set([t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean))];
      involved.forEach(name => {
        if(!personMap[name]) personMap[name] = [];
        personMap[name].push({ a, t, isLead: t.responsable === name || (t.coliders||[]).includes(name) });
      });
    });
  });

  // Personas sin ninguna asignación en este evento
  const unassigned = people.filter(p => !p.archived && !personMap[p.name]);

  let names = Object.keys(personMap);
  if(_bypSort === 'carga') {
    names.sort((a, b) => _personWorkload(b).weighted - _personWorkload(a).weighted);
  } else {
    names.sort((a, b) => {
      const pa = people.find(x => x.name === a);
      const pb = people.find(x => x.name === b);
      return (CARGO_ORDER[pa?.type]||99) - (CARGO_ORDER[pb?.type]||99) || a.localeCompare(b);
    });
  }

  if(!names.length && !unassigned.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">👤</div><div class="empty-text">Sin personas asignadas en este evento</div></div>`;
    return;
  }

  const sortBtns = `<div style="display:flex;gap:5px;align-items:center;">
    <span style="font-size:.6rem;color:var(--muted);font-weight:600;">Ordenar:</span>
    <button class="btn ${_bypSort==='cargo'?'btn-add':'btn-ghost'}" style="font-size:.6rem;padding:3px 9px;" onclick="setBypSort('cargo')">Por cargo</button>
    <button class="btn ${_bypSort==='carga'?'btn-add':'btn-ghost'}" style="font-size:.6rem;padding:3px 9px;" onclick="setBypSort('carga')">📊 Por carga</button>
  </div>`;

  // Calcular máximo de carga para escalar las barras
  const _wlMap = {};
  names.forEach(n => { _wlMap[n] = _personWorkload(n).weighted; });
  const _maxWl = Math.max(1, ...Object.values(_wlMap));

  container.innerHTML = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      <div style="font-family:'Nunito',sans-serif;font-size:.95rem;font-weight:800;">
        👥 Por Persona — <span style="color:var(--cyan);">${esc(activeEvt.name)}</span>
        <span style="font-size:.7rem;color:var(--muted);font-weight:500;margin-left:8px;">${names.length} asignada(s)${unassigned.length?` · ${unassigned.length} sin asignar`:''}</span>
      </div>
      ${sortBtns}
    </div>
    <div class="byp-grid">
      ${names.map(name => {
        const items = personMap[name];
        const pObj = people.find(x => x.name === name);
        const activeItems = items.filter(i => !i.t.cancelled);
        const doneCount = activeItems.filter(i => i.t.done).length;
        const avStyle = pObj?.photo ? `background-image:url(${pObj.photo});background-size:cover;` : `background:${avc(name)}`;
        const avContent = pObj?.photo ? '' : ini(name);
        const wl  = _personWorkload(name);
        const col = _workloadColor(wl.weighted);
        const barPct = Math.round((_wlMap[name] / _maxWl) * 100);

        const tasksHTML = items.map(({a, t, isLead}) => {
          const endDT = a.fecha && t.fin ? new Date(`${a.fecha}T${t.fin}`) : null;
          const isOverdue = endDT && endDT < now && !t.done && !t.cancelled;
          return `<div class="byp-task-row${t.cancelled?' cancelled':t.done?' done':isOverdue?' overdue':''}">
            <span class="byp-role ${isLead?'byp-role-lead':'byp-role-support'}">${isLead?'👑':'👥'}</span>
            <div style="flex:1;min-width:0;">
              <div class="byp-task-name${t.cancelled?' done-txt':t.done?' done-txt':''}">${esc(t.name)}${t.cancelled?' <span style="font-size:.55rem;color:var(--muted);">🚫</span>':''}</div>
              <div style="font-size:.6rem;color:var(--muted);margin-top:1px;">${esc(a.activity)}${t.inicio?' · '+t.inicio:''}</div>
            </div>
            ${isOverdue ? `<span style="font-size:.58rem;color:var(--red);font-weight:800;">VENCIDA</span>` : ''}
            ${t.done ? `<span style="font-size:.72rem;">✅</span>` : ''}
          </div>`;
        }).join('');

        return `<div class="byp-card">
          <div class="byp-card-hdr">
            <div class="av-dot" style="${avStyle};width:36px;height:36px;font-size:.8rem;flex-shrink:0;">${avContent}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-family:'Nunito',sans-serif;font-size:.88rem;font-weight:700;line-height:1.2;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${esc(_dn(name))} ${_workloadChip(name)}</div>
              <div style="font-size:.62rem;color:var(--muted);margin-top:3px;">${doneCount}/${activeItems.length} tarea${activeItems.length!==1?'s':''}${items.length!==activeItems.length?` +${items.length-activeItems.length} canc.`:''} · ${pObj?esc(pObj.type):'Sin perfil'}</div>
              <div style="display:flex;align-items:center;gap:5px;margin-top:5px;">
                <div style="flex:1;height:5px;background:var(--s3);border-radius:4px;overflow:hidden;max-width:120px;">
                  <div style="height:100%;width:${barPct}%;background:${col.c};border-radius:4px;transition:width .4s;"></div>
                </div>
                <span style="font-size:.55rem;color:var(--muted2);font-weight:600;">${wl.asLeader}L·${wl.asSupport}A</span>
              </div>
            </div>
            <button class="ico-btn" title="Ver KPIs históricos" onclick="openPersonKPIs('${name.replace(/'/g,"\\'")}')">📊</button>
          </div>
          <div class="byp-tasks">${tasksHTML}</div>
        </div>`;
      }).join('')}
      ${unassigned.length ? `
        <div style="margin-top:8px;padding-top:10px;border-top:1px solid var(--border);grid-column:1/-1;">
          <div style="font-size:.62rem;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">⚪ Sin asignaciones en este evento (${unassigned.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${unassigned.map(p => {
              const avStyle = p.photo ? `background-image:url(${p.photo});background-size:cover;` : `background:${avc(p.name)}`;
              const avContent = p.photo ? '' : ini(p.name);
              return `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rsm);padding:4px 9px;font-size:.66rem;opacity:.7;">
                <span class="av-mini" style="${avStyle};width:18px;height:18px;font-size:.5rem;">${avContent}</span>
                ${esc(_dn(p.name))} <span style="color:var(--muted2);font-size:.58rem;">${esc(p.type)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
    </div>`;
}

/* ══════════════════════════ KPI DASHBOARD POR PERSONA ══════════════════════════ */
window.openPersonKPIs = function(name) {
  const modal = document.getElementById('kpi-modal');
  const body  = document.getElementById('kpi-body');
  const title = document.getElementById('kpi-title');
  if(!modal || !body) return;

  const pObj = people.find(p => p.name === name);
  const avStyle = pObj?.photo ? `background-image:url(${pObj.photo});background-size:cover;` : `background:${avc(name)}`;
  const avContent = pObj?.photo ? '' : ini(name);
  if(title) title.innerHTML = `<span class="av-dot" style="${avStyle};width:24px;height:24px;font-size:.58rem;vertical-align:middle;display:inline-flex;align-items:center;justify-content:center;">${avContent}</span> ${esc(pObj ? _getDisplayName(pObj) : name)}`;

  // ── Acumular stats de TODOS los eventos ──
  let totalTareas = 0, completadas = 0, canceladas = 0, vencidas = 0;
  let asLider = 0, asApoyo = 0;
  const eventosSet = new Set();
  const habilidadCount = {};
  const tipoTareaCount = {};
  const now = new Date();
  const eventosRecientes = []; // {evtName, date, doneCount, totalCount}

  // Agrupar por evento para historial reciente
  const evtMap = {};

  activities.forEach(a => {
    const evt = events.find(e => e.id === a.eventId);
    (a.tasks||[]).forEach(t => {
      const involved = t.responsable === name
        || (t.assignedPeople||[]).includes(name)
        || (t.coliders||[]).includes(name);
      if(!involved) return;

      totalTareas++;
      if(t.cancelled) { canceladas++; return; }
      if(t.done) completadas++;
      else {
        const endDT = a.fecha && t.fin ? new Date(`${a.fecha}T${t.fin}`) : null;
        if(endDT && endDT < now) vencidas++;
      }
      if(t.responsable === name) asLider++;
      else asApoyo++;
      if(t.habilidad) habilidadCount[t.habilidad] = (habilidadCount[t.habilidad]||0) + 1;
      if(t.tarea)     tipoTareaCount[t.tarea]     = (tipoTareaCount[t.tarea]||0)     + 1;
      if(evt) {
        eventosSet.add(evt.id);
        if(!evtMap[evt.id]) evtMap[evt.id] = { name: evt.name, date: evt.date, done: 0, total: 0 };
        evtMap[evt.id].total++;
        if(t.done) evtMap[evt.id].done++;
      }
    });
  });

  const activas = totalTareas - canceladas;
  const cumplimiento = activas ? Math.round(completadas / activas * 100) : 0;

  // Top 3 habilidades
  const topHab = Object.entries(habilidadCount).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const topTipo = Object.entries(tipoTareaCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

  // Historial reciente (últimos 5 eventos con participación, ordenados por fecha desc)
  const evtList = Object.values(evtMap)
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  // ── Construir HTML ──
  function bar(pct, color='var(--cyan)') {
    return `<div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .4s;"></div>
    </div>`;
  }

  const cumplColor = cumplimiento >= 80 ? 'var(--green)' : cumplimiento >= 50 ? 'var(--amber)' : 'var(--red)';

  const _wl = _personWorkload(name);
  const _wlCol = _workloadColor(_wl.weighted);
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;background:${_wlCol.c}14;border:1px solid ${_wlCol.c}44;
        border-radius:var(--rsm);padding:9px 13px;margin-bottom:12px;">
      <span style="font-size:1.1rem;">${_wlCol.dot}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.7rem;font-weight:800;color:${_wlCol.c};">Carga actual ${_wlCol.label} · ${_wl.total} tarea(s) activa(s)</div>
        <div style="font-size:.6rem;color:var(--muted);margin-top:1px;">${_wl.asLeader} como líder · ${_wl.asSupport} de apoyo · ${_wl.week} esta semana</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div class="kpi-stat-box">
        <div class="kpi-stat-val" style="color:var(--cyan);">${eventosSet.size}</div>
        <div class="kpi-stat-lbl">Eventos</div>
      </div>
      <div class="kpi-stat-box">
        <div class="kpi-stat-val" style="color:${cumplColor};">${cumplimiento}%</div>
        <div class="kpi-stat-lbl">Cumplimiento</div>
      </div>
      <div class="kpi-stat-box">
        <div class="kpi-stat-val" style="color:var(--green);">${completadas}</div>
        <div class="kpi-stat-lbl">Completadas</div>
      </div>
      <div class="kpi-stat-box">
        <div class="kpi-stat-val" style="color:var(--red);">${vencidas}</div>
        <div class="kpi-stat-lbl">Vencidas</div>
      </div>
    </div>

    ${(typeof _getAttendanceKPIs === 'function') ? (() => {
      const ak = _getAttendanceKPIs(name);
      if(!ak.total) return '';
      const asistPct = Math.round(ak.present / ak.total * 100);
      const aColor = asistPct >= 80 ? 'var(--green)' : asistPct >= 50 ? 'var(--amber)' : 'var(--red)';
      return `<div style="margin-bottom:14px;">
        <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">
          🗓 Asistencia a servicios (${ak.total} asignados)
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">
          <div class="kpi-stat-box"><div class="kpi-stat-val" style="color:var(--green);">${ak.present}</div><div class="kpi-stat-lbl">✅ Asistió</div></div>
          <div class="kpi-stat-box"><div class="kpi-stat-val" style="color:var(--amber);">${ak.permission}</div><div class="kpi-stat-lbl">📋 Permisos</div></div>
          <div class="kpi-stat-box"><div class="kpi-stat-val" style="color:var(--red);">${ak.absent + ak.autoAbsent}</div><div class="kpi-stat-lbl">❌ Ausencias</div></div>
          <div class="kpi-stat-box"><div class="kpi-stat-val" style="color:${aColor};">${asistPct}%</div><div class="kpi-stat-lbl">Asistencia</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${bar(asistPct, aColor)}
          <span style="font-size:.7rem;font-weight:700;color:${aColor};flex-shrink:0;">${ak.present}/${ak.total}</span>
        </div>
      </div>`;
    })() : ''}

    <div style="margin-bottom:14px;">
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">Cumplimiento general</div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${bar(cumplimiento, cumplColor)}
        <span style="font-size:.75rem;font-weight:700;color:${cumplColor};flex-shrink:0;">${cumplimiento}%</span>
      </div>
    </div>

    <div style="margin-bottom:14px;">
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">Rol en tareas</div>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;padding:8px;background:rgba(255,198,0,.08);border:1px solid rgba(255,198,0,.2);border-radius:8px;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:var(--amber);">${asLider}</div>
          <div style="font-size:.6rem;color:var(--muted);">👑 Líder</div>
        </div>
        <div style="flex:1;padding:8px;background:rgba(32,172,244,.08);border:1px solid rgba(32,172,244,.2);border-radius:8px;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:var(--cyan);">${asApoyo}</div>
          <div style="font-size:.6rem;color:var(--muted);">👥 Apoyo</div>
        </div>
        <div style="flex:1;padding:8px;background:rgba(180,180,180,.06);border:1px solid var(--border);border-radius:8px;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:var(--muted);">${canceladas}</div>
          <div style="font-size:.6rem;color:var(--muted);">🚫 Canc.</div>
        </div>
      </div>
    </div>

    ${topHab.length ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">Top habilidades asignadas</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${topHab.map(([h, n]) => `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:.7rem;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(h)}</span>
            ${bar(Math.round(n / (topHab[0][1]) * 100), 'var(--a2)')}
            <span style="font-size:.65rem;color:var(--muted);flex-shrink:0;">${n}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${topTipo.length ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">Tipo de tarea más frecuente</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${topTipo.map(([h, n]) => `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:.7rem;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(h)}</span>
            ${bar(Math.round(n / (topTipo[0][1]) * 100), 'var(--cyan)')}
            <span style="font-size:.65rem;color:var(--muted);flex-shrink:0;">${n}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${(() => {
      // Gráfica de evolución — todos los eventos cronológicamente
      const chartData = Object.values(evtMap)
        .filter(e => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-12);
      if(chartData.length < 2) return '';
      const W = 280, H = 90, PL = 22, PB = 22;
      const slots = chartData.length;
      const bw = Math.max(4, Math.floor((W - PL) / slots) - 3);
      const barsHTML = chartData.map((e, i) => {
        const pct = e.total ? e.done / e.total : 0;
        const hh = Math.round(pct * (H - PB - 10));
        const c = pct >= 0.8 ? '#5ad25a' : pct >= 0.5 ? '#fbc635' : '#fb637e';
        const x = PL + i * ((W - PL) / slots) + ((W - PL) / slots - bw) / 2;
        const y = H - PB - hh;
        const lbl = (e.name||'').replace(/^(Servicio|Evento)\s*/i,'').slice(0, 7);
        const pctLbl = Math.round(pct * 100);
        return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw}" height="${hh}" fill="${c}" rx="2"/>
          ${pctLbl > 0 ? `<text x="${(x+bw/2).toFixed(1)}" y="${(y-3)}" text-anchor="middle" font-size="6.5" fill="${c}" font-weight="bold">${pctLbl}%</text>` : ''}
          <text x="${(x+bw/2).toFixed(1)}" y="${H-5}" text-anchor="middle" font-size="5.5" fill="#666">${lbl}</text>`;
      }).join('');
      // Línea de meta 80%
      const goalY = H - PB - Math.round(0.8 * (H - PB - 10));
      return `<div style="margin-bottom:14px;">
        <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">📈 Evolución de cumplimiento</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible;">
          <line x1="${PL}" y1="${H-PB}" x2="${W}" y2="${H-PB}" stroke="#333" stroke-width=".8"/>
          <line x1="${PL}" y1="${goalY}" x2="${W}" y2="${goalY}" stroke="#5ad25a" stroke-width=".8" stroke-dasharray="3,3" opacity=".5"/>
          <text x="${PL-2}" y="${goalY+2}" text-anchor="end" font-size="6" fill="#5ad25a" opacity=".7">80%</text>
          ${barsHTML}
        </svg>
      </div>`;
    })()}

    ${evtList.length ? `
    <div>
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">Últimos eventos participados</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${evtList.map(e => {
          const pct = e.total ? Math.round(e.done/e.total*100) : 0;
          const c = pct===100?'var(--green)':pct>0?'var(--amber)':'var(--muted)';
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--card);border:1px solid var(--border);border-radius:6px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:.72rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.name)}</div>
              <div style="font-size:.6rem;color:var(--muted);">${e.date ? formatDateStr(e.date) : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
              ${bar(pct, c)}
              <span style="font-size:.65rem;color:${c};font-weight:700;min-width:28px;text-align:right;">${e.done}/${e.total}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${!totalTareas ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Sin historial de tareas aún</div>' : ''}
  `;

  modal.classList.add('open');
};

/* ══════════════════════════ TEMPLATES ══════════════════════════ */
let templates = [];

/* Filtros por tipo: las plantillas de actividad NO tienen kind o kind!=='task' */
function _activityTemplates() { return templates.filter(t => t.kind !== 'task'); }
function _taskTemplates()     { return templates.filter(t => t.kind === 'task'); }

function openTemplatePicker() {
  const list = document.getElementById('tpl-list');
  const acts = _activityTemplates();
  if(!acts.length) {
    list.innerHTML = `<div style="text-align:center;padding:20px;font-size:.78rem;color:var(--muted2);">No hay plantillas guardadas aún.<br>Crea una actividad y usa <b>"Guardar plantilla"</b>.</div>`;
  } else {
    list.innerHTML = acts.map(tpl => `
      <div class="tpl-item" onclick="loadTemplate('${tpl.id}')">
        <div>
          <div class="tpl-item-name">${esc(tpl.activity)}</div>
          <div class="tpl-item-meta">${tpl.tasks.length} tarea${tpl.tasks.length!==1?'s':''} · ${tpl.prioridad}</div>
        </div>
        <button class="tpl-del" onclick="event.stopPropagation();deleteTemplate('${tpl.id}')">🗑 Eliminar</button>
      </div>`).join('');
  }
  document.getElementById('tpl-modal').classList.add('open');
}

window.loadTemplate = function(id) {
  const tpl = templates.find(t => t.id === id);
  if(!tpl) return;
  document.getElementById('tpl-modal').classList.remove('open');

  document.getElementById('f-activity').value = tpl.activity;
  document.getElementById('f-prioridad').value = tpl.prioridad || 'Normal';
  document.getElementById('f-color').value = tpl.color || 'morado';
  document.getElementById('f-notas').value = tpl.notas || '';

  modalSchedules = [];
  modalExtempTime = '';
  modalTaskBlocks = [];
  taskIdCounter = 0;
  (tpl.tasks||[]).forEach(t => addTaskBlock({
    name: t.name, tarea: t.tarea, habilidad: t.habilidad,
    lugar: t.lugar, indicaciones: t.indicaciones, detalles: t.detalles,
    products: (t.products||[]).map(p => ({...p, socials:[...(p.socials||[])], publishedSocials:[], uploaded:false}))
  }));

  buildSchOpts();
  renderTasksBuilder();
  showToast(`✅ Plantilla "${tpl.activity}" cargada`);
};

window.deleteTemplate = function(id) {
  templates = templates.filter(t => t.id !== id);
  autoSave();
  openTemplatePicker();
  showToast('🗑 Plantilla eliminada');
};

window.saveAsTemplate = function() {
  const activity = document.getElementById('f-activity').value.trim();
  if(!activity) { showToast('⚠️ Ingresa el nombre de la actividad antes de guardar la plantilla'); return; }
  if(!modalTaskBlocks.length) { showToast('⚠️ Agrega al menos una tarea antes de guardar la plantilla'); return; }

  const existing = templates.find(t => t.activity === activity);
  if(existing) {
    customConfirm(`Ya existe una plantilla llamada "${activity}". ¿Deseas reemplazarla?`, () => {
      templates = templates.filter(t => t.activity !== activity);
      _doSaveTemplate(activity);
    });
    return;
  }
  _doSaveTemplate(activity);
};

function _doSaveTemplate(activity) {
  templates.push({
    id: 'tpl_' + Date.now().toString(36),
    kind: 'activity',
    activity,
    prioridad: document.getElementById('f-prioridad').value,
    color: document.getElementById('f-color').value,
    notas: document.getElementById('f-notas').value.trim(),
    tasks: modalTaskBlocks.map(b => ({
      name: b.name, tarea: b.tarea, habilidad: b.habilidad,
      lugar: b.lugar, indicaciones: b.indicaciones, detalles: b.detalles,
      products: b.products.map(p => ({name:p.name, type:p.type, socials:[...(p.socials||[])], notes:p.notes}))
    }))
  });
  autoSave();
  showToast(`💾 Plantilla "${activity}" guardada`);
}

/* ─────────────── PLANTILLAS DE TAREA INDIVIDUAL ─────────────── */
window.saveTaskAsTemplate = function(tid) {
  const b = modalTaskBlocks.find(x => x.id === tid);
  if(!b) return;
  if(!(b.name||'').trim()) { showToast('⚠️ Ponle nombre a la tarea antes de guardar la plantilla'); return; }
  const save = (name) => {
    templates = templates.filter(t => !(t.kind === 'task' && t.name === name));
    templates.push({
      id: 'tsk_' + Date.now().toString(36),
      kind: 'task',
      name,
      tarea: b.tarea || '', habilidad: b.habilidad || '',
      lugar: b.lugar || '', inicio: b.inicio || '', fin: b.fin || '',
      indicaciones: b.indicaciones || '', detalles: b.detalles || '',
      products: (b.products||[]).map(p => ({name:p.name, type:p.type, socials:[...(p.socials||[])], notes:p.notes}))
    });
    autoSave();
    showToast(`💾 Plantilla de tarea "${name}" guardada`);
  };
  const name = b.name.trim();
  if(_taskTemplates().some(t => t.name === name)) {
    customConfirm(`Ya existe una plantilla de tarea "${name}". ¿Reemplazarla?`, () => save(name));
  } else save(name);
};

window.loadTaskTemplate = function(id, horario) {
  const tpl = templates.find(t => t.id === id);
  if(!tpl) return;
  document.getElementById('tpl-task-modal')?.classList.remove('open');
  addTaskBlock({
    horario: horario || (modalSchedules[0] || ''),
    name: tpl.name, tarea: tpl.tarea, habilidad: tpl.habilidad,
    lugar: tpl.lugar, inicio: tpl.inicio, fin: tpl.fin,
    indicaciones: tpl.indicaciones, detalles: tpl.detalles,
    products: (tpl.products||[]).map(p => ({...p, socials:[...(p.socials||[])], publishedSocials:[], uploaded:false}))
  });
  showToast(`✅ Tarea "${tpl.name}" insertada`);
};

// Selector de plantilla de tarea para insertar en un servicio (desde el builder)
window.openTaskTemplatePicker = function(horario) {
  const list = document.getElementById('tpl-task-list');
  const tasks = _taskTemplates();
  const hArg = (horario||'').replace(/'/g,"\\'");
  if(!tasks.length) {
    list.innerHTML = `<div style="text-align:center;padding:20px;font-size:.78rem;color:var(--muted2);">No hay plantillas de tarea aún.<br>En cualquier tarea usa <b>"💾 Plantilla"</b> para crear una.</div>`;
  } else {
    list.innerHTML = tasks.map(tpl => `
      <div class="tpl-item" onclick="loadTaskTemplate('${tpl.id}','${hArg}')">
        <div>
          <div class="tpl-item-name">${esc(tpl.name)}</div>
          <div class="tpl-item-meta">${esc(tpl.tarea||'Tarea')}${tpl.habilidad?' · '+esc(tpl.habilidad):''}${(tpl.products||[]).length?' · '+tpl.products.length+' entregable(s)':''}</div>
        </div>
        <button class="tpl-del" onclick="event.stopPropagation();deleteTemplate('${tpl.id}');openTaskTemplatePicker('${hArg}')">🗑</button>
      </div>`).join('');
  }
  document.getElementById('tpl-task-modal').classList.add('open');
};

/* ─────────────── DIRECTORIO DE PLANTILLAS ─────────────── */
let _tplDirTab = 'activity';
window._switchTplDirTab = function(tab) { _tplDirTab = tab; _renderTplDir(); };

window.openTemplateDirectory = function() {
  if(authLevel < 2) return;
  _tplDirTab = 'activity';
  _renderTplDir();
  document.getElementById('tpl-dir-modal').classList.add('open');
};

function _renderTplDir() {
  const body = document.getElementById('tpl-dir-body');
  if(!body) return;
  document.getElementById('tpl-dir-tab-activity')?.classList.toggle('active', _tplDirTab === 'activity');
  document.getElementById('tpl-dir-tab-task')?.classList.toggle('active', _tplDirTab === 'task');

  if(_tplDirTab === 'activity') {
    const acts = _activityTemplates();
    body.innerHTML = !acts.length
      ? `<div style="text-align:center;padding:24px;font-size:.78rem;color:var(--muted2);">Sin plantillas de actividad.<br>Crea una actividad y usa <b>"💾 Guardar plantilla"</b>.</div>`
      : acts.map(tpl => `
        <div class="tpl-item" style="cursor:default;">
          <div style="flex:1;min-width:0;">
            <div class="tpl-item-name">${esc(tpl.activity)}</div>
            <div class="tpl-item-meta">${(tpl.tasks||[]).length} tarea(s) · ${esc(tpl.prioridad||'Normal')}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
            <button class="tpl-dir-use" onclick="_useActivityTemplate('${tpl.id}')">➕ Usar</button>
            <button class="tpl-del" onclick="deleteTemplate('${tpl.id}');_renderTplDir()">🗑</button>
          </div>
        </div>`).join('');
  } else {
    const tasks = _taskTemplates();
    body.innerHTML = !tasks.length
      ? `<div style="text-align:center;padding:24px;font-size:.78rem;color:var(--muted2);">Sin plantillas de tarea.<br>Dentro de una actividad, en cualquier tarea usa <b>"💾 Plantilla"</b>.</div>`
      : tasks.map(tpl => `
        <div class="tpl-item" style="cursor:default;">
          <div style="flex:1;min-width:0;">
            <div class="tpl-item-name">${esc(tpl.name)}</div>
            <div class="tpl-item-meta">${esc(tpl.tarea||'Tarea')}${tpl.habilidad?' · '+esc(tpl.habilidad):''}${(tpl.products||[]).length?' · '+tpl.products.length+' entregable(s)':''}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
            <button class="tpl-dir-use" onclick="_useTaskTemplate('${tpl.id}')">➕ Usar</button>
            <button class="tpl-del" onclick="deleteTemplate('${tpl.id}');_renderTplDir()">🗑</button>
          </div>
        </div>`).join('');
  }
}

// Desde el directorio: abrir nueva actividad y cargar la plantilla
window._useActivityTemplate = function(id) {
  document.getElementById('tpl-dir-modal').classList.remove('open');
  openModal();
  setTimeout(() => loadTemplate(id), 60);
};
window._useTaskTemplate = function(id) {
  document.getElementById('tpl-dir-modal').classList.remove('open');
  openModal();
  setTimeout(() => loadTaskTemplate(id, ''), 60);
};

/* ══════════════════════════ RESUMEN POST-EVENTO ══════════════════════════ */
let summaryShownFor = sessionStorage.getItem('_summaryShownFor') || null;

function checkPostEventSummary() {
  if(!activeEventId) return;
  const acts = getActiveActivities();
  if(!acts.length) return;
  const allDone = acts.every(a => computeStatus(a) === 'Finalizada');
  if(allDone && summaryShownFor !== activeEventId) {
    summaryShownFor = activeEventId;
    sessionStorage.setItem('_summaryShownFor', activeEventId);
    setTimeout(() => showEventSummaryModal(), 600);
  }
}

function showEventSummaryModal() {
  const activeEvt = events.find(e => e.id === activeEventId);
  const acts = getActiveActivities();
  if(!acts.length || !activeEvt) return;

  const allTasks = acts.flatMap(a => a.tasks||[]);
  const doneTasks = allTasks.filter(t => t.done);
  const pct = allTasks.length ? Math.round(doneTasks.length/allTasks.length*100) : 0;

  // Social media coverage
  const socCount = {};
  SOCIAL_NETS.forEach(s => socCount[s.key] = 0);
  acts.flatMap(a => (a.tasks||[]).flatMap(t => (t.products||[]).filter(p => p.uploaded).flatMap(p => p.publishedSocials||[]))).forEach(k => { if(socCount[k]!==undefined) socCount[k]++; });

  // Top contributors
  const contrib = {};
  allTasks.forEach(t => {
    const people2 = [...new Set([t.responsable,...(t.assignedPeople||[])].filter(Boolean))];
    people2.forEach(n => { contrib[n] = (contrib[n]||0) + (t.done ? 1 : 0); });
  });
  const topContribs = Object.entries(contrib).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).slice(0,5);

  const socHTML = SOCIAL_NETS.map(s => socCount[s.key] > 0 ? `
    <div class="sum-soc-row">
      <span style="font-size:.78rem;font-weight:700;">${s.label}</span>
      <span style="font-family:'Nunito',sans-serif;font-weight:800;color:var(--cyan);">${socCount[s.key]} entregable${socCount[s.key]!==1?'s':''}</span>
    </div>` : '').join('');

  const contribHTML = topContribs.map(([name, cnt], i) => `
    <div class="sum-person-row">
      <span style="font-size:.75rem;font-weight:800;color:var(--muted);width:18px;">#${i+1}</span>
      <span class="av-mini" style="${personAv(name).style}">${personAv(name).content}</span>
      <span style="font-size:.78rem;font-weight:600;flex:1;">${esc(_dn(name))}</span>
      <span style="font-family:'Nunito',sans-serif;font-weight:800;color:var(--amber);">${cnt} tarea${cnt!==1?'s':''}</span>
    </div>`).join('');

  document.getElementById('summary-body').innerHTML = `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:2rem;margin-bottom:6px;">${pct===100?'🏆':'📊'}</div>
      <div style="font-family:'Nunito',sans-serif;font-size:1rem;font-weight:800;color:var(--a2);">${esc(activeEvt.name)}</div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:3px;">${formatDateStr(activeEvt.date)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
      <div class="sum-stat"><div class="sum-stat-val cv-blue">${acts.length}</div><div class="sum-stat-lbl">Actividades</div></div>
      <div class="sum-stat"><div class="sum-stat-val cv-cyan">${allTasks.length}</div><div class="sum-stat-lbl">Tareas totales</div></div>
      <div class="sum-stat"><div class="sum-stat-val cv-green">${doneTasks.length}</div><div class="sum-stat-lbl">Completadas</div></div>
      <div class="sum-stat"><div class="sum-stat-val ${pct===100?'cv-green':'cv-amber'}">${pct}%</div><div class="sum-stat-lbl">Ejecución</div></div>
    </div>
    ${socHTML ? `<div class="fsec-title" style="margin-bottom:8px;">📱 Cobertura en Redes</div>${socHTML}<div style="margin-bottom:14px;"></div>` : ''}
    ${contribHTML ? `<div class="fsec-title" style="margin-bottom:8px;">🏅 Top Colaboradores</div>${contribHTML}` : ''}
  `;
  document.getElementById('summary-modal').classList.add('open');
}

/* ══════════════════════════ CUMPLEAÑOS ══════════════════════════
   Ya no se usa la tarjeta/banner: ahora un botón 🎂 junto a notificaciones
   que solo aparece si hay cumpleañeros. Ver openBirthdayList() en reminders.js */
let _bdayCelebrants = [];
function checkBirthdays() {
  const banner = document.getElementById('bday-banner');
  if(banner) banner.style.display = 'none'; // tarjeta retirada

  // Fecha de El Salvador (UTC-6); aritmética con Date.UTC para evitar desfases de zona
  const [ty, tmo, td] = _svDateParts();
  const todayUTC = Date.UTC(ty, tmo - 1, td);
  const celebrants = [];
  people.filter(p => !p.archived && p.dob).forEach(p => {
    const parts = p.dob.split('-').map(Number);
    const bM = parts[1], bD = parts[2];
    const bdayUTC = Date.UTC(ty, bM - 1, bD);
    const diffDays = Math.round((bdayUTC - todayUTC) / 86400000);
    const diffDaysPast = -diffDays;
    if(diffDays >= 0 && diffDays <= 2) {
      celebrants.push({ name: p.name, photo: p.photo||null, daysAhead: diffDays, past: false });
    } else if(diffDaysPast > 0 && diffDaysPast <= 2) {
      celebrants.push({ name: p.name, photo: p.photo||null, daysAhead: -diffDaysPast, past: true });
    }
  });
  celebrants.sort((a,b) => a.daysAhead - b.daysAhead);
  _bdayCelebrants = celebrants;

  // Botón en el header: aparece solo si hay cumpleañeros y hay sesión
  const wrap  = document.getElementById('bday-wrap');
  const badge = document.getElementById('bday-badge');
  const show  = celebrants.length > 0 && (typeof authLevel === 'undefined' || authLevel >= 1);
  if(wrap) wrap.style.display = show ? '' : 'none';
  if(badge) {
    const todayCount = celebrants.filter(c => c.daysAhead === 0).length;
    const n = todayCount || celebrants.length;
    badge.textContent = n > 9 ? '9+' : n;
    badge.classList.toggle('show', show);
  }
}
