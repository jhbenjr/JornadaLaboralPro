/* ══════════════════════════ NOTIFICATIONS ══════════════════════════ */
const NOTIFS_KEY      = 'elim_notifs_seen_v1';
const NOTIFS_TEAM_KEY = 'elim_notifs_teams_seen_v1';

function _getMyAssignedTaskKeys() {
    if(!currentUser) return [];
    const name = currentUser.linkedPerson || currentUser.name;
    const keys = [];
    activities.forEach(a => {
        (a.tasks||[]).forEach(t => {
            if(t.cancelled || t.done) return; // completadas o canceladas no generan notificación
            const involved = [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean);
            if(involved.includes(name)) keys.push(a.id + '::' + t.id);
        });
    });
    return keys;
}

function _getMyTeamKeys() {
    if(!currentUser) return [];
    const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    const linked = currentUser.linkedPerson || '';
    const myPerson = linked
        ? people.find(p => _norm(p.name) === _norm(linked))
        : people.find(p => _norm(p.name) === _norm(currentUser.name));
    if(!myPerson) return [];
    const keys = [];
    teams.forEach(tm => {
        const leaderIds = tm.leaderIds || (tm.leaderId ? [tm.leaderId] : []);
        const isLeader = leaderIds.includes(myPerson.id);
        const isMember = (tm.memberIds||[]).includes(myPerson.id);
        if(isLeader) keys.push('team::leader::' + tm.id);
        else if(isMember) keys.push('team::member::' + tm.id);
    });
    return keys;
}

function _checkNotifications() {
    _updateRemindersBadge();
    if(!currentUser) { document.getElementById('notif-badge')?.classList.remove('show'); return; }
    const seenTasks = JSON.parse(localStorage.getItem(NOTIFS_KEY) || '[]');
    const unreadTasks = _getMyAssignedTaskKeys().filter(k => !seenTasks.includes(k));
    const seenTeams = JSON.parse(localStorage.getItem(NOTIFS_TEAM_KEY) || '[]');
    const unreadTeams = _getMyTeamKeys().filter(k => !seenTeams.includes(k));
    const total = unreadTasks.length + unreadTeams.length;
    const badge = document.getElementById('notif-badge');
    if(!badge) return;
    if(total > 0) {
        badge.textContent = total > 9 ? '9+' : total;
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }
}

function _renderNotifList() {
    const el = document.getElementById('notif-list');
    if(!el || !currentUser) return;
    const name = currentUser.linkedPerson || currentUser.name;

    // ── Tareas ──
    const seenTasks = JSON.parse(localStorage.getItem(NOTIFS_KEY) || '[]');
    const taskItems = [];
    activities.forEach(a => {
        const evt = events.find(e => e.id === a.eventId);
        (a.tasks||[]).forEach(t => {
            if(t.cancelled || t.done) return; // no mostrar completadas ni canceladas
            const involved = [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean);
            if(!involved.includes(name)) return;
            const key = a.id + '::' + t.id;
            const role = t.responsable === name ? 'Líder' : (t.coliders||[]).includes(name) ? 'Co-líder' : 'Apoyo';
            taskItems.push({ key, actId: a.id, taskId: t.id, taskName: t.name, actName: a.activity, evtName: evt?.name||'', date: evt?.date||a.fecha||'', role, unread: !seenTasks.includes(key) });
        });
    });
    taskItems.sort((a,b) => (b.unread?1:0)-(a.unread?1:0) || (b.date>a.date?1:-1));

    // ── Equipos ──
    const seenTeams = JSON.parse(localStorage.getItem(NOTIFS_TEAM_KEY) || '[]');
    const teamItems = [];
    _getMyTeamKeys().forEach(key => {
        const parts = key.split('::'); // ['team', 'leader'|'member', id]
        const tm = teams.find(t => t.id === parts[2]);
        if(!tm) return;
        const isLeader = parts[1] === 'leader';
        const role = isLeader ? '👑 Líder' : '👥 Miembro';
        teamItems.push({ key, teamId: tm.id, teamName: tm.name, role, unread: !seenTeams.includes(key) });
    });

    // ── Actualizar botón toggle ──
    const btnMark = document.getElementById('btn-mark-read');
    if(btnMark) {
        const allRead = taskItems.every(it => !it.unread) && teamItems.every(it => !it.unread);
        btnMark.textContent = allRead ? 'Desmarcar leídas' : 'Marcar leídas';
    }

    if(taskItems.length === 0 && teamItems.length === 0) {
        el.innerHTML = `<div class="notif-empty">Sin asignaciones activas</div>`;
        return;
    }

    const teamHTML = teamItems.map(it => `
      <div class="notif-item${it.unread?' unread':''}" onclick="_navToTeam('${it.teamId}')" style="cursor:pointer;">
        <div class="notif-item-title">👥 ${esc(it.teamName)}</div>
        <div class="notif-item-sub">${it.role}</div>
      </div>`).join('');

    el.innerHTML = teamHTML + taskItems.slice(0,10).map(it => `
      <div class="notif-item${it.unread?' unread':''}" data-act-id="${it.actId}" data-task-id="${it.taskId}" onclick="_navToTask('${it.actId}','${it.taskId}')" style="cursor:pointer;">
        <div class="notif-item-title">${esc(it.taskName)}</div>
        <div class="notif-item-sub">${esc(it.actName)}${it.evtName?' · '+esc(it.evtName):''} · ${it.role}</div>
      </div>`).join('');
}

