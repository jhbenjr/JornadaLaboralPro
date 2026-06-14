/* ══════════════════════════ PWA / NOTIFICACIONES ══════════════════════════ */
let _prevUserTaskIds = new Set();

function _getUserTaskIds(data) {
  const name = currentUser?.name;
  if(!name) return new Set();
  const ids = new Set();
  (data.activities || activities).forEach(a =>
    (a.tasks || []).forEach(t => {
      if(t.responsable === name || (t.assignedPeople || []).includes(name)) ids.add(t.id);
    })
  );
  return ids;
}

function _requestNotifPermission() {
  if(!('Notification' in window)) return;
  if(Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if(p === 'granted' && typeof _registerPush === 'function') _registerPush();
    });
  } else if(Notification.permission === 'granted' && typeof _registerPush === 'function') {
    _registerPush();
  }
}

/* ── Sincroniza estado de usuario con el SW ── */
async function _updateSWState() {
  if(!('serviceWorker' in navigator) || !currentUser) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const taskIds = [..._getUserTaskIds({})];
    reg.active?.postMessage({
      type: 'UPDATE_STATE',
      userName: currentUser.name,
      supaUrl: SUPA_URL,
      supaKey: SUPA_KEY,
      knownTaskIds: taskIds
    });
    // Registrar periodic sync si está disponible
    if('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if(status.state === 'granted') {
        await reg.periodicSync.register('depcom-check', { minInterval: 5 * 60 * 1000 });
      }
    }
  } catch(_) {}
}

/* ── Panel de próximas tareas ── */
function _getUpcomingTasks() {
  if(!currentUser) return [];
  const name = currentUser.linkedPerson || currentUser.name;
  const today = new Date(); today.setHours(0,0,0,0);
  const in7 = new Date(today); in7.setDate(today.getDate() + 7); in7.setHours(23,59,59,999);

  const tasks = [];
  activities.forEach(a => {
    (a.tasks || []).forEach(t => {
      if(t.done || t.cancelled) return;
      const assigned = t.responsable === name || (t.assignedPeople||[]).includes(name) || (t.coliders||[]).includes(name);
      if(!assigned) return;
      const evt = events.find(e => e.id === a.eventId);
      const dateStr = evt?.date || a.fecha || null;
      if(!dateStr) return;
      const d = new Date(dateStr + 'T12:00:00');
      if(d < today || d > in7) return;
      tasks.push({ t, a, evt, isLead: t.responsable === name || (t.coliders||[]).includes(name), date: d });
    });
  });
  return tasks.sort((a, b) => a.date - b.date);
}

