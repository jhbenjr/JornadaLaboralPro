/* ══════════════════════════ RECORDATORIOS PERSONALIZADOS ══════════════════════════ */
const REMINDERS_KEY = 'elim_reminders_v1';

function _getReminders() {
    try {
        const all = JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]');
        const now = Date.now();
        const live = all.filter(r => r.expiresAt > now);
        // Purga definitiva: si había expirados, reescribir el almacenamiento sin ellos
        if(live.length !== all.length) localStorage.setItem(REMINDERS_KEY, JSON.stringify(live));
        return live;
    } catch(e) { return []; }
}

function _saveReminders(arr) {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(arr));
}

window.openRemindersModal = function() {
    if(authLevel < 1) return;
    // Mostrar/ocultar sección de envío según nivel
    const sendSection = document.getElementById('reminder-send-section');
    if(sendSection) sendSection.style.display = authLevel >= 3 ? '' : 'none';
    if(authLevel >= 3) {
        const cont = document.getElementById('reminder-recipients');
        if(cont) {
            cont.innerHTML = people.filter(p => !p.archived).sort((a,b) => a.name.localeCompare(b.name))
                .map(p => {
                    const av = p.photo ? `background-image:url(${p.photo});background-size:cover;` : `background:${avc(p.name)}`;
                    return `<label style="display:flex;align-items:center;gap:7px;padding:4px 2px;cursor:pointer;font-size:.74rem;border-radius:4px;">
                        <input type="checkbox" class="reminder-rcpt" value="${esc(p.name)}" onchange="_onRecipientToggle()" style="width:14px;height:14px;accent-color:var(--cyan);flex-shrink:0;"/>
                        <span class="av-mini" style="${av};width:18px;height:18px;font-size:.5rem;flex-shrink:0;">${p.photo?'':ini(p.name)}</span>
                        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}${p.district?` <span style="font-size:.6rem;color:var(--muted);">${esc(p.district)}</span>`:''}</span>
                    </label>`;
                }).join('');
        }
        const allCk = document.getElementById('reminder-all');
        if(allCk) allCk.checked = false;
        document.getElementById('reminder-msg').value = '';
        document.getElementById('reminder-days').value = '14';
        _onRecipientToggle();
    }
    // Si NO es admin, al abrir sus mensajes se confirman como leídos
    if(authLevel < 3) _markMyRemindersRead();
    _renderRemindersList();
    document.getElementById('reminders-modal').classList.add('open');
};

