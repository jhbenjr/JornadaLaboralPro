/* ══════════════════════════ RENDER SELECTED EVENT CARDS (GROUPED BY SCHEDULE) ══════════════════════════ */
window.toggleScheduleBlock = function(idx) {
    const body = document.getElementById(`sch-body-${idx}`);
    const chev = document.getElementById(`sch-chev-${idx}`);
    if(!body) return;
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    if(chev) chev.classList.toggle('open', !isOpen);
};

let _actsView = 'cards'; // 'cards' | 'gantt' | 'byp'
window.switchActsView = function(mode) {
  _actsView = mode;
  const cards = document.getElementById('act-content-area');
  const byp   = document.getElementById('byp-content');
  if(cards) cards.style.display = mode === 'byp' ? 'none' : '';
  if(byp)   byp.style.display   = mode === 'byp' ? '' : 'none';
  renderCards();
};

function _viewToggleHTML() {
  const btn = (mode, label, cls='') => `<button class="btn ${_actsView===mode?'btn-add':'btn-ghost'}${cls}" style="font-size:.68rem;padding:4px 10px;" onclick="switchActsView('${mode}')">${label}</button>`;
  return `<div style="display:flex;gap:4px;margin-left:auto;">
    ${btn('cards','🗂 Tarjetas')}
    ${btn('gantt','📊 Gantt')}
    ${authLevel >= 2 ? btn('byp','👥 Por Persona') : ''}
  </div>`;
}