function showUpcomingPanel(fromLogin = false) {
  if(!currentUser) return;
  const HALF_HOUR = 30 * 60 * 1000;
  const key = '_welcomeTs_' + currentUser.id;
  const last = parseInt(localStorage.getItem(key) || '0', 10);
  const elapsed = Date.now() - last;
  if(!fromLogin && elapsed < HALF_HOUR) return;
  localStorage.setItem(key, Date.now().toString());
  const name = currentUser.linkedPerson || currentUser.name;
  const now = new Date();
  const today = new Date(); today.setHours(0,0,0,0);
  const in7 = new Date(today); in7.setDate(today.getDate()+7); in7.setHours(23,59,59,999);
  const ago3 = new Date(today); ago3.setDate(today.getDate()-3);

  // ── KPIs ──
  let futuras = 0, completadas3d = 0, pendientesHist = 0;
  activities.forEach(a => {
    const evt = events.find(e => e.id === a.eventId);
    const dateStr = evt?.date || a.fecha || null;
    const d = dateStr ? new Date(dateStr + 'T12:00:00') : null;
    (a.tasks||[]).forEach(t => {
      const assigned = t.responsable===name||(t.assignedPeople||[]).includes(name)||(t.coliders||[]).includes(name);
      if(!assigned) return;
      if(t.cancelled) return;
      if(t.done) {
        if(d && d >= ago3) completadas3d++;
      } else {
        // futuras: fecha dentro de los próximos 7 días
        if(d && d >= today && d <= in7) futuras++;
        // pendientes históricas: evento pasado, no done
        else if(d && d < today) pendientesHist++;
      }
    });
  });

  const upcoming = _getUpcomingTasks();
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const fmt = d => d.toLocaleDateString('es-SV',{day:'numeric',month:'short'});
  const hour = now.getHours();
  const greeting = hour<12?'Buenos días':hour<18?'Buenas tardes':'Buenas noches';
  const firstName = currentUser.name.split(' ')[0];

  const listHTML = upcoming.length === 0
    ? `<div class="upc-empty">✅ Sin asignaciones pendientes esta semana</div>`
    : upcoming.map(({t,a,evt,isLead,date}) => {
        const role = isLead
          ? '<span class="upc-role lead">👑 Líder</span>'
          : '<span class="upc-role support">👥 Apoyo</span>';
        const isToday = date.toDateString() === today.toDateString();
        return `<div class="upc-item"${isToday?' style="border-color:var(--cyan);"':''} onclick="closeUpcomingPanel();openActivityModal('${a.id}','${t.id}')" style="cursor:pointer;${isToday?'border-color:var(--cyan);':''}">
          <div class="upc-date-col"><div class="upc-day">${date.getDate()}</div><div class="upc-dow">${DAYS[date.getDay()]}</div></div>
          <div class="upc-info">
            <div class="upc-task">${esc(t.name)}</div>
            <div class="upc-act">${esc(a.activity)}${evt?.name?' · '+esc(evt.name):''}</div>
            ${role}${t.inicio?`<span style="font-size:.6rem;color:var(--muted);margin-left:4px;">⏰ ${t.inicio}</span>`:''}
          </div>
        </div>`;
      }).join('');

  const showNotifBtn = 'Notification' in window && Notification.permission === 'default';
  const body = document.getElementById('login-modal-body');
  const foot = document.getElementById('login-modal-foot');
  const titleEl = document.getElementById('login-modal-title');
  if(titleEl) titleEl.textContent = '👋 Bienvenido';

  const pObj = people.find(p => {
    const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    return _norm(p.name) === _norm(currentUser.linkedPerson || currentUser.name);
  });
  const heroIcon = pObj?.photo
    ? `<div class="login-hero-icon" style="background-image:url(${pObj.photo});background-size:cover;background-color:transparent;border:2px solid #4a25aa;"></div>`
    : `<div class="login-hero-icon" style="font-size:1.5rem;background:linear-gradient(135deg,#4a24aa,#20ACF4);">👋</div>`;

  body.innerHTML = `
    <div class="login-hero" style="padding-bottom:10px;">
      ${heroIcon}
      <div class="login-hero-title">${greeting}, ${esc(firstName)}!</div>
      <div class="login-hero-sub">Próximos 7 días · ${fmt(today)} – ${fmt(in7)}</div>
    </div>
    <div class="wlc-kpis">
      <div class="wlc-kpi">
        <div class="wlc-kpi-val" style="color:var(--cyan)">${futuras}</div>
        <div class="wlc-kpi-lbl">Asignadas<br>próx. 7 días</div>
      </div>
      <div class="wlc-kpi">
        <div class="wlc-kpi-val" style="color:var(--green)">${completadas3d}</div>
        <div class="wlc-kpi-lbl">Completadas<br>últ. 3 días</div>
      </div>
      <div class="wlc-kpi" style="${pendientesHist>0?'border-color:rgba(251,99,126,.4);background:rgba(251,99,126,.06);':''}">
        <div class="wlc-kpi-val" style="color:${pendientesHist>0?'var(--red)':'var(--muted)'}">${pendientesHist}</div>
        <div class="wlc-kpi-lbl">Pendientes<br>históricas</div>
      </div>
    </div>
    <div class="wlc-list" style="max-height:230px;overflow-y:auto;margin:0 -4px;">${listHTML}</div>
    ${(() => {
      const msgs = _getMyReminders();
      if(!msgs.length) return '';
      return `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="font-size:.65rem;color:var(--cyan);font-weight:800;margin-bottom:6px;">💬 MENSAJES IMPORTANTES (${msgs.length})</div>
        ${msgs.map(r => {
          const daysLeft = Math.ceil((r.expiresAt - Date.now()) / 86400000);
          return `<div style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;background:rgba(32,172,244,.07);border:1px solid rgba(32,172,244,.2);border-left:3px solid var(--cyan);border-radius:var(--rsm);margin-bottom:5px;">
            <span style="font-size:.9rem;flex-shrink:0;">💬</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.73rem;line-height:1.4;">${esc(r.message)}</div>
              <div style="font-size:.61rem;color:var(--muted);margin-top:2px;">De: ${esc(r.createdBy||'Admin')} · vence en ${daysLeft} día${daysLeft!==1?'s':''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}
    `;

  foot.innerHTML = `
    ${showNotifBtn?`<button class="btn btn-ghost" style="font-size:.72rem;" onclick="_requestNotifPermission();this.remove();showToast('🔔 Notificaciones activadas')">🔔 Activar notificaciones</button>`:''}
    <button class="btn btn-add" onclick="closeUpcomingPanel()">Entrar →</button>`;

  document.getElementById('login-modal').classList.add('open');
}

function closeUpcomingPanel() {
  closeLoginModal();
}

async function _showNotif(title, body) {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: './icon.svg', badge: './icon.svg', vibrate: [200,100,200] };
  if('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if(reg) { reg.showNotification(title, opts); return; }
  }
  new Notification(title, opts);
}

function _checkNewTeamAssignments(prevTeams, nextTeams) {
  if(!currentUser) return;
  const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const linkedName = currentUser.linkedPerson || '';
  const myPerson = linkedName
    ? people.find(p => _norm(p.name) === _norm(linkedName))
    : people.find(p => _norm(p.name) === _norm(currentUser.name));
  if(!myPerson) return;

  nextTeams.forEach(nt => {
    const pt = prevTeams.find(t => t.id === nt.id);
    const prevLeaders = pt ? (pt.leaderIds || (pt.leaderId ? [pt.leaderId] : [])) : [];
    const prevMembers = pt ? (pt.memberIds || []) : [];
    const isNewLeader = (nt.leaderIds||[]).includes(myPerson.id) && !prevLeaders.includes(myPerson.id);
    const isNewMember = (nt.memberIds||[]).includes(myPerson.id) && !prevMembers.includes(myPerson.id);
    if(!isNewLeader && !isNewMember) return;
    const role = isNewLeader ? '👑 Líder' : '👥 Miembro';
    const msg  = isNewLeader
      ? `Has sido asignado/a como líder del equipo "${nt.name}"`
      : `Has sido agregado/a al equipo "${nt.name}"`;
    _showNotifWithTab('👥 Nuevo equipo — DEPCOM MCE', msg + `\n${role}`, 'teams', 'depcom-team-' + nt.id);
  });
}

async function _showNotifWithTab(title, body, tab, tag) {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: './icon.svg', badge: './icon.svg', vibrate: [200,100,200], tag, data: { tab } };
  if('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if(reg) { reg.showNotification(title, opts); return; }
  }
  new Notification(title, opts);
}

function _checkNewAssignments(newData) {
  if(!currentUser) return;
  const newIds = _getUserTaskIds(newData);
  const added = [...newIds].filter(id => !_prevUserTaskIds.has(id));
  if(added.length > 0) {
    _showNotif('📋 Nueva asignación — DEPCOM MCE',
      `Tienes ${added.length} tarea${added.length > 1 ? 's nuevas' : ' nueva'} asignada${added.length > 1 ? 's' : ''}`);
  }
  _prevUserTaskIds = newIds;
  _updateSWState();
}

/* Fusiona dos arrays por ID; gana el elemento con _savedAt más reciente */
function _mergeById(local, remote, idKey, tsKey) {
  const map = new Map();
  // Primero los locales
  local.forEach(item => map.set(item[idKey], item));
  // Luego los remotos — solo reemplazar si son más recientes
  remote.forEach(rItem => {
    const lItem = map.get(rItem[idKey]);
    if(!lItem) {
      map.set(rItem[idKey], rItem); // elemento nuevo remoto
    } else {
      const lTs = lItem[tsKey] || 0;
      const rTs = rItem[tsKey] || 0;
      if(rTs > lTs) map.set(rItem[idKey], rItem); // remoto más reciente gana
      // si local es más reciente o igual, se mantiene el local
    }
  });
  return [...map.values()];
}

function _detectTaskConflicts(localActs, remoteActs) {
  remoteActs.forEach(ra => {
    const la = localActs.find(a => a.id === ra.id);
    if(!la) return;
    // Solo comparar si la actividad local fue modificada más recientemente que la remota
    if((la._savedAt || 0) <= (ra._savedAt || 0)) return;
    (ra.tasks || []).forEach(rt => {
      const lt = (la.tasks || []).find(t => t.id === rt.id);
      if(!lt) return;
      if(lt.done !== rt.done) {
        const localBy  = lt.history?.slice(-1)[0]?.by || 'otro usuario';
        const remoteBy = rt.history?.slice(-1)[0]?.by || 'otro usuario';
        if(localBy !== remoteBy) {
          const msg = `⚠️ Conflicto: "${lt.name}" fue marcada como ${lt.done?'completada':'pendiente'} por ${localBy} y como ${rt.done?'completada':'pendiente'} por ${remoteBy} al mismo tiempo. Se mantuvo el cambio más reciente.`;
          setTimeout(() => showToast(msg), 800);
        }
      }
    });
  });
}

function _scheduleSyncToCloud() {
  _syncPending = true;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { _syncTimer = null; _syncToCloud(); }, 600);
}