function _renderRemindersList() {
    const container = document.getElementById('reminders-list');
    if(!container) return;
    const allReminders = _getReminders().filter(r => r.kind !== 'bday');
    // Admin ve todos; otros solo los propios
    const reminders = authLevel >= 3 ? allReminders : _getMyReminders();
    if(reminders.length === 0) {
        container.innerHTML = `<div style="font-size:.72rem;color:var(--muted2);font-style:italic;padding:10px 0;text-align:center;">${authLevel >= 3 ? 'Sin mensajes activos' : 'No tienes mensajes importantes'}</div>`;
        return;
    }
    container.innerHTML = reminders.map(r => {
        const p = people.find(x => x.name === r.toPersonName);
        const avStyle = p?.photo ? `background-image:url(${p.photo});background-size:cover;background-color:transparent;` : `background:${avc(r.toPersonName)};`;
        const avContent = p?.photo ? '' : ini(r.toPersonName);
        const daysLeft = Math.ceil((r.expiresAt - Date.now()) / 86400000);
        const expLabel = daysLeft <= 1 ? `<span style="color:var(--red);">Vence hoy</span>` : `<span style="color:var(--muted);">Vence en ${daysLeft} días</span>`;
        const delBtn = authLevel >= 3 ? `<button onclick="deleteReminder('${r.id}')" title="Eliminar" style="background:rgba(251,99,126,.1);border:1px solid rgba(251,99,126,.25);color:var(--red);border-radius:var(--rxs);padding:3px 7px;cursor:pointer;font-size:.7rem;flex-shrink:0;">✕</button>` : '';
        const recipientLine = authLevel >= 3 ? `<div style="font-size:.75rem;font-weight:700;color:var(--cyan);">${esc(r.toPersonName)}</div>` : '';
        // Confirmación de lectura (visible para el admin que envió)
        const readBadge = authLevel >= 3
            ? (r.readAt
                ? `<span style="color:var(--green);font-weight:700;">✓✓ Leído ${new Date(r.readAt).toLocaleDateString('es-SV',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>`
                : `<span style="color:var(--muted2);">✓ Sin leer</span>`)
            : '';
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--s1);border:1px solid var(--border);border-left:3px solid ${r.readAt?'var(--green)':'var(--cyan)'};border-radius:var(--rsm);">
            ${authLevel >= 3 ? `<span class="av-mini" style="${avStyle}flex-shrink:0;">${avContent}</span>` : '<span style="font-size:1.1rem;flex-shrink:0;margin-top:1px;">💬</span>'}
            <div style="flex:1;min-width:0;">
                ${recipientLine}
                <div style="font-size:.72rem;margin:3px 0;line-height:1.4;">${esc(r.message)}</div>
                <div style="font-size:.63rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${expLabel}<span style="color:var(--muted2);">· ${r.createdBy||'Admin'}</span>${readBadge}</div>
            </div>
            ${delBtn}
        </div>`;
    }).join('');
    // Update badge
    _updateRemindersBadge();
}

/* Marca/desmarca todos los destinatarios (difusión) */
window._toggleAllRecipients = function(checked) {
    document.querySelectorAll('.reminder-rcpt').forEach(cb => cb.checked = checked);
    _onRecipientToggle();
};

/* Actualiza el contador y el estado del check "todos" */
window._onRecipientToggle = function() {
    const all = Array.from(document.querySelectorAll('.reminder-rcpt'));
    const checked = all.filter(cb => cb.checked);
    const countEl = document.getElementById('reminder-sel-count');
    if(countEl) countEl.textContent = checked.length ? `(${checked.length} seleccionado${checked.length>1?'s':''})` : '';
    const allCk = document.getElementById('reminder-all');
    if(allCk) allCk.checked = all.length > 0 && checked.length === all.length;
};

window.sendReminder = function() {
    const recipients = Array.from(document.querySelectorAll('.reminder-rcpt:checked')).map(cb => cb.value);
    const msg = document.getElementById('reminder-msg')?.value.trim();
    const days = parseInt(document.getElementById('reminder-days')?.value) || 14;
    if(!recipients.length) { showToast('⚠️ Selecciona al menos un destinatario'); return; }
    if(!msg) { showToast('⚠️ Escribe un mensaje'); return; }
    const reminders = _getReminders();
    const now = Date.now();
    recipients.forEach((to, idx) => {
        reminders.push({
            id: 'r_' + now + '_' + idx,
            toPersonName: to,
            message: msg,
            createdAt: now,
            expiresAt: now + days * 86400000,
            createdBy: currentUser?.name || 'Admin'
        });
    });
    _saveReminders(reminders);
    _remindersTs = Date.now();
    // Notificación push (llega al teléfono aunque la app esté cerrada)
    if(typeof _sendPushToRecipients === 'function') {
        _sendPushToRecipients(recipients, '💬 Mensaje importante — DEPCOM MCE', msg);
    }
    document.querySelectorAll('.reminder-rcpt').forEach(cb => cb.checked = false);
    const allCk = document.getElementById('reminder-all');
    if(allCk) allCk.checked = false;
    document.getElementById('reminder-msg').value = '';
    document.getElementById('reminder-days').value = '14';
    _onRecipientToggle();
    _renderRemindersList();
    autoSave();
    showToast(recipients.length === 1
        ? '✅ Mensaje enviado a ' + recipients[0]
        : `✅ Mensaje enviado a ${recipients.length} personas (difusión)`);
};

window.deleteReminder = function(id) {
    const reminders = _getReminders().filter(r => r.id !== id);
    _saveReminders(reminders);
    _remindersTs = Date.now();
    _renderRemindersList();
    autoSave();
};

function _updateRemindersBadge() {
    const wrap = document.getElementById('admin-reminders-wrap');
    const badge = document.getElementById('reminders-badge');
    if(wrap) wrap.style.display = (authLevel >= 1) ? '' : 'none';
    if(badge) {
        // Para admin: total activos; para otros: solo los propios (excluye saludos de cumpleaños)
        const count = authLevel >= 3 ? _getReminders().filter(r => r.kind !== 'bday').length : _getMyReminders().length;
        if(count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = ''; }
        else { badge.style.display = 'none'; }
    }
}

// Inyectar recordatorios del usuario actual en la lista de notificaciones
function _getMyReminders() {
    if(!currentUser) return [];
    const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    const myName = _norm(currentUser.linkedPerson || currentUser.name);
    return _getReminders().filter(r => r.kind !== 'bday' && _norm(r.toPersonName) === myName);
}

// Marca como LEÍDOS los mensajes del usuario actual (confirmación de lectura).
// Se persiste y sincroniza para que el admin que envió vea el ✓✓.
function _markMyRemindersRead(ids) {
    if(!currentUser) return;
    const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    const myName = _norm(currentUser.linkedPerson || currentUser.name);
    const all = _getReminders();
    let changed = false;
    all.forEach(r => {
        if(ids && !ids.includes(r.id)) return;
        if(_norm(r.toPersonName) === myName && !r.readAt) { r.readAt = Date.now(); changed = true; }
    });
    if(changed) {
        _saveReminders(all);
        _remindersTs = Date.now();
        if(typeof autoSave === 'function') autoSave();
    }
}

// Muestra el dot, un popup en pantalla (si está activo) y una notificación push
// (aunque la app esté en segundo plano) cuando llegan mensajes nuevos sin leer.
function _notifyNewReminders() {
    _updateRemindersBadge();
    if(!currentUser) return;
    const mine = _getMyReminders();
    if(!mine.length) return;
    const seenKey = 'elim_reminders_seen_' + currentUser.id;
    const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'));
    const unseen = mine.filter(r => !seen.has(r.id));
    if(!unseen.length) return;

    // 1) Notificación push por cada mensaje nuevo (visible aunque esté en segundo plano)
    unseen.forEach(r => {
        if(typeof _showNotif === 'function') {
            _showNotif('💬 Mensaje importante — DEPCOM MCE', `${r.message}\n— ${r.createdBy || 'Admin'}`);
        }
    });

    // 2) Popup en pantalla si la persona está activa en la web
    setTimeout(() => _showReminderPopup(unseen), 700);

    // Confirmación de lectura: el destinatario vio el mensaje → marcar leído (sincroniza al admin)
    _markMyRemindersRead(unseen.map(r => r.id));

    // Marcar como vistos
    mine.forEach(r => seen.add(r.id));
    localStorage.setItem(seenKey, JSON.stringify([...seen]));
}

// Ventana emergente con el/los mensaje(s) importante(s)
function _showReminderPopup(reminders) {
    if(!reminders || !reminders.length || typeof customAlert !== 'function') return;
    const items = reminders.map(r => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:rgba(32,172,244,.07);border:1px solid rgba(32,172,244,.22);border-left:3px solid var(--cyan);border-radius:var(--rsm);margin-bottom:8px;">
          <span style="font-size:1.1rem;flex-shrink:0;">💬</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:.8rem;line-height:1.45;">${esc(r.message)}</div>
            <div style="font-size:.62rem;color:var(--muted);margin-top:3px;">De: ${esc(r.createdBy || 'Admin')}</div>
          </div>
        </div>`).join('');
    const title = reminders.length > 1 ? `${reminders.length} mensajes importantes` : 'Mensaje importante';
    customAlert(`<div style="text-align:left;min-width:260px;max-width:340px;">
        <div style="font-family:'Nunito',sans-serif;font-weight:800;font-size:.95rem;margin-bottom:10px;color:var(--cyan);">💬 ${title}</div>
        ${items}
    </div>`);
}