function renderCards(){
  if(currentTab !== 'acts') return;
  // Sincronizar visibilidad de los dos contenedores
  const _ca = document.getElementById('act-content-area');
  const _bp = document.getElementById('byp-content');
  if(_ca) _ca.style.display = _actsView === 'byp' ? 'none' : '';
  if(_bp) _bp.style.display = _actsView === 'byp' ? '' : 'none';
  if(_actsView === 'gantt') { renderGantt(); return; }
  if(_actsView === 'byp')   { renderByPerson(); return; }
  const container = document.getElementById('act-content-area');
  const activeEvtObj = events.find(e => e.id === activeEventId);
  
  if(!activeEvtObj) {
      container.innerHTML = `
      <div class="sec-head">
          <div class="sec-title">Programación de Actividades</div>
      </div>
      <div class="empty">
        <div class="empty-icon">📭</div>
        <div class="empty-text">No has seleccionado un evento</div>
        <div class="empty-sub">Haz clic en un bloque arriba para ver sus actividades</div>
      </div>`;
      return;
  }

  const currentActivities = getActiveActivities();
  let visible = applyFilters(currentActivities);

  // Mostrar/ocultar botón Mis asignaciones (solo usuarios con persona vinculada)
  const btnMy = document.getElementById('btn-my-acts');
  if(btnMy) btnMy.style.display = currentUser ? '' : 'none';

  // Ordenar: actividades donde el usuario tiene tareas primero
  if(currentUser) {
    const myName = currentUser.linkedPerson || currentUser.name;
    visible = [...visible].sort((a, b) => {
      const aHas = (a.tasks||[]).some(t => t.responsable===myName||(t.assignedPeople||[]).includes(myName)||(t.coliders||[]).includes(myName)) ? 0 : 1;
      const bHas = (b.tasks||[]).some(t => t.responsable===myName||(t.assignedPeople||[]).includes(myName)||(t.coliders||[]).includes(myName)) ? 0 : 1;
      return aHas - bHas;
    });
  }

  const isLocked = !_editUnlocked || authLevel < 2;

  // Aviso solo-mis-tareas para nivel 1
  const myTasksBanner = authLevel === 1 && currentUser
    ? `<div style="background:rgba(32,172,244,.08);border:1px solid rgba(32,172,244,.2);border-radius:8px;padding:7px 12px;margin-bottom:12px;font-size:.72rem;color:var(--cyan);">👤 Mostrando solo tus tareas asignadas</div>`
    : '';

  let html = myTasksBanner + `
      <div class="sec-head" style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:15px;">
          <div class="sec-title" style="display:flex; align-items:center; gap:8px; flex:1;">
              Actividades: <span style="color:var(--cyan); margin-left:4px;">${esc(activeEvtObj.name)}</span>
              <button class="ico-btn req-auth-2" style="width:24px; height:24px; font-size:.75rem;" onclick="openRenameEventModal()" title="Renombrar Evento">✏️</button>
              <button class="ico-btn session-lock-btn" style="width:24px; height:24px; font-size:.85rem; border-color:${authLevel >= 2 ? (_editUnlocked ? 'var(--cyan)' : 'var(--muted2)') : 'var(--border)'};" onclick="toggleLockEvent()" title="${authLevel >= 2 ? (_editUnlocked ? 'Bloquear edición' : 'Desbloquear edición') : 'Solo directores pueden editar'}">${authLevel >= 2 && _editUnlocked ? '🔓' : '🔒'}</button>
              <span class="res-count" style="margin-left: 10px; font-size:.7rem; color:var(--muted);">${currentActivities.length ? `(Mostrando ${visible.length} de ${currentActivities.length})` : ''}</span>
          </div>
          ${_viewToggleHTML()}
      </div>
  `;

  if(!visible.length){
    html += `<div class="empty">
      <div class="empty-icon">📭</div>
      <div class="empty-text">${currentActivities.length?'Ninguna actividad coincide con los filtros':'Sin actividades programadas en este evento'}</div>
      <div class="empty-sub">${currentActivities.length?'Ajusta los filtros arriba':'Haz clic en el candado 🔒 y añade una Nueva Actividad para comenzar a organizar'}</div>
    </div>`;
    container.innerHTML = html;
    return;
  }

  const now = new Date();
  const evtDateStr = activeEvtObj.date;

  // Helpers de hora → minutos desde medianoche
  const parseHM = (h) => {        // "7:00 AM" → 420
      const m = (h||'').match(/(\d+):(\d+)\s*(AM|PM)/i);
      if(!m) return null;
      let hh = parseInt(m[1],10); const mm = parseInt(m[2],10);
      if(/pm/i.test(m[3]) && hh < 12) hh += 12;
      if(/am/i.test(m[3]) && hh === 12) hh = 0;
      return hh*60 + mm;
  };
  const parse24 = (t) => {        // "06:00" → 360
      if(!t) return null;
      const [hh, mm] = t.split(':').map(Number);
      if(isNaN(hh)) return null;
      return hh*60 + (mm||0);
  };
  const fmt12 = (mins) => {
      const hh = Math.floor(mins/60), mm = mins%60;
      return `${((hh%12)||12)}:${String(mm).padStart(2,'0')} ${hh>=12?'PM':'AM'}`;
  };
  const evtAt = (mins) => { const d = new Date(`${evtDateStr}T00:00:00`); d.setHours(Math.floor(mins/60), mins%60, 0, 0); return d; };

  // Construir bloques con su hora (servicios regulares + extemporáneos en su posición)
  const blocks = [];

  SERVICE_HOURS.forEach(h => {
      if(h === 'Extemporáneo') return; // se manejan aparte, por su hora propia
      const actsInHour = visible.filter(a => {
          const horarios = (a.horarios && a.horarios.length) ? a.horarios : (a.horario ? [a.horario] : []);
          return horarios.includes(h);
      });
      if(!actsInHour.length) return;
      const timeMin = parseHM(h);
      blocks.push({ timeMin: timeMin ?? 99990, label: `🕒 ${h}`, acts: actsInHour, filterSchedule: h });
  });

  // Extemporáneos: agrupar por su hora elegida y colocarlos según esa hora
  const extempActs = visible.filter(a => {
      const horarios = (a.horarios && a.horarios.length) ? a.horarios : (a.horario ? [a.horario] : []);
      return horarios.includes('Extemporáneo');
  });
  const byExtTime = {};
  extempActs.forEach(a => { const k = a.extempTime || ''; (byExtTime[k] = byExtTime[k] || []).push(a); });
  Object.keys(byExtTime).forEach(t => {
      const mins = parse24(t);
      const label = mins != null ? `🕒 Extemporáneo · ${fmt12(mins)}` : `🕒 Extemporáneo (sin hora)`;
      blocks.push({ timeMin: mins != null ? mins : 99991, label, acts: byExtTime[t], filterSchedule: 'Extemporáneo' });
  });

  // Ordenar todos los bloques por hora
  blocks.sort((a,b) => a.timeMin - b.timeMin);

  blocks.forEach((blk, idx) => {
      // ¿bloque ya cerrado? (la hora del siguiente bloque ya pasó, en la fecha del evento)
      let isOpen = true;
      if(blk.timeMin < 99990) {
          const nextMin = (idx+1 < blocks.length && blocks[idx+1].timeMin < 99990)
              ? blocks[idx+1].timeMin : blk.timeMin + 120;
          if(now >= evtAt(nextMin)) isOpen = false;
      }
      html += `
      <div class="schedule-block" style="margin-bottom:20px;">
          <div class="schedule-hdr" onclick="toggleScheduleBlock('${idx}')">
              <div style="font-family:'Nunito',sans-serif; font-weight:800; color:var(--white); display:flex; align-items:center; gap:8px;">
                  ${blk.label}
                  <span style="font-size:.65rem; color:var(--muted); font-weight:600; font-family:'Montserrat',sans-serif;">(${blk.acts.length} actividades)</span>
              </div>
              <span id="sch-chev-${idx}" class="chevron ${isOpen?'open':''}">▼</span>
          </div>
          <div id="sch-body-${idx}" style="display:${isOpen?'block':'none'};">
              <div class="cards-grid">
                  ${blk.acts.map(a => buildCard(a, isLocked, blk.filterSchedule)).join('')}
              </div>
          </div>
      </div>`;
  });

  const otherActs = visible.filter(a => {
      const horarios = (a.horarios && a.horarios.length) ? a.horarios : (a.horario ? [a.horario] : []);
      return !horarios.some(h => SERVICE_HOURS.includes(h));
  });
  if (otherActs.length > 0) {
      html += `
      <div class="schedule-block" style="margin-bottom:20px;">
          <div class="schedule-hdr" onclick="toggleScheduleBlock('others')">
              <div style="font-family:'Nunito',sans-serif; font-weight:800; color:var(--white); display:flex; align-items:center; gap:8px;">
                  📌 Otros / Sin Asignar
                  <span style="font-size:.65rem; color:var(--muted); font-weight:600; font-family:'Montserrat',sans-serif;">(${otherActs.length} actividades)</span>
              </div>
              <span id="sch-chev-others" class="chevron open">▼</span>
          </div>
          <div id="sch-body-others" style="display:block;">
              <div class="cards-grid">
                  ${otherActs.map(a => buildCard(a, isLocked)).join('')}
              </div>
          </div>
      </div>`;
  }

  container.innerHTML = html;
}

function deleteActivity(id){
  forceAdminPin(() => {
    customConfirm('¿Eliminar esta actividad completa de forma permanente?', () => {
      activities=activities.filter(a=>a.id!==id);
      afterChange();
      showToast('🗑 Actividad eliminada');
    });
  });
}