async function _loadFromCloud() {
  try {
    const rows = await _supaFetch('GET', 'dashboard_state?id=eq.current&select=data,updated_at');
    if(rows && rows.length && rows[0].data) {
      const d = rows[0].data;

      // La nube es siempre fuente de verdad en la carga inicial.
      // Solo re-sincronizar local si la nube claramente no tiene datos reales.
      if(!d.initialized || (!d.activities?.length && !d.events?.length && !d.people?.length)) {
        _scheduleSyncToCloud();
        _setSyncStatus('ok');
        return true;
      }

      // La nube tiene datos reales (ya pasó el guardia de respuesta vacía) y al
      // iniciar no hay ediciones locales pendientes: se adopta tal cual, sin
      // comparar relojes (evita perder cambios por desfase de hora entre equipos).
      activities = d.activities || [];
      activities.forEach(a => { if(!a.horario && a.horarios?.length) a.horario = a.horarios[0]; });
      events     = d.events     || [];
      people     = (d.people || []).map(p => p.id ? p : { ...p, id: 'p_' + Math.random().toString(36).slice(2,9) });
      activeEventId = d.activeEventId || activeEventId || null;
      templates  = d.templates  || [];
      _checkNewTeamAssignments([...teams], d.teams || []);
      teams         = d.teams         || teams || [];
      // Usuarios: fusionar nube + locales — la nube gana en todos los campos (linkedPerson, email, etc.)
      // pero se preserva el PIN local si la nube no trae uno
      const cloudUsers = d.users || [];
      cloudUsers.forEach(cu => {
        const idx = users.findIndex(lu => lu.id === cu.id);
        if(idx === -1) {
          users.push(cu);
        } else {
          users[idx] = { ...users[idx], ...cu, pin: cu.pin || users[idx].pin };
        }
      });
      // También fusionar USERS_KEY por si acaso (solo agregar, la nube ya actualizó)
      try {
        const localUsers = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        localUsers.forEach(lu => { if(!users.find(u => u.id === lu.id)) users.push(lu); });
      } catch(e) {}
      // Si había sesión activa, re-validarla tras la carga de nube
      if(authLevel > 0 && currentUser) {
        const refreshed = users.find(u => u.id === currentUser.id);
        if(refreshed) currentUser = refreshed;
      }
      // Reminders: aceptar solo si la nube los modificó más recientemente que nosotros
      const cloudRTs = d.remindersTs || 0;
      if(cloudRTs >= _remindersTs) {
        _remindersTs = cloudRTs;
        _saveReminders((d.reminders || []).filter(r => r.expiresAt > Date.now()));
      }
      // Encabezado configurable: aplicar el de la nube si es más reciente
      if(window._applyRemoteAppHeader) _applyRemoteAppHeader(d.appHeader);
      if(window._applyRemoteMaintenance) _applyRemoteMaintenance(d.maintenance);
      if(window._applyRemoteAnnouncement) _applyRemoteAnnouncement(d.announcement);
      if(window._applyRemoteConfigLists) _applyRemoteConfigLists(d.departments, d.serviceHours);
      // Cachear localmente — NO re-subir a Supabase (es data remota)
      _applyingRemote = true;
      _lastSavedAt = Date.now();
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ activities, events, people, activeEventId, templates, users, teams, reminders: _getReminders(), initialized: true }));
      afterChange();
      _applyingRemote = false;
      _updateRemindersBadge();
      _setSyncStatus('ok');
      return true;
    }
  } catch(e) { /* sin conexión o tabla vacía — usar localStorage */ }
  return false;
}