/* ══════════════════════════ CUMPLEAÑOS — SALUDOS ══════════════════════════
   Los saludos se guardan en el array `reminders` con kind:'bday' (ya sincronizado).
   Se excluyen del flujo normal de mensajes. */
const _bdayNorm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();

function _myIdentityName() {
    if(!currentUser) return '';
    return currentUser.linkedPerson || currentUser.name;
}

// Saludos recibidos por el usuario actual este año
function _getMyBdayGreetings() {
    const me = _bdayNorm(_myIdentityName());
    if(!me) return [];
    const year = new Date().getFullYear();
    return _getReminders()
        .filter(r => r.kind === 'bday' && _bdayNorm(r.toPersonName) === me && r.year === year)
        .sort((a,b) => b.createdAt - a.createdAt);
}

// ¿El usuario actual ya saludó a esta persona este año?
function _hasSentBday(toName) {
    const from = _bdayNorm(_myIdentityName());
    const to   = _bdayNorm(toName);
    const year = new Date().getFullYear();
    return _getReminders().some(r => r.kind === 'bday' && r.year === year &&
        _bdayNorm(r.toPersonName) === to && _bdayNorm(r.fromName) === from);
}

window.sendBirthdayGreeting = function(toName) {
    if(!currentUser) { showToast('⚠️ Inicia sesión para enviar saludos'); return; }
    const from = _myIdentityName();
    if(_bdayNorm(from) === _bdayNorm(toName)) { showToast('🎂 ¡Feliz cumpleaños a ti! No puedes saludarte a ti mismo 😊'); return; }
    if(_hasSentBday(toName)) { showToast('Ya enviaste tu saludo a esta persona 🎉'); return; }

    const now = Date.now();
    const reminders = _getReminders();
    reminders.push({
        id: 'bday_' + now + '_' + Math.random().toString(36).slice(2,6),
        kind: 'bday',
        toPersonName: toName,
        fromName: from,
        createdBy: currentUser.name || from,
        message: `🎉🎂 ¡Feliz cumpleaños, ${toName}! 🥳🎈🎁✨🙌`,
        createdAt: now,
        year: new Date().getFullYear(),
        expiresAt: now + 7 * 86400000   // los saludos viven solo 7 días y luego se borran
    });
    _saveReminders(reminders);
    _remindersTs = Date.now();
    // Notificar a la persona (push aunque la app esté cerrada)
    if(typeof _sendPushToRecipients === 'function') {
        _sendPushToRecipients([toName], '🎂 ¡Te desearon feliz cumpleaños!', `${from} te envió un saludo de cumpleaños 🎉`);
    }
    autoSave();
    showToast(`🎉 Saludo enviado a ${toName}`);
    _renderBdayModal();
};