window._navToTask = function(actId, taskId) {
    _closeAllHeaderDropdowns();
    // Marcar esta notificación de tarea como leída
    const seenTasks = JSON.parse(localStorage.getItem(NOTIFS_KEY) || '[]');
    const key = actId + '::' + taskId;
    if(!seenTasks.includes(key)) {
        seenTasks.push(key);
        localStorage.setItem(NOTIFS_KEY, JSON.stringify(seenTasks));
        _checkNotifications();
    }
    openActivityModal(actId, taskId);
};

window._navToTeam = function(teamId) {
    _closeAllHeaderDropdowns();
    performSwitchTab('teams');
    // Marcar notificación de ese equipo como leída
    const seenTeams = JSON.parse(localStorage.getItem(NOTIFS_TEAM_KEY) || '[]');
    ['leader','member'].forEach(role => {
        const key = 'team::' + role + '::' + teamId;
        if(!seenTeams.includes(key)) seenTeams.push(key);
    });
    localStorage.setItem(NOTIFS_TEAM_KEY, JSON.stringify(seenTeams));
    _checkNotifications();
};

/* Marca SIEMPRE todo como leído (idempotente — nunca desmarca).
   Usado al abrir el resumen/perfil y al ver notificaciones. */
window._markNotifsRead = function() {
    const seenTasks = JSON.parse(localStorage.getItem(NOTIFS_KEY) || '[]');
    const seenTeams = JSON.parse(localStorage.getItem(NOTIFS_TEAM_KEY) || '[]');
    localStorage.setItem(NOTIFS_KEY, JSON.stringify([...new Set([...seenTasks, ..._getMyAssignedTaskKeys()])]));
    localStorage.setItem(NOTIFS_TEAM_KEY, JSON.stringify([...new Set([...seenTeams, ..._getMyTeamKeys()])]));
    _checkNotifications();
    _renderNotifList();
};

/* Botón: alterna entre marcar todo leído / desmarcar todo. */
window._toggleNotifsRead = function() {
    const seenTasks = JSON.parse(localStorage.getItem(NOTIFS_KEY) || '[]');
    const seenTeams = JSON.parse(localStorage.getItem(NOTIFS_TEAM_KEY) || '[]');
    const currentTasks = _getMyAssignedTaskKeys();
    const currentTeams = _getMyTeamKeys();
    const allRead = currentTasks.every(k => seenTasks.includes(k)) &&
                    currentTeams.every(k => seenTeams.includes(k));
    if(allRead) {
        localStorage.setItem(NOTIFS_KEY, '[]');
        localStorage.setItem(NOTIFS_TEAM_KEY, '[]');
    } else {
        localStorage.setItem(NOTIFS_KEY, JSON.stringify([...new Set([...seenTasks, ...currentTasks])]));
        localStorage.setItem(NOTIFS_TEAM_KEY, JSON.stringify([...new Set([...seenTeams, ...currentTeams])]));
    }
    _checkNotifications();
    _renderNotifList();
};

window.toggleLockEvent = function() {
    if (authLevel < 2) {
        showToast('⚠️ Solo directores o administradores pueden desbloquear la edición');
        return;
    }
    if (_editUnlocked) {
        _editUnlocked = false;
        document.body.classList.remove('edit-unlocked');
        afterChange();
        showToast('🔒 Edición bloqueada');
    } else {
        // Acceso total: directores/admins ya autenticados desbloquean sin reingresar PIN
        _editUnlocked = true;
        document.body.classList.add('edit-unlocked');
        afterChange();
        showToast('🔓 Edición desbloqueada');
    }
}

window.closeLockOverlay = function() {
    document.getElementById('lock-overlay').classList.remove('open');
    document.getElementById('lock-pin-input').value = '';
    document.getElementById('lock-error').textContent = '';
    _updateLockDots();
}