function _initRealtime() {
  if(!window.supabase) return;
  _supaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  _supaClient
    .channel('dashboard-state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_state' }, payload => {
      if(!payload.new) return;
      // Ignorar si el cambio lo originó este mismo tab
      if(payload.new.updated_by === SESSION_ID) return;
      const d = payload.new.data;
      if(!d) return;
      // ¿Tenemos ediciones locales aún sin subir? Si no, la nube es la verdad
      // absoluta (otro dispositivo acaba de escribir) y la adoptamos tal cual,
      // sin comparar relojes (evita rechazos por desfase de hora entre equipos).
      const hadPendingEdits = _syncPending;
      // Detectar conflictos en tareas: mismo taskId, distinto estado done, modificado por personas diferentes
      _detectTaskConflicts(activities, d.activities || []);
      if(hadPendingEdits) {
        // Merge para proteger ediciones locales pendientes
        activities  = _mergeById(activities, d.activities || [], 'id', '_savedAt');
        events      = _mergeById(events,     d.events     || [], 'id', '_savedAt');
        people      = _mergeById(people,     d.people     || [], 'id', '_savedAt');
        templates   = _mergeById(templates,  d.templates  || [], 'id', '_savedAt');
      } else {
        // Sin ediciones pendientes: adoptar la nube directamente
        activities  = d.activities || [];
        events      = d.events     || [];
        people      = d.people     || [];
        templates   = d.templates  || [];
      }
      activities.forEach(a => { if(!a.horario && a.horarios?.length) a.horario = a.horarios[0]; });
      // Usuarios: actualizar existentes + agregar nuevos desde realtime
      (d.users || []).forEach(ru => {
        const idx = users.findIndex(lu => lu.id === ru.id);
        if(idx === -1) { users.push(ru); }
        else { users[idx] = { ...users[idx], ...ru, pin: ru.pin || users[idx].pin }; }
      });
      // Equipos: reemplazar completamente (propagar eliminaciones)
      _checkNewTeamAssignments([...teams], d.teams || []);
      teams = d.teams || [];
      activeEventId = activeEventId || d.activeEventId || null;
      _checkNewAssignments(d);
      // Reminders: aceptar solo si la nube los modificó más recientemente que nosotros
      const cloudRTs2 = d.remindersTs || 0;
      if(cloudRTs2 >= _remindersTs) {
        _remindersTs = cloudRTs2;
        _saveReminders((d.reminders || []).filter(r => r.expiresAt > Date.now()));
      }
      // Encabezado configurable: aplicar el de la nube si es más reciente
      if(window._applyRemoteAppHeader) _applyRemoteAppHeader(d.appHeader);
      if(window._applyRemoteMaintenance) _applyRemoteMaintenance(d.maintenance);
      if(window._applyRemoteAnnouncement) _applyRemoteAnnouncement(d.announcement);
      if(window._applyRemoteConfigLists) _applyRemoteConfigLists(d.departments, d.serviceHours);
      // Cancelar cualquier sync pendiente — si hay datos en cola aún no subidos,
      // son más viejos que lo que acaba de llegar de la nube.
      clearTimeout(_syncTimer);
      _syncTimer = null;
      _syncPending = false;
      // Guardar localmente — NO re-subir a Supabase (es data remota)
      _applyingRemote = true;
      _lastSavedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ activities, events, people, activeEventId, templates, users, teams, reminders: _getReminders(), initialized: true }));
      afterChange();
      _applyingRemote = false;
      _updateRemindersBadge();
      _notifyNewReminders();
      if(document.getElementById('reminders-modal')?.classList.contains('open')) _renderRemindersList();
      showToast('🔄 Datos actualizados en tiempo real');
    })
    .subscribe(status => {
      if(status === 'SUBSCRIBED') _setSyncStatus('ok');
    });
}