window.openBirthdayList = function() {
    _renderBdayModal();
    document.getElementById('bday-modal').classList.add('open');
};

function _renderBdayModal() {
    const body = document.getElementById('bday-modal-body');
    if(!body) return;
    const celebrants = (typeof _bdayCelebrants !== 'undefined' ? _bdayCelebrants : []);
    const meName = _bdayNorm(_myIdentityName());

    // 1) Bandeja de saludos recibidos (si es su cumpleaños / los recibió)
    const myGreetings = _getMyBdayGreetings();
    let trayHtml = '';
    if(myGreetings.length) {
        trayHtml = `
            <div style="background:linear-gradient(135deg,rgba(255,198,0,.1),rgba(251,99,126,.08));
                border:1px solid rgba(255,198,0,.3);border-radius:var(--rsm);padding:12px 14px;margin-bottom:6px;">
                <div style="font-size:.74rem;font-weight:800;color:var(--amber);margin-bottom:8px;">🎁 Tus saludos (${myGreetings.length})</div>
                ${myGreetings.map(g => {
                    const fn = g.fromName || g.createdBy || 'Alguien';
                    const fp = people.find(x => x.name === fn);
                    const fAv = fp?.photo ? `background-image:url(${fp.photo});background-size:cover;background-position:center;` : `background:${avc(fn)};`;
                    return `<div style="display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:1px solid rgba(255,198,0,.15);">
                        <span style="${fAv}flex-shrink:0;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;color:#fff;overflow:hidden;">${fp?.photo?'':ini(fn)}</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:.72rem;font-weight:700;color:var(--white);">${esc(fn)}</div>
                            <div style="font-size:.68rem;color:var(--muted);margin-top:1px;line-height:1.4;">${esc(g.message)}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // 2) Listado de cumpleañeros con botón Felicitar
    let listHtml = '';
    if(!celebrants.length) {
        listHtml = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.78rem;">No hay cumpleañeros por ahora 🎈</div>`;
    } else {
        listHtml = `<div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:4px 0 4px;">🎂 Cumpleañeros</div>`
            + celebrants.map(c => {
                const isMe = _bdayNorm(c.name) === meName;
                const label = c.daysAhead === 0 ? '🎂 ¡Hoy!' : c.past
                    ? `hace ${Math.abs(c.daysAhead)} día${Math.abs(c.daysAhead)>1?'s':''}`
                    : `en ${c.daysAhead} día${c.daysAhead>1?'s':''}`;
                const avStyle = c.photo ? `background-image:url(${c.photo});background-size:cover;background-color:transparent;` : `background:${avc(c.name)};`;
                const avContent = c.photo ? '' : ini(c.name);
                const sent = !isMe && _hasSentBday(c.name);
                const btn = isMe
                    ? `<span style="font-size:.62rem;color:var(--amber);font-weight:700;flex-shrink:0;">¡Es tu cumple! 🎉</span>`
                    : (sent
                        ? `<span style="font-size:.62rem;color:var(--green);font-weight:700;flex-shrink:0;">✓ Enviado</span>`
                        : `<button onclick="sendBirthdayGreeting('${c.name.replace(/'/g,"\\'")}')" style="font-size:.64rem;padding:4px 11px;border-radius:20px;background:rgba(255,198,0,.14);color:var(--amber);border:1px solid rgba(255,198,0,.4);cursor:pointer;font-weight:700;white-space:nowrap;flex-shrink:0;">🎉 Felicitar</button>`);
                const hat = c.daysAhead === 0
                    ? `<span style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);font-size:1.05rem;line-height:1;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));">🎂</span>` : '';
                return `<div style="display:flex;align-items:center;gap:11px;padding:9px 12px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rsm);${c.daysAhead===0?'border-left:3px solid var(--amber);':''}">
                    <span style="position:relative;display:inline-flex;flex-shrink:0;">
                        <span style="${avStyle}width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.95rem;font-weight:800;color:#fff;overflow:hidden;background-size:cover;background-position:center;">${avContent}</span>
                        ${hat}
                    </span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.82rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.name)}</div>
                        <div style="font-size:.64rem;color:var(--muted);">${label}</div>
                    </div>
                    ${btn}
                </div>`;
            }).join('');
    }

    body.innerHTML = trayHtml + listHtml;
}