function buildCard(a, isLocked, filterSchedule){
  const grad=GRAD[a.color]||GRAD.morado;
  const allTasks=a.tasks||[];
  // Filtrar tareas al servicio contextual si la actividad tiene múltiples servicios
  const horarios = (a.horarios && a.horarios.length) ? a.horarios : (a.horario ? [a.horario] : []);
  const isMulti = horarios.length > 1;
  const scopedTasks = (isMulti && filterSchedule)
    ? allTasks.filter(t => t.horario === filterSchedule)
    : allTasks;
  const activeTasks=scopedTasks.filter(t=>!t.cancelled);
  const doneCount=activeTasks.filter(t=>t.done).length;
  const progPct=activeTasks.length?Math.round(doneCount/activeTasks.length*100):0;
  // Calcular estado basado en las tareas del servicio actual
  function scopedStatus(){
    const active=activeTasks;
    if(!active.length) return 'No iniciada';
    const done=active.filter(t=>t.done).length;
    if(done===0) return 'No iniciada';
    if(done===active.length) return 'Finalizada';
    return 'En proceso';
  }
  const status=scopedStatus();
  const priIcon=a.prioridad==='Alta'?'🔴':a.prioridad==='Baja'?'⚪':'🟢';
  const stCls=status==='Finalizada'?'as-fin':status==='En proceso'?'as-proc':'as-noini';
  const stIcon=status==='Finalizada'?'✅':status==='En proceso'?'⏳':'⭕';
  const av=a.responsable?personAv(a.responsable):null;
  const schArg = filterSchedule ? `,'${filterSchedule.replace(/'/g,"\\'")}'` : '';

  return `<div class="act-card act-card-compact" id="card-${a.id}-${filterSchedule||'x'}" onclick="openActivityModal('${a.id}',null${schArg})" style="cursor:pointer;">
    <div class="card-stripe" style="background:${grad}"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 8px 14px;">
      <div style="flex:1;min-width:0;">
        <div class="card-activity" style="font-size:.82rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.activity)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
          <span class="act-status ${stCls}" style="font-size:.6rem;">${stIcon} ${status}</span>
          <span style="font-size:.6rem;color:var(--muted);">${priIcon} ${a.prioridad}</span>
          ${a.department?`<span style="font-size:.56rem;color:var(--a2);background:rgba(124,92,255,.1);border:1px solid rgba(124,92,255,.28);border-radius:20px;padding:1px 7px;font-weight:700;">🏷️ ${esc(a.department)}</span>`:''}
          ${isMulti?`<span class="sch-chip" style="font-size:.58rem;">📋 Todos los servicios</span>`:(a.horario?`<span style="font-size:.6rem;color:var(--muted);">🕒 ${a.horario}</span>`:'')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
        ${av?`<span class="av-dot" style="${av.style};width:22px;height:22px;font-size:.55rem;" title="${esc(_dn(a.responsable))}">${av.content}</span>`:''}
        <div style="display:flex;gap:3px;" onclick="event.stopPropagation();">
          ${!isLocked?`<button class="ico-btn dup" title="Duplicar" onclick="duplicateActivity('${a.id}')" style="width:22px;height:22px;font-size:.65rem;">📄</button>
          <button class="ico-btn" title="Editar" onclick="openModal('${a.id}')" style="width:22px;height:22px;font-size:.65rem;">✏️</button>
          <button class="ico-btn del" title="Eliminar" onclick="deleteActivity('${a.id}')" style="width:22px;height:22px;font-size:.65rem;">🗑</button>`:''}
        </div>
      </div>
    </div>
    ${activeTasks.length?`<div style="padding:0 12px 10px 14px;display:flex;align-items:center;gap:8px;">
      <div class="prog-bar" style="flex:1;"><div class="prog-fill" style="width:${progPct}%"></div></div>
      <span style="font-size:.62rem;color:var(--muted);flex-shrink:0;">${doneCount}/${activeTasks.length} tareas</span>
    </div>`:'<div style="padding:0 12px 8px 14px;font-size:.62rem;color:var(--muted2);">Sin tareas en este servicio</div>'}
  </div>`;
}

let _myActsOnly = false;
window.toggleMyActs = function() {
  _myActsOnly = !_myActsOnly;
  const btn = document.getElementById('btn-my-acts');
  if(btn) { btn.classList.toggle('btn-add', _myActsOnly); btn.classList.toggle('btn-ghost', !_myActsOnly); }
  renderCards();
};