function _setSyncStatus(state) {
  const dot   = document.getElementById('net-dot');
  const label = document.getElementById('net-label');
  if(!dot || !label) return;
  if(!navigator.onLine) { dot.className='net-dot offline'; label.textContent='Sin conexión'; label.style.color='var(--red)'; return; }
  if(state === 'syncing') { dot.className='net-dot'; dot.style.background='var(--amber)'; dot.style.boxShadow='0 0 6px var(--amber)'; dot.style.animation='blink 1s ease-in-out infinite'; label.textContent='Sincronizando…'; label.style.color='var(--amber)'; }
  else if(state === 'ok')  { dot.className='net-dot online'; dot.style.background=''; dot.style.boxShadow=''; dot.style.animation=''; label.textContent='Sincronizado'; label.style.color='var(--muted)'; }
  else if(state === 'error'){ dot.className='net-dot offline'; dot.style.background=''; dot.style.boxShadow=''; dot.style.animation=''; label.textContent='Error sync'; label.style.color='var(--red)'; }
}

/* ══════════════════════════ OFFLINE INDICATOR ══════════════════════════ */
function _updateNetIndicator() {
  const dot   = document.getElementById('net-dot');
  const label = document.getElementById('net-label');
  if(!dot) return;
  const online = navigator.onLine;
  dot.className   = `net-dot ${online ? 'online' : 'offline'}`;
  label.textContent = online ? 'En línea' : 'Sin conexión';
  label.style.color = online ? 'var(--muted)' : 'var(--red)';
}
window.addEventListener('online',  _updateNetIndicator);
window.addEventListener('offline', _updateNetIndicator);