window.verifyLockPin = async function() {
    const pin = document.getElementById('lock-pin-input').value;
    const errEl = document.getElementById('lock-error');
    const inputHash = await _hashPin(pin);
    const valid = inputHash === _HASH_ADMIN || inputHash === _HASH_DIR ||
        users.filter(u => (u.level||0) >= 2).some(u =>
            u.pin === inputHash || (u.pin.length < 64 && u.pin === pin)
        );
    if(valid) {
        _editUnlocked = true;
        document.body.classList.add('edit-unlocked');
        document.getElementById('lock-overlay').classList.remove('open');
        document.getElementById('lock-pin-input').value = '';
        errEl.textContent = '';
        _updateLockDots();
        afterChange();
        showToast('🔓 Edición desbloqueada');
    } else {
        errEl.textContent = '❌ PIN incorrecto';
        document.getElementById('lock-pin-input').value = '';
        _updateLockDots();
    }
}

/* ── Numpad genérico reutilizable ── */
window._pinPadFor = function(inputId, key) {
    const inp = document.getElementById(inputId);
    if(!inp) return;
    if(key === 'backspace') { inp.value = inp.value.slice(0,-1); }
    else if(inp.value.length < 4) { inp.value += key; }
    _refreshPinDots(inputId);
    const wrap = inp.closest('.pin-pad-wrap');
    if(wrap) { const e = wrap.querySelector('.pin-err'); if(e) e.textContent = ''; }
    // auto-enviar al completar 4 dígitos
    if(inp.value.length >= 4) {
        const fn = inp.getAttribute('data-submit-fn');
        if(fn) setTimeout(() => { try { (new Function(fn))(); } catch(ex){} }, 140);
    }
}

// Manejo de teclado físico: sanitiza, limita a 4 y auto-envía
window._pinKeyInput = function(inputId) {
    const inp = document.getElementById(inputId);
    if(!inp) return;
    inp.value = inp.value.replace(/\D/g,'').slice(0,4);
    _refreshPinDots(inputId);
    const wrap = inp.closest('.pin-pad-wrap');
    if(wrap) { const e = wrap.querySelector('.pin-err'); if(e) e.textContent = ''; }
    if(inp.value.length >= 4) {
        const fn = inp.getAttribute('data-submit-fn');
        if(fn) setTimeout(() => { try { (new Function(fn))(); } catch(ex){} }, 140);
    }
}

function _refreshPinDots(inputId) {
    const inp = document.getElementById(inputId);
    const container = document.getElementById(inputId + '-dots');
    if(!container || !inp) return;
    const val = inp.value;
    container.innerHTML = Array.from({length: 4}, (_,i) =>
        `<span${i < val.length ? ' class="filled"' : ''}></span>`
    ).join('');
}

function _pinPadHTML(inputId, submitFnStr, hint) {
    return `
    <div class="pin-pad-wrap">
      ${hint ? `<div class="lock-hint" style="margin-bottom:12px;">${hint}</div>` : ''}
      <input id="${inputId}" type="password" inputmode="numeric" maxlength="4"
        data-submit-fn="${submitFnStr}"
        style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;"
        onkeydown="if(event.key==='Enter'){(new Function(this.getAttribute('data-submit-fn')))();}else if(event.key==='Backspace'){event.preventDefault();_pinPadFor('${inputId}','backspace');}"
        oninput="_pinKeyInput('${inputId}')">
      <div class="lock-dots" id="${inputId}-dots"></div>
      <div class="lock-pad" style="max-width:220px;margin:0 auto 4px;">
        <button onclick="_pinPadFor('${inputId}','1')">1</button>
        <button onclick="_pinPadFor('${inputId}','2')">2</button>
        <button onclick="_pinPadFor('${inputId}','3')">3</button>
        <button onclick="_pinPadFor('${inputId}','4')">4</button>
        <button onclick="_pinPadFor('${inputId}','5')">5</button>
        <button onclick="_pinPadFor('${inputId}','6')">6</button>
        <button onclick="_pinPadFor('${inputId}','7')">7</button>
        <button onclick="_pinPadFor('${inputId}','8')">8</button>
        <button onclick="_pinPadFor('${inputId}','9')">9</button>
        <button onclick="_pinPadFor('${inputId}','backspace')" style="font-size:.85rem;">⌫</button>
        <button onclick="_pinPadFor('${inputId}','0')">0</button>
        <button class="lock-pad-ok" onclick="${submitFnStr}">↵</button>
      </div>
    </div>`;
}

window._lockPadPress = function(key) { _pinPadFor('lock-pin-input', key); }

function _updateLockDots() { _refreshPinDots('lock-pin-input'); }