window.openActivityModal = function(actId, focusTaskId, filterSchedule) {
  const a = activities.find(x => x.id === actId);
  if(!a) return;
  const isLocked = !_editUnlocked || authLevel < 2;
  const modal = document.getElementById('activity-detail-modal');
  const titleEl = document.getElementById('activity-detail-title');
  const body = document.getElementById('activity-detail-body');
  if(!modal || !body) return;

  const grad = GRAD[a.color] || GRAD.morado;
  const allTasks = a.tasks || [];
  const horarios = (a.horarios && a.horarios.length) ? a.horarios : (a.horario ? [a.horario] : []);
  const isMulti = horarios.length > 1;
  const priIcon = a.prioridad==='Alta'?'🔴':a.prioridad==='Baja'?'⚪':'🟢';
  const av = a.responsable ? personAv(a.responsable) : null;

  if(titleEl) titleEl.innerHTML = `<span style="background:${grad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${esc(a.activity)}</span>`;

  const respHTML = av
    ? `<span class="av-dot" style="${av.style};width:22px;height:22px;font-size:.55rem;">${av.content}</span><span style="font-size:.78rem;font-weight:700;">${esc(_dn(a.responsable))}</span>`
    : '<span style="font-size:.72rem;color:var(--muted2);">Sin responsable</span>';

  // Construir secciones de tareas (por servicio si multi, o flat si un solo servicio)
  function buildTaskSection(tasks) {
    const active = tasks.filter(t => !t.cancelled);
    const done = active.filter(t => t.done).length;
    const pct = active.length ? Math.round(done/active.length*100) : 0;
    const cancelled = tasks.length - active.length;
    return {active, done, pct, cancelled,
      html: tasks.length ? tasks.map(t => {
        const hist = (t.history||[]).slice(-3).reverse();
        const histHTML = hist.length ? `<div style="margin:6px 0 0 37px;display:flex;flex-direction:column;gap:3px;">${hist.map(h=>{
          const d=new Date(h.at); const ds=d.toLocaleDateString('es-SV',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
          return `<span style="font-size:.6rem;color:var(--muted);">• ${h.action==='completada'?'✅':'↩️'} ${esc(h.by)} — ${ds}</span>`;
        }).join('')}</div>` : '';
        return buildTaskCard(a, t, isLocked) + histHTML;
      }).join('') : '<div style="font-size:.74rem;color:var(--muted2);text-align:center;padding:14px;">Sin tareas en este servicio</div>'
    };
  }

  let tasksHTML = '';
  let totalActive = 0, totalDone = 0, totalCancelled = 0;

  if(isMulti) {
    // Mostrar sección por servicio
    horarios.forEach(h => {
      const hTasks = allTasks.filter(t => t.horario === h);
      const sec = buildTaskSection(hTasks);
      totalActive += sec.active.length; totalDone += sec.done; totalCancelled += sec.cancelled;
      tasksHTML += `
        <div style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:rgba(32,172,244,.07);border-radius:6px;margin-bottom:6px;">
            <span style="font-size:.68rem;font-weight:700;color:var(--cyan);">🕒 ${esc(h)}</span>
            ${sec.active.length?`<div style="display:flex;align-items:center;gap:6px;"><div class="prog-bar" style="width:80px;"><div class="prog-fill" style="width:${sec.pct}%"></div></div><span style="font-size:.6rem;color:var(--muted);">${sec.done}/${sec.active.length}</span></div>`:''}
          </div>
          ${sec.html}
        </div>`;
    });
    // Tareas sin servicio asignado
    const orphan = allTasks.filter(t => !horarios.includes(t.horario));
    if(orphan.length) {
      const sec = buildTaskSection(orphan);
      totalActive += sec.active.length; totalDone += sec.done; totalCancelled += sec.cancelled;
      tasksHTML += `<div style="margin-bottom:10px;"><div style="font-size:.65rem;font-weight:700;color:var(--amber);padding:5px 8px;background:rgba(255,198,0,.07);border-radius:6px;margin-bottom:6px;">⚠️ Sin servicio asignado</div>${sec.html}</div>`;
    }
  } else {
    const sec = buildTaskSection(allTasks);
    totalActive = sec.active.length; totalDone = sec.done; totalCancelled = sec.cancelled;
    tasksHTML = sec.html;
  }

  const totalPct = totalActive ? Math.round(totalDone/totalActive*100) : 0;
  const totalStatus = totalActive===0?'No iniciada':totalDone===totalActive?'Finalizada':'En proceso';
  const stCls = totalStatus==='Finalizada'?'as-fin':totalStatus==='En proceso'?'as-proc':'as-noini';
  const stIcon = totalStatus==='Finalizada'?'✅':totalStatus==='En proceso'?'⏳':'⭕';

  body.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border);">
      <span class="act-status ${stCls}">${stIcon} ${totalStatus}</span>
      <span style="font-size:.68rem;color:var(--muted);">${priIcon} ${a.prioridad}</span>
      ${isMulti ? horarios.map(h=>`<span class="sch-chip">${esc(h)}</span>`).join('') : (a.horario?`<span style="font-size:.68rem;color:var(--muted);">🕒 ${a.horario}</span>`:'')}
      ${a.lugar?`<span style="font-size:.68rem;color:var(--muted);">📍 ${esc(a.lugar)}</span>`:''}
      ${a.fecha?`<span style="font-size:.68rem;color:var(--muted);">📅 ${formatDateStr(a.fecha)}</span>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:${a.notas?'10px':'14px'};">
      ${respHTML}
    </div>
    ${a.notas?`<div class="detail-box" style="margin-bottom:14px;">📝 ${esc(a.notas)}</div>`:''}
    <div class="tasks-header" style="margin-bottom:8px;">
      <div class="tasks-title">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Tareas (${totalDone}/${totalActive}${totalCancelled?` +${totalCancelled} canc.`:''})
      </div>
      ${totalActive?`<div class="tasks-progress"><div class="prog-bar"><div class="prog-fill" style="width:${totalPct}%"></div></div><span class="prog-txt">${totalPct}%</span></div>`:''}
    </div>
    ${tasksHTML}
    ${!isLocked?`<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" style="font-size:.72rem;" onclick="duplicateActivity('${a.id}');closeActivityModal()">📄 Duplicar</button>
      <button class="btn btn-ghost" style="font-size:.72rem;" onclick="closeActivityModal();openModal('${a.id}')">✏️ Editar</button>
      <button class="btn btn-danger" style="font-size:.72rem;" onclick="closeActivityModal();deleteActivity('${a.id}')">🗑 Eliminar</button>
    </div>`:''}
    ${(()=>{ const hist=(a._actHistory||[]);
      if(!hist.length) return '';
      const fmt=ts=>new Date(ts).toLocaleString('es-SV',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
        <div style="font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:7px;">🕓 Historial de cambios</div>
        ${[...hist].reverse().map(h=>`<div style="display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:.66rem;flex-wrap:wrap;">
          <span style="font-weight:700;color:var(--white);">${esc(h.by)}</span>
          <span style="color:var(--muted);">${h.action==='create'?'✅ Creó':'✏️ Editó'}</span>
          ${h.info?`<span style="color:var(--cyan);font-size:.62rem;">· ${esc(h.info)}</span>`:''}
          <span style="color:var(--muted2);margin-left:auto;">${fmt(h.ts)}</span>
        </div>`).join('')}
      </div>`;
    })()}`;

  modal.classList.add('open');

  if(focusTaskId) {
    setTimeout(() => {
      const el = document.getElementById(`ti-${actId}-${focusTaskId}`);
      if(el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('flash-highlight'); setTimeout(()=>el.classList.remove('flash-highlight'),1800); }
    }, 120);
  }
};

window.closeActivityModal = function() {
  document.getElementById('activity-detail-modal')?.classList.remove('open');
};

function buildTaskCard(a,t,isLocked){
  const actId = a.id;

  function _miniChip(n, isLeader=false) {
    const pObj = people.find(x => x.name === n);
    const photoStyle = pObj?.photo ? `background-image:url(${pObj.photo});background-size:cover;` : `background:${avc(n)}`;
    const initial = pObj?.photo ? '' : ini(_dn(n));
    const color = isLeader ? 'color:var(--green);' : '';
    const rsvpStatus = t.rsvp?.[n]?.status;
    const rsvpDot = rsvpStatus === 'confirmed' ? '<span title="RSVP: Confirmó" style="font-size:.5rem;line-height:1;opacity:.7;">🗓️</span>'
                  : rsvpStatus === 'declined'  ? '<span title="RSVP: No puede" style="font-size:.5rem;line-height:1;opacity:.7;">🚫</span>'
                  : '';
    // Indicador de asistencia (solo si el evento ya llegó y el usuario es coord+)
    const evObj = events.find(e => e.id === a.eventId);
    const attStatus = evObj?.attendance?.[n]?.status || '';
    const eventPassed = evObj?.date && evObj.date <= todayStr;
    let attBtn = '';
    if(eventPassed) {
      if(authLevel >= 2) {
        const icon = attStatus === 'present' ? '🟢' : attStatus === 'absent' ? '🔴' : '⬜';
        const tip  = attStatus === 'present' ? 'Presente · clic para cambiar' : attStatus === 'absent' ? 'Ausente · clic para cambiar' : 'Sin marcar · clic para registrar asistencia';
        attBtn = `<span title="${tip}" onclick="event.stopPropagation();quickMarkAttendance('${a.eventId}','${n.replace(/'/g,"\\'")}')" style="cursor:pointer;font-size:.6rem;line-height:1;border-radius:50%;padding:0 1px;" >${icon}</span>`;
      } else if(attStatus) {
        const icon = attStatus === 'present' ? '🟢' : '🔴';
        attBtn = `<span title="${attStatus === 'present' ? 'Presente' : 'Ausente'}" style="font-size:.6rem;line-height:1;">${icon}</span>`;
      }
    }
    return `<span title="${esc(_dn(n))}" style="display:inline-flex;align-items:center;gap:3px;background:var(--s3);border:1px solid var(--border);border-radius:20px;padding:2px 7px 2px 3px;font-size:.64rem;font-weight:600;white-space:nowrap;${color}">` +
      `<span class="av-mini" style="${photoStyle};width:16px;height:16px;font-size:.45rem;flex-shrink:0;">${initial}</span>` +
      (isLeader ? `<span style="font-size:.55rem;">👑</span>` : '') +
      `${esc(_dn(n))}${rsvpDot}${attBtn}</span>`;
  }
  const avHTML = t.assignedPeople&&t.assignedPeople.length
    ? t.assignedPeople.map(n => _miniChip(n)).join('')
    : '<span style="font-size:.65rem;color:var(--muted2);padding:1px 4px;">Sin apoyos</span>';
  const _extLbl = { 'Externo':'🌐 Externo', 'CCRTV':'📡 CCRTV', 'Juventud Elim':'🔥 Juventud Elim' };
  const extHTML = (t.externals||[]).map(ex =>
    `<span style="display:inline-flex;align-items:center;gap:3px;font-size:.62rem;padding:1px 7px;border-radius:20px;background:rgba(236,103,66,.1);color:#ec6742;border:1px solid rgba(236,103,66,.35);font-weight:700;">${_extLbl[ex.origin]||'🌐'} ${esc(ex.name)}</span>`).join('');

  const timeStr=(t.inicio||t.fin)?`<span class="task-time-badge">▶ ${t.inicio||'–'} → ${t.fin||'–'}</span>`:'';
  
  let isOverdue = false;
  if(a.fecha && t.fin && !t.done && !t.cancelled) {
      const dueDateTime = new Date(`${a.fecha}T${t.fin}`);
      if(dueDateTime < new Date()) isOverdue = true;
  }
  const overdueCls = isOverdue ? ' task-overdue' : '';

  const prodsHTML=(t.products||[]).length
    ?`<div class="task-products-always">
        <div class="products-header">📦 Entregables / Productos</div>
        ${t.products.map((pr,pi)=>buildProductCardForDisplay(actId,t.id,pi,pr,isLocked)).join('')}
      </div>`:'';

  const respTaskHTML = t.responsable ? _miniChip(t.responsable, true) : '';
  // Co-líderes
  const colidersHTML = (t.coliders||[]).filter(Boolean).map(n => _miniChip(n, true)).join('');

  const linksDispHTML = (t.links||[]).length ? `
      <div class="tg-field full">
          <div class="tg-lbl">📎 Documentos de Apoyo</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${t.links.map(lnk => `<a href="${esc(lnk)}" target="_blank" class="sch-chip-link" onclick="event.stopPropagation();">🔗 ${esc(lnk).substring(0,30)}...</a>`).join('')}
          </div>
      </div>
  ` : '';

  const isCancelled = !!t.cancelled;
  const cancelledCls = isCancelled ? ' task-cancelled' : '';
  const effectiveOverdue = isOverdue && !isCancelled;

  // RSVP aggregate
  const _rsvpAll = [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean);
  const _rsvpConfirmed = _rsvpAll.filter(n => t.rsvp?.[n]?.status === 'confirmed').length;
  const _rsvpDeclined  = _rsvpAll.filter(n => t.rsvp?.[n]?.status === 'declined').length;
  const _rsvpPending   = _rsvpAll.length - _rsvpConfirmed - _rsvpDeclined;
  const rsvpSummaryHTML = (_rsvpAll.length > 0 && (_rsvpConfirmed || _rsvpDeclined))
    ? `<div style="padding:0 11px 6px 37px;font-size:.6rem;color:var(--muted);display:flex;gap:6px;flex-wrap:wrap;">
        ${_rsvpConfirmed ? `<span style="color:var(--green)">✅ ${_rsvpConfirmed} confirmó</span>` : ''}
        ${_rsvpDeclined  ? `<span style="color:var(--red)">❌ ${_rsvpDeclined} no puede</span>` : ''}
        ${_rsvpPending > 0 ? `<span style="color:var(--muted2)">⭕ ${_rsvpPending} pendiente${_rsvpPending>1?'s':''}</span>` : ''}
      </div>` : '';

  return `<div class="task-item${t.done?' done':''}${isCancelled?' cancelled':''}${effectiveOverdue?overdueCls:''}" id="ti-${actId}-${t.id}">
    <div class="task-header" onclick="expandTask('${actId}-${t.id}')">
      <div class="task-check${t.done?' checked':''} ${isCancelled?'locked':''} ${isLocked?'locked':''}"
        onclick="event.stopPropagation(); ${isCancelled ? `showToast('🚫 Reactiva la tarea para marcarla como completada')` : isLocked ? `showToast('⚠️ Solo Director/Enlace o Admin pueden marcar tareas.')` : `toggleTaskDone('${actId}','${t.id}')`}"></div>

      <div class="task-name">
        <span class="t-name"${isCancelled?' style="text-decoration:line-through;color:var(--muted);"':''}>${esc(t.name||'Sin nombre')}</span>
        ${isCancelled?'<span style="font-size:.58rem;font-weight:800;color:var(--muted);letter-spacing:.04em;">🚫 CANCELADA</span>':''}
      </div>

      <div class="task-badges" style="display:flex; align-items:center;">
        ${t.tarea?`<span style="background:rgba(251,230,149,.12);color:var(--amber);border:1px solid rgba(251,230,149,.2);padding:1px 7px;border-radius:20px;font-size:.58rem;font-weight:700">${esc(t.tarea.split(':')[0])}</span>`:''}
        ${timeStr}
        ${effectiveOverdue?`<span style="color:var(--red); font-size:.65rem; font-weight:800;">⚠️ Vencida</span>`:''}
        ${!isLocked?`<button class="btn-cancel-task req-auth-2" onclick="event.stopPropagation();toggleTaskCancelled('${actId}','${t.id}')" title="${isCancelled?'Reactivar tarea':'Cancelar tarea'}">${isCancelled?'↩ Reactivar':'🚫'}</button>`:''}
      </div>
      <span class="task-expand" id="tex-${actId}-${t.id}">▼</span>
    </div>
    ${(respTaskHTML||colidersHTML||t.assignedPeople?.length||(t.externals||[]).length)?`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:3px;padding:0 11px 8px 37px;">${respTaskHTML}${colidersHTML}${avHTML}${extHTML}</div>`:''}
    ${rsvpSummaryHTML}

    <div class="task-body" id="tbody-${actId}-${t.id}">
      <div class="task-grid">
        ${t.lugar?`<div class="tg-field full"><div class="tg-lbl">📍 Lugar</div><div class="tg-val">${esc(t.lugar)}</div></div>`:''}
        ${t.habilidad?`<div class="tg-field full"><div class="tg-lbl">🎯 Habilidad Requerida</div><div class="tg-val">${esc(t.habilidad)}</div></div>`:''}
        ${t.indicaciones?`<div class="tg-field full"><div class="tg-lbl">⚠️ Indicaciones</div><div class="hint-box">${esc(t.indicaciones)}</div></div>`:''}
        ${linksDispHTML}
        ${t.detalles?`<div class="tg-field full"><div class="tg-lbl">📝 Detalles</div><div class="detail-box">${esc(t.detalles)}</div></div>`:''}
      </div>
    </div>
    ${prodsHTML}
  </div>`;
}

function buildProductCardForDisplay(actId,taskId,pi,pr,isLocked){
  const socsHTML=(pr.socials||[]).map(k=>{
    const s=SOCIAL_NETS.find(x=>x.key===k);
    const isPublished = pr.publishedSocials && pr.publishedSocials.includes(k);
    return s?`<span class="soc-chip soc-active ${s.cls.split(' ')[0]}${isPublished?' soc-uploaded':''}">${s.label}</span>`:'';
  }).join('');

  return `<div class="product-item${pr.uploaded?' uploaded':''}" id="prod-${actId}-${taskId}-${pi}">
    <div class="prod-top">
      <div class="prod-check${pr.uploaded?' checked':''} ${isLocked?'locked':''}"
        onclick="${isLocked ? `showToast('⚠️ Solo Director/Enlace o Admin pueden marcar entregables.')` : `toggleProductUploaded('${actId}','${taskId}',${pi})`}"></div>
      <span class="prod-name">${esc(pr.name||'Producto sin nombre')}</span>
      <span class="prod-type">${esc(pr.type||'Otro')}</span>
    </div>
    ${socsHTML?`<div class="prod-socials">${socsHTML}</div>`:''}
    ${pr.notes?`<div class="prod-notes">📌 ${esc(pr.notes)}</div>`:''}
  </div>`;
}

function expandTask(key){
  const body=document.getElementById('tbody-'+key);
  const arrow=document.getElementById('tex-'+key);
  if(!body)return;
  const open=body.classList.toggle('open');
  if(arrow)arrow.classList.toggle('open',open);
}

/* ══════════════════════════ KPIs & FILTERS ══════════════════════════ */
function updateKPIs(){
  const allActs = getActiveActivities();
  const elTotal = document.getElementById('k-total');
  const elFin = document.getElementById('k-fin');
  const elProc = document.getElementById('k-proc');
  const elNoini = document.getElementById('k-noini');
  const elTareas = document.getElementById('k-tareas');
  const elAlta = document.getElementById('k-alta');

  if(elTotal) elTotal.textContent=allActs.length;
  const statuses=allActs.map(a=>computeStatus(a));
  if(elFin) elFin.textContent=statuses.filter(s=>s==='Finalizada').length;
  if(elProc) elProc.textContent=statuses.filter(s=>s==='En proceso').length;
  if(elNoini) elNoini.textContent=statuses.filter(s=>s==='No iniciada').length;
  const allTasks=allActs.flatMap(a=>a.tasks||[]);
  if(elTareas) elTareas.textContent=allTasks.length;
  if(elAlta) elAlta.textContent=allActs.filter(a=>a.prioridad==='Alta').length;
}

function toggleFP(){ 
  const fpBody = document.getElementById('fp-body');
  const fpChev = document.getElementById('fp-chev');
  if(fpBody) fpBody.classList.toggle('open'); 
  if(fpChev) fpChev.classList.toggle('open'); 
}

function buildDynamicFilters(){
  const allActs = getActiveActivities(); 
  const uniq=arr=>[...new Set(arr.filter(Boolean))].sort();
  function mkChips(cid,vals,grp,cls=''){
    const el=document.getElementById(cid); if(!el) return;
    if(!vals.length){el.innerHTML='<span style="font-size:.65rem;color:var(--muted2)">—</span>';return;}
    el.innerHTML=vals.map(v=>`<span class="fchip ${cls}" data-g="${grp}" data-v="${esc(v)}" onclick="toggleFilter(this,'${grp}','${v.replace(/'/g,"\\'")}')">${esc(v)}</span>`).join('');
    el.querySelectorAll('.fchip').forEach(c=>{ if(filters[grp]&&filters[grp].has(c.dataset.v))c.classList.add('active'); });
  }
  mkChips('f-horarios',   uniq(allActs.map(a=>a.horario).filter(Boolean)), 'horarios');
  mkChips('f-lugares',    uniq(allActs.flatMap(a=>(a.tasks||[]).map(t=>t.lugar).filter(Boolean))), 'lugares');
  mkChips('f-departamentos', uniq(allActs.map(a=>a.department).filter(Boolean)), 'departamentos');
  mkChips('f-actividades',uniq(allActs.map(a=>a.activity)), 'actividades');
  mkChips('f-tareas',     uniq(allActs.flatMap(a=>(a.tasks||[]).map(t=>t.tarea).filter(Boolean))), 'tareas');
  
  const allResponsables = allActs.map(a=>a.responsable).concat(allActs.flatMap(a=>(a.tasks||[]).map(t=>t.responsable)));
  mkChips('f-responsables',uniq(allResponsables), 'responsables');
  
  mkChips('f-asignados',  uniq(allActs.flatMap(a=>(a.tasks||[]).flatMap(t=>t.assignedPeople||[]))), 'asignados');
  document.querySelectorAll('.fchip[data-g="prioridad"],.fchip[data-g="estado"]').forEach(c=>{
    const g=c.dataset.g; if(filters[g]&&filters[g].has(c.dataset.v))c.classList.add('active'); c.onclick=()=>toggleFilter(c,g,c.dataset.v);
  });
  updateFPCount();
}