// Manejar navegación desde click en notificación del SW
if('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if(e.data?.type === 'SWITCH_TAB' && e.data.tab) {
      performSwitchTab(e.data.tab);
    }
  });
}

/* Indicador visual del badge de respaldo en el botón del header */
function _updateBackupBadge() {
  const btn = document.getElementById('btn-cloud-backup');
  if(!btn) return;
  const ts = localStorage.getItem(BACKUP_TS_KEY);
  const warn = !ts || Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) >= 7;
  const icon = warn ? '⚠️☁️' : '☁️';
  const label = ' Respaldos en la Nube';
  const titleTxt = !ts
    ? 'Sin respaldo en la nube — haz clic para crear uno'
    : warn
      ? `Último respaldo hace ${Math.floor((Date.now()-new Date(ts).getTime())/86400000)} días`
      : `Respaldos en la nube · Último: ${_backupAgeText()}`;
  btn.innerHTML = `${icon}${label}`;
  btn.title = titleTxt;
  btn.style.color = warn ? 'var(--amber)' : '';
}

function afterChange() {
    // Cada paso se ejecuta de forma aislada: si uno lanza una excepción,
    // los demás (KPIs, tarjetas, etc.) deben renderizarse igualmente.
    const _safe = (fn, label) => { try { fn(); } catch(err) { console.error('afterChange » '+label, err); } };
    _safe(renderEventTabs, 'renderEventTabs');
    _safe(renderCards, 'renderCards');
    _safe(renderPeople, 'renderPeople');
    _safe(renderEvals, 'renderEvals');
    _safe(renderCalendar, 'renderCalendar');
    _safe(renderLivePanel, 'renderLivePanel');
    _safe(renderByPerson, 'renderByPerson');
    _safe(renderTeams, 'renderTeams');
    _safe(() => { if(typeof renderAttendanceView==='function') renderAttendanceView(); }, 'renderAttendanceView');
    _safe(updateKPIs, 'updateKPIs');
    _safe(buildDynamicFilters, 'buildDynamicFilters');
    _safe(checkBirthdays, 'checkBirthdays');
    _safe(checkOverdueTasks, 'checkOverdueTasks');
    _safe(checkPostEventSummary, 'checkPostEventSummary');
    _safe(autoSave, 'autoSave');
    _safe(_checkNotifications, '_checkNotifications');
}