function toggleFilter(chip,grp,val){ const s=filters[grp]; if(s.has(val)){s.delete(val);chip.classList.remove('active');} else{s.add(val);chip.classList.add('active');} updateFPCount();renderCards(); }
function resetFilters(){ Object.keys(filters).forEach(k=>filters[k].clear()); document.querySelectorAll('.fchip').forEach(c=>c.classList.remove('active')); updateFPCount();renderCards(); }
function updateFPCount(){ const n=Object.values(filters).reduce((s,set)=>s+set.size,0); const el=document.getElementById('fp-count'); if(el) { el.textContent=n;el.style.display=n?'inline':'none'; } }

function applyFilters(list){
  return list.filter(a=>{
    if(_myActsOnly && currentUser) {
      const myName = currentUser.linkedPerson || currentUser.name;
      if(!(a.tasks||[]).some(t => t.responsable===myName||(t.assignedPeople||[]).includes(myName)||(t.coliders||[]).includes(myName))) return false;
    }
    if(filters.horarios.size&&!filters.horarios.has(a.horario))return false;
    if(filters.lugares.size&&!(a.tasks||[]).some(t=>filters.lugares.has(t.lugar)))return false;
    if(filters.actividades.size&&!filters.actividades.has(a.activity))return false;
    if(filters.tareas.size&&!(a.tasks||[]).some(t=>filters.tareas.has(t.tarea)))return false;
    if(filters.responsables.size&&!filters.responsables.has(a.responsable)&&!(a.tasks||[]).some(t=>filters.responsables.has(t.responsable)))return false;
    if(filters.asignados.size&&!(a.tasks||[]).some(t=>(t.assignedPeople||[]).some(p=>filters.asignados.has(p))))return false;
    if(filters.prioridad.size&&!filters.prioridad.has(a.prioridad))return false;
    if(filters.estado.size&&!filters.estado.has(computeStatus(a)))return false;
    if(filters.departamentos.size&&!filters.departamentos.has(a.department))return false;
    return true;
  });
}

/* ══════════════════════════ GANTT VIEW ══════════════════════════ */
function _toMin(t) {
  if(!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function renderGantt() {
  if(currentTab !== 'acts') return;
  const container = document.getElementById('act-content-area');
  const activeEvtObj = events.find(e => e.id === activeEventId);

  if(!activeEvtObj) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">No has seleccionado un evento</div></div>`;
    return;
  }

  const acts = applyFilters(getActiveActivities());

  // Determinar rango de tiempo automático (o 06:00–22:00 como fallback)
  let minMin = 1440, maxMin = 0;
  acts.forEach(a => (a.tasks||[]).forEach(t => {
    const s = _toMin(t.inicio), e = _toMin(t.fin);
    if(s !== null) minMin = Math.min(minMin, s);
    if(e !== null) maxMin = Math.max(maxMin, e);
  }));
  if(minMin >= maxMin) { minMin = 360; maxMin = 1320; } // fallback 6am–10pm
  // Añadir margen de 30 min
  minMin = Math.max(0, minMin - 30);
  maxMin = Math.min(1440, maxMin + 30);
  const span = maxMin - minMin;

  function pct(min) { return ((min - minMin) / span * 100).toFixed(2); }

  // Generar marcadores de hora
  const hourMarks = [];
  for(let m = Math.ceil(minMin/60)*60; m <= maxMin; m += 60) {
    const h = Math.floor(m/60);
    hourMarks.push({ min: m, label: `${String(h).padStart(2,'0')}:00` });
  }
  const hourTicksHTML = hourMarks.map(h =>
    `<div style="position:absolute;left:${pct(h.min)}%;top:0;bottom:0;border-left:1px dashed var(--border);pointer-events:none;"></div>
     <div style="position:absolute;left:${pct(h.min)}%;transform:translateX(-50%);font-size:.6rem;color:var(--muted);white-space:nowrap;">${h.label}</div>`
  ).join('');

  // Línea "ahora"
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const nowHTML = (nowMin >= minMin && nowMin <= maxMin && activeEvtObj.date === todayStr)
    ? `<div style="position:absolute;left:${pct(nowMin)}%;top:0;bottom:0;width:2px;background:var(--red);opacity:.7;pointer-events:none;z-index:2;">
        <div style="position:absolute;top:-2px;left:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);"></div>
       </div>`
    : '';

  // Filas de tareas
  let rowsHTML = '';
  let hasAnyTask = false;

  // Agrupar por servicio
  const serviceGroups = {};
  acts.forEach(a => {
    const horarios = (a.horarios&&a.horarios.length) ? a.horarios : (a.horario ? [a.horario] : ['Sin servicio']);
    const grad = GRAD[a.color] || GRAD.morado;
    (a.tasks||[]).filter(t=>!t.cancelled).forEach(t => {
      const svc = t.horario || horarios[0] || 'Sin servicio';
      if(!serviceGroups[svc]) serviceGroups[svc] = [];
      serviceGroups[svc].push({ a, t, grad });
      hasAnyTask = true;
    });
  });

  if(!hasAnyTask) {
    container.innerHTML = `
      <div class="sec-head" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:15px;">
        <div class="sec-title" style="flex:1;">📊 Gantt — <span style="color:var(--cyan);">${esc(activeEvtObj.name)}</span></div>
        ${_viewToggleHTML()}
      </div>
      <div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Sin tareas con horario definido</div></div>`;
    return;
  }

  const COL_W = 180; // px columna nombre
  SERVICE_HOURS.concat(['Sin servicio']).forEach(svc => {
    const rows = serviceGroups[svc];
    if(!rows || !rows.length) return;
    rowsHTML += `<div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--cyan);padding:10px 0 4px;border-top:1px solid var(--border);margin-top:4px;">🕒 ${esc(svc)}</div>`;
    rows.forEach(({ a, t, grad }) => {
      const s = _toMin(t.inicio), e = _toMin(t.fin);
      const hasTimes = s !== null && e !== null && e > s;
      const leftPct = hasTimes ? pct(s) : '0';
      const widthPct = hasTimes ? ((e-s)/span*100).toFixed(2) : '5';
      const tooNarrow = hasTimes && (e-s) < 25;
      const resp = t.responsable ? _dn(t.responsable).split(' ')[0] : '';
      const timeLabel = (t.inicio && t.fin) ? `${t.inicio}–${t.fin}` : (t.inicio||'');
      const tooltip = `${t.name} · ${esc(a.activity)}${timeLabel?' · '+timeLabel:''}`;
      rowsHTML += `
        <div style="display:flex;align-items:center;height:34px;margin-bottom:3px;">
          <div style="width:${COL_W}px;flex-shrink:0;font-size:.65rem;padding-right:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg);" title="${tooltip}">
            <span style="color:var(--muted);font-size:.58rem;">${esc(a.activity)} ·</span> ${esc(t.name)}
          </div>
          <div style="flex:1;position:relative;height:24px;">
            ${hasTimes ? `
            <div onclick="openActivityModal('${a.id}')" title="${tooltip}"
              style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${grad};border-radius:4px;cursor:pointer;
                     display:flex;align-items:center;padding:0 6px;box-sizing:border-box;overflow:hidden;
                     box-shadow:0 1px 4px rgba(0,0,0,.25);transition:opacity .15s;"
              onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">
              ${!tooNarrow?`<span style="font-size:.58rem;color:#fff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.name)}${resp?' · '+esc(resp):''}</span>`:''}
              ${t.done?`<span style="position:absolute;right:4px;font-size:.65rem;">✅</span>`:''}
            </div>` : `<span style="font-size:.6rem;color:var(--muted2);padding-left:4px;">Sin hora</span>`}
          </div>
        </div>`;
    });
  });

  container.innerHTML = `
    <div class="sec-head" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;">
      <div class="sec-title" style="flex:1;">📊 Gantt — <span style="color:var(--cyan);">${esc(activeEvtObj.name)}</span></div>
      ${_viewToggleHTML()}
    </div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
      <div style="min-width:${COL_W + 600}px;">
        <!-- Eje de tiempo -->
        <div style="display:flex;align-items:flex-end;height:28px;margin-bottom:4px;">
          <div style="width:${COL_W}px;flex-shrink:0;"></div>
          <div style="flex:1;position:relative;height:28px;">${hourTicksHTML}${nowHTML}</div>
        </div>
        <!-- Filas -->
        <div style="position:relative;">
          <!-- Líneas de fondo del eje -->
          <div style="position:absolute;left:${COL_W}px;right:0;top:0;bottom:0;pointer-events:none;">
            ${hourMarks.map(h=>`<div style="position:absolute;left:${pct(h.min)}%;top:0;bottom:0;border-left:1px dashed var(--border);"></div>`).join('')}
            ${nowHTML}
          </div>
          ${rowsHTML}
        </div>
      </div>
    </div>`;
}