// Initial Call
window.addEventListener('DOMContentLoaded', async () => {
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
      // Cuando un nuevo Service Worker toma control (p.ej. tras actualizar a
      // network-first), recargar UNA vez para servir datos frescos de la nube.
      let _swReloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if(_swReloaded) return;
        _swReloaded = true;
        location.reload();
      });
    }
    // Bloquear rotación a portrait en dispositivos móviles
    try {
      if(screen.orientation?.lock) await screen.orientation.lock('portrait').catch(()=>{});
    } catch(_) {}
    // Computar hashes de PINs maestros y limpiar texto plano de memoria
    [_HASH_ADMIN, _HASH_DIR] = await Promise.all([_hashPin(_MP.a), _hashPin(_MP.d)]);
    _MP = null;

    loadData();        // carga local inmediata (sin esperar red)
    _loadAppConfig();  // aplica configuración visual guardada

    // Restaurar sesión previa (intento inicial con datos locales)
    function _restoreSession() {
      try {
        const s = JSON.parse(localStorage.getItem('elim_session') || 'null');
        if(s && s.authLevel > 0) {
          authLevel = s.authLevel;
          // Buscar usuario: primero en users, luego recargar USERS_KEY si no está
          let found = s.currentUserId ? users.find(u => u.id === s.currentUserId) : null;
          if(!found && s.currentUserId) {
            try {
              const saved = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
              found = saved.find(u => u.id === s.currentUserId) || null;
              if(found && !users.find(u => u.id === found.id)) users.push(found);
            } catch(e) {}
          }
          currentUser = found || null;
          if(!currentUser) authLevel = s.authLevel; // mantener nivel aunque no haya objeto usuario (PIN maestro)
          // Director/Admin: acceso total — restaurar edición desbloqueada tras F5
          if(authLevel >= 2) { _editUnlocked = true; document.body.classList.add('edit-unlocked'); }
        }
      } catch(e) {}
    }
    _restoreSession();
    updateAuthUI();
    try {
      const savedTab = localStorage.getItem('elim_last_tab');
      if(savedTab && authLevel >= (savedTab==='people'||savedTab==='evals'?3:savedTab==='byp'?1:0))
        performSwitchTab(savedTab);
    } catch(e) {}
    // El render inicial no debe marcar los datos como "modificados localmente"
    _applyingRemote = true;
    afterChange();
    _applyingRemote = false;

    _updateNetIndicator();
    _updateBackupBadge();
    _initRealtime();   // suscribe al canal en tiempo real

    const cloudLoaded = await _loadFromCloud(); // sobreescribe con datos de la nube si los hay
    // Re-validar sesión después de cargar la nube (los users pueden haber cambiado)
    _restoreSession();
    updateAuthUI();
    // Forzar re-render de la pestaña activa con datos de la nube
    performSwitchTab(currentTab);
    _prevUserTaskIds = _getUserTaskIds({});  // línea base tras carga inicial
    if(!cloudLoaded) {
        // Primera vez o sin datos en la nube: subir datos locales inmediatamente
        await _syncToCloud();
    }
    // Sin sesión → forzar login
    if(authLevel === 0) {
      openLoginModal();
    } else {
      showUpcomingPanel();
      _updateSWState();
      _notifyNewReminders();
      if(typeof _registerPush === 'function') _registerPush();
    }
    // Auto-refresh live panel every 60 seconds
    setInterval(() => { if(currentTab === 'live') renderLivePanel(); }, 60000);
    // Verificar si el usuario debe marcar su propia asistencia (cada 5 min)
    setTimeout(() => { if(typeof _checkSelfAttendancePrompt === 'function') _checkSelfAttendancePrompt(); }, 5000);
    setInterval(() => { if(typeof _checkSelfAttendancePrompt === 'function') _checkSelfAttendancePrompt(); }, 5 * 60 * 1000);
    // Auto-marcar como ausente a quienes no reportaron y ya terminó su servicio (cada 10 min)
    setInterval(() => { if(typeof _checkAutoAbsent === 'function') _checkAutoAbsent(); }, 10 * 60 * 1000);
    // Recordatorios de servicio: 6 AM domingo + 1 h antes de cada servicio (cada minuto)
    setTimeout(() => { if(typeof _checkServiceReminders === 'function') _checkServiceReminders(); }, 8000);
    setInterval(() => { if(typeof _checkServiceReminders === 'function') _checkServiceReminders(); }, 60 * 1000);
});