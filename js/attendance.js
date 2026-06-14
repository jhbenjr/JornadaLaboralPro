/* ══════════════════════════ ASISTENCIA POR DÍA ══════════════════════════ */

const ATT_CATEGORY_ORDER = [
    'Coordinador General',
    'Director Operativo',
    'Enlace',
    'Servidor',
    'Colaborador',
    'Otro'
];

function _parseServiceTime(str) {
    if(!str || str === 'Extemporáneo') return null;
    const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if(!m) return null;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const pm = m[3].toUpperCase() === 'PM';
    if(pm && h !== 12) h += 12;
    if(!pm && h === 12) h = 0;
    return h * 60 + min;
}

function _getPersonCategory(name) {
    const p = people.find(x => x.name === name);
    if(!p) return 'Otro';
    const roles = (p.cargos || []).map(c => c.role || '');
    if(roles.some(r => r === 'Director Operativo' || r === 'Directora Operativa')) return 'Director Operativo';
    if(roles.some(r => r === 'Enlace')) return 'Enlace';
    if(roles.some(r => r === 'Coordinador General' || r === 'Coordinadora General' || r === 'Asistente de Coordinación')) return 'Coordinador General';
    if(p.type === 'Colaborador' || p.type === 'Colaboradora') return 'Colaborador';
    return 'Servidor';
}

function _getPersonSchedules(name) {
    const p = people.find(x => x.name === name);
    return (p?.schedules || []).filter(s => s !== 'Extemporáneo');
}

/* Identidad del usuario actual para asistencia.
   Igual que el perfil: usa linkedPerson y si no, cae al nombre del usuario,
   resolviéndolo contra el directorio (sin tildes / mayúsculas) para devolver el
   nombre EXACTO de la persona. Así un nivel 1 vinculado por nombre también funciona. */
function _myAttName() {
    if(!currentUser) return null;
    const candidate = currentUser.linkedPerson || currentUser.name;
    if(!candidate) return null;
    const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    const p = people.find(x => _norm(x.name) === _norm(candidate));
    return p ? p.name : candidate;
}

/* ── KPIs de asistencia del año para una persona ── */
function _getAttendanceKPIs(name) {
    const yearStr = new Date().getFullYear().toString();
    let total = 0, present = 0, permission = 0, absent = 0, autoAbsent = 0, unregistered = 0;
    const evActs = activities; // cache

    events.forEach(ev => {
        if(!ev.date || !ev.date.startsWith(yearStr)) return;
        const assigned = evActs.filter(a => a.eventId === ev.id).some(a =>
            a.responsable === name ||
            (a.tasks||[]).some(t =>
                t.responsable === name ||
                (t.coliders||[]).includes(name) ||
                (t.assignedPeople||[]).includes(name)
            )
        );
        if(!assigned) return;
        total++;
        const rec = ev.attendance?.[name];
        if(!rec?.status)                 unregistered++;
        else if(rec.status === 'present') present++;
        else if(rec.status === 'permission') permission++;
        else if(rec.autoAbsent)           autoAbsent++;
        else                              absent++;
    });
    const pct = n => total ? Math.round(n / total * 100) : 0;
    return { total, present, permission, absent, autoAbsent, unregistered, pct };
}

/* ══ Vista personal (nivel 1) ══ */
function _renderPersonalView(ev) {
    const body = document.getElementById('attendance-body');
    if(!body) return;

    const myName = _myAttName();
    if(!myName) {
        body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:.78rem;">Tu usuario no tiene una persona vinculada. Pídele a un administrador que lo configure.</div>`;
        return;
    }

    const att     = ev.attendance?.[myName] || {};
    const today   = _svDateStr();
    const isToday = ev.date === today;
    const now     = new Date();
    const nowMin  = now.getHours() * 60 + now.getMinutes();

    const myScheds = _getPersonSchedules(myName);
    const times    = myScheds.map(_parseServiceTime).filter(t => t !== null).sort((a,b) => a-b);
    const firstSvc = times[0] ?? null;
    // Ventana de confirmación propia: desde 15 min después del inicio hasta 2 h después
    const canConfirmNow = isToday && firstSvc !== null && nowMin >= firstSvc + 15 && nowMin <= firstSvc + 120;

    const diffDays = ev.date
        ? Math.round((new Date(ev.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
        : -1;
    const canRequestAdvance = diffDays > 0 && diffDays <= 4;

    const statusInfo = {
        present:    { icon:'✅', label:'Presente',      color:'var(--green)' },
        permission: { icon:'📋', label:'Con permiso',   color:'var(--amber)' },
        absent:     { icon:'❌', label:'Ausente',        color:'var(--red)'   }
    }[att.status] || { icon:'⭕', label:'Sin registrar', color:'var(--muted)' };

    const statusCard = `
        <div style="background:var(--s2);border:1px solid var(--border);border-radius:var(--rsm);padding:14px 16px;margin-bottom:14px;">
            <div style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px;">Mi asistencia — ${esc(ev.name)}</div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:1.6rem;">${statusInfo.icon}</span>
                <div>
                    <div style="font-size:.9rem;font-weight:800;color:${statusInfo.color};">${statusInfo.label}</div>
                    ${att.service ? `<div style="font-size:.65rem;color:var(--muted);margin-top:2px;">🕒 ${esc(att.service)}</div>` : ''}
                    ${att.confirmed ? `<div style="font-size:.6rem;color:var(--green);margin-top:2px;">✓ Confirmado por director</div>` : (att.selfReported ? `<div style="font-size:.6rem;color:var(--amber);margin-top:2px;">En revisión</div>` : '')}
                </div>
            </div>
            ${att.note ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(255,198,0,.07);border:1px solid rgba(255,198,0,.2);border-radius:var(--rxs);font-size:.68rem;color:var(--muted);line-height:1.5;"><strong style="color:var(--amber);">Motivo:</strong> ${esc(att.note)}</div>` : ''}
        </div>`;

    // Botones de acción según el momento
    let actionBtns = '';
    if(!att.status || att.autoAbsent) {
        if(canConfirmNow) {
            actionBtns += `<button onclick="openSelfAttendanceForEvent('${ev.id}')" class="btn btn-add" style="width:100%;justify-content:center;margin-bottom:7px;">✅ Confirmar mi asistencia de hoy</button>`;
        }
        if(canRequestAdvance || (diffDays === 0 && !canConfirmNow && nowMin < (firstSvc ?? 999))) {
            actionBtns += `<button onclick="openSelfAttendanceForEvent('${ev.id}')" class="btn btn-ghost" style="width:100%;justify-content:center;color:var(--amber);border-color:var(--amber);">📋 Solicitar permiso</button>`;
        }
    } else if(!att.confirmed && att.selfReported && (att.status === 'permission' || att.status === 'absent')) {
        actionBtns += `<button onclick="openSelfAttendanceForEvent('${ev.id}')" class="btn btn-ghost" style="width:100%;justify-content:center;font-size:.74rem;">✏️ Editar mi solicitud</button>`;
    }

    // KPIs del año
    const k = _getAttendanceKPIs(myName);
    const barW = n => k.total ? Math.round(n / k.total * 100) : 0;

    const kpiSection = k.total === 0 ? '' : `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:12px;">📊 Mi asistencia este año (${k.total} eventos)</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${[
                    { label:'✅ Presente',     val:k.present,    color:'var(--green)' },
                    { label:'📋 Con permiso',  val:k.permission, color:'var(--amber)' },
                    { label:'❌ Ausente',       val:k.absent + k.autoAbsent, color:'var(--red)' },
                    { label:'⭕ Sin registrar', val:k.unregistered, color:'var(--muted)' }
                ].filter(r => r.val > 0).map(r => `
                    <div>
                        <div style="display:flex;justify-content:space-between;font-size:.68rem;margin-bottom:3px;">
                            <span style="color:${r.color};font-weight:700;">${r.label}</span>
                            <span style="color:var(--muted);">${r.val} (${k.pct(r.val)}%)</span>
                        </div>
                        <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${barW(r.val)}%;background:${r.color};border-radius:3px;transition:width .5s;"></div>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;

    body.innerHTML = statusCard + (actionBtns ? `<div style="display:flex;flex-direction:column;gap:0;">${actionBtns}</div>` : '') + kpiSection;
}

/* ══ Modal principal ══ */
window.openAttendanceModal = function(eventId) {
    if(authLevel < 1) return;
    const ev = events.find(x => x.id === eventId);
    if(!ev) return;

    const modal = document.getElementById('attendance-modal');
    const body  = document.getElementById('attendance-body');
    if(!modal || !body) return;

    if(!ev.attendance) ev.attendance = {};

    const titleEl = document.getElementById('attendance-title');
    if(titleEl) titleEl.textContent = `Asistencia — ${ev.name}`;

    if(authLevel < 2) {
        // Vista personal para nivel 1
        _renderPersonalView(ev);
    } else {
        // Vista admin para niveles 2 y 3
        const acts = activities.filter(a => a.eventId === eventId);
        const personSet = new Set();
        acts.forEach(a => {
            if(a.responsable) personSet.add(a.responsable);
            (a.tasks||[]).forEach(t => {
                if(t.responsable) personSet.add(t.responsable);
                (t.coliders||[]).forEach(c => { if(c) personSet.add(c); });
                (t.assignedPeople||[]).forEach(p => { if(p) personSet.add(p); });
            });
        });
        const persons = [...personSet].filter(Boolean).sort();
        if(!persons.length) {
            body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);">No hay personas asignadas en este evento.</div>`;
            modal.classList.add('open');
            return;
        }
        _renderAttendanceBody(ev, persons, acts);
    }
    modal.classList.add('open');
};

/* ══ Vista admin (nivel 2+) ══ */
function _renderAttendanceBody(ev, persons, acts) {
    const body = document.getElementById('attendance-body');
    if(!body) return;
    const att  = ev.attendance || {};
    const evId = ev.id;

    // Irregulares solo visibles para nivel 3
    const visible = persons.filter(name => !(att[name]?.irregular && authLevel < 3));

    const pending   = visible.filter(n => att[n]?.selfReported && !att[n]?.confirmed);
    const confirmed = visible.filter(n => !att[n]?.selfReported || att[n]?.confirmed);

    const byCategory = {};
    ATT_CATEGORY_ORDER.forEach(cat => { byCategory[cat] = []; });
    confirmed.forEach(name => byCategory[_getPersonCategory(name)].push(name));

    const statusBtn = (name, status, label, color) => {
        const active   = (att[name]?.status || '') === status;
        const locked   = _requiresAdminOverride(evId, name) && authLevel < 3;
        const ns = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `<button onclick="_setAttendance('${evId}','${ns}','${status}')"
            title="${locked ? 'Solo un admin puede modificar esto' : ''}"
            style="padding:3px 9px;font-size:.62rem;font-weight:700;border-radius:20px;cursor:${locked?'not-allowed':'pointer'};transition:all .15s;opacity:${locked&&!active?.4:1};
            ${active ? `background:var(--${color});color:#fff;border:1px solid var(--${color});`
                     : `background:var(--s3);color:var(--muted);border:1px solid var(--border);`}">
            ${label}${locked?' 🔒':''}
        </button>`;
    };

    const renderRow = (name, highlight) => {
        const rec  = att[name] || {};
        const isAbsent = rec.status === 'absent';
        const isPerm   = rec.status === 'permission';
        const ns = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        const irregularBadge = rec.irregular && authLevel >= 3
            ? `<span style="font-size:.56rem;padding:1px 6px;border-radius:20px;background:rgba(32,172,244,.12);color:var(--cyan);border:1px solid rgba(32,172,244,.25);font-weight:700;">⚠️ Serv. irregular</span>` : '';
        const selfBadge = rec.selfReported && !rec.confirmed
            ? `<span style="font-size:.56rem;padding:1px 6px;border-radius:20px;background:rgba(255,198,0,.15);color:var(--amber);border:1px solid rgba(255,198,0,.3);font-weight:700;">Auto-reportado</span>` : '';
        const confBadge = rec.confirmed
            ? `<span style="font-size:.56rem;padding:1px 6px;border-radius:20px;background:rgba(38,208,124,.12);color:var(--green);border:1px solid rgba(38,208,124,.25);font-weight:700;">✓ Confirmado</span>` : '';
        const autoBadge = rec.autoAbsent
            ? `<span style="font-size:.56rem;padding:1px 6px;border-radius:20px;background:rgba(251,99,126,.1);color:var(--red);border:1px solid rgba(251,99,126,.25);font-weight:700;">Auto</span>` : '';
        const serviceBadge = rec.service
            ? `<span style="font-size:.56rem;padding:1px 6px;border-radius:20px;background:var(--s3);color:var(--muted);border:1px solid var(--border);">🕒 ${esc(rec.service)}</span>` : '';

        const badges = [irregularBadge, selfBadge, confBadge, autoBadge, serviceBadge].filter(Boolean).join('');
        const canConfirmThis = _canConfirmAttendance(name) && rec.selfReported && !rec.confirmed && rec.status !== 'permission';
        const confirmBtn = canConfirmThis
            ? `<button onclick="_confirmAttendance('${evId}','${ns}')" style="font-size:.6rem;padding:2px 8px;border-radius:20px;background:rgba(38,208,124,.12);color:var(--green);border:1px solid rgba(38,208,124,.3);cursor:pointer;font-weight:700;white-space:nowrap;flex-shrink:0;">✓ Confirmar</button>` : '';
        const viewPermBtn = (rec.status === 'permission' && !rec.confirmed && authLevel >= 3)
            ? `<button onclick="_viewPermission('${evId}','${ns}')" style="font-size:.6rem;padding:2px 8px;border-radius:20px;background:rgba(255,198,0,.12);color:var(--amber);border:1px solid rgba(255,198,0,.3);cursor:pointer;font-weight:700;white-space:nowrap;flex-shrink:0;">📋 Ver permiso</button>` : '';
        const noteHtml = (isPerm || isAbsent) && rec.note
            ? `<div style="margin-top:7px;padding:5px 9px;background:rgba(255,198,0,.06);border:1px solid rgba(255,198,0,.2);border-radius:var(--rxs);font-size:.67rem;color:var(--muted);line-height:1.45;"><strong style="color:var(--amber);">Motivo:</strong> ${esc(rec.note)}</div>` : '';

        const absentTasks = isAbsent ? _getPersonTasks(name, acts) : [];
        const replaceRows = absentTasks.length
            ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">
                <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:5px;">Tareas — reasignar:</div>
                ${absentTasks.map(t => {
                    const tName = (t.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rxs);margin-bottom:4px;">
                        <span style="flex:1;font-size:.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tName}</span>
                        <select onchange="_replacePersonInTask('${evId}','${t.actId}','${t.id}','${ns}',this.value)"
                            style="font-size:.63rem;padding:3px 5px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rxs);color:var(--white);max-width:120px;">
                            <option value="">— Reasignar —</option>
                            ${people.filter(p => p.name !== name && !p.archived).map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}
                        </select>
                    </div>`;
                }).join('')}
            </div>` : '';

        return `<div style="background:var(--s2);border:1px solid ${highlight?'rgba(255,198,0,.4)':'var(--border)'};border-radius:var(--rsm);padding:10px 12px;margin-bottom:7px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="flex:1;font-size:.77rem;font-weight:700;">${esc(name)}</span>
                ${confirmBtn}${viewPermBtn}
                <div style="display:flex;gap:3px;flex-shrink:0;">
                    ${statusBtn(name,'present','✅','green')}
                    ${statusBtn(name,'permission','📋','amber')}
                    ${statusBtn(name,'absent','❌','red')}
                </div>
            </div>
            ${badges ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">${badges}</div>` : ''}
            ${noteHtml}${replaceRows}
        </div>`;
    };

    let html = '';

    if(pending.length) {
        html += `<div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--amber);margin-bottom:8px;">⏳ Pendientes de confirmar (${pending.length})</div>`;
        html += pending.map(n => renderRow(n, true)).join('');
        html += `<div style="border-top:1px solid var(--border);margin:12px 0 10px;"></div>`;
    }

    let hasAny = false;
    ATT_CATEGORY_ORDER.forEach(cat => {
        const group = byCategory[cat] || [];
        if(!group.length) return;
        hasAny = true;
        html += `<div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:${html?'12px':'0'} 0 7px;">${_catIcon(cat)} ${cat === 'Coordinador General' ? 'Coordinadores' : cat + 's'}</div>`;
        html += group.map(n => renderRow(n, false)).join('');
    });

    if(!pending.length && !hasAny)
        html = `<div style="text-align:center;padding:30px;color:var(--muted);">Sin registros de asistencia aún.</div>`;

    body.innerHTML = html;
}

function _catIcon(cat) {
    return { 'Coordinador General':'🎯','Director Operativo':'👑','Enlace':'🔗','Servidor':'✝️','Colaborador':'🤝','Otro':'👤' }[cat]||'👤';
}

function _getPersonTasks(name, acts) {
    const result = [];
    acts.forEach(a => {
        (a.tasks||[]).filter(t => !t.cancelled && (
            t.responsable === name ||
            (t.coliders||[]).includes(name) ||
            (t.assignedPeople||[]).includes(name)
        )).forEach(t => result.push({ actId:a.id, id:t.id, name:t.name||'(sin nombre)' }));
    });
    return result;
}

/* ── Verificar si se requiere admin para cambiar asistencia ──
   Casos: evento ya pasó  O  el registro fue auto-marcado (horario terminado).
   En esos casos solo nivel 3 puede modificar (emergencia / olvido). */
function _requiresAdminOverride(eventId, name) {
    const ev = events.find(x => x.id === eventId);
    if(!ev) return false;
    const today = _svDateStr();
    if(ev.date < today) return true;                          // evento pasado
    if(ev.attendance?.[name]?.autoAbsent) return true;       // ya auto-marcado
    return false;
}

/* ── Acciones ── */
/* Las acciones (marcar / confirmar / aprobar) solo se permiten el MISMO día de la
   asignación (no antes). Eventos pasados los gobierna _requiresAdminOverride. */
function _attDayReached(eventId) {
    const ev = events.find(x => x.id === eventId);
    if(!ev) return false;
    const today = _svDateStr();
    return ev.date <= today;
}

window._setAttendance = function(eventId, name, status) {
    // La ausencia NO se marca manualmente: se confirma sola tras 1.5 h del último servicio
    if(status === 'absent') {
        showToast('⚠️ La ausencia se marca automáticamente, no manualmente');
        return;
    }
    if(!_attDayReached(eventId)) {
        showToast('⚠️ Solo puedes marcar asistencia el mismo día de la asignación');
        return;
    }
    if(_requiresAdminOverride(eventId, name) && authLevel < 3) {
        showToast('⚠️ Solo un administrador puede modificar esta asistencia fuera del horario');
        return;
    }
    if(status === 'permission') {
        _promptAttNote(eventId, name, status);
        return;
    }
    _applyAttendance(eventId, name, status, '', '', false, true);
};

function _promptAttNote(eventId, name, status) {
    if(_requiresAdminOverride(eventId, name) && authLevel < 3) {
        showToast('⚠️ Solo un administrador puede modificar esta asistencia fuera del horario');
        return;
    }
    const label = status === 'permission' ? 'Motivo del permiso' : 'Motivo de la ausencia';
    const icon  = status === 'permission' ? '📋' : '❌';
    const rec   = events.find(x => x.id === eventId)?.attendance?.[name] || {};
    customPrompt(`${icon} ${esc(label)} para <b>${esc(name)}</b><br><span style="font-size:.7rem;color:var(--muted);">Requerido</span>`,
        rec.note || '',
        (note) => {
            if(!note?.trim()) { showToast('⚠️ El motivo es requerido'); return; }
            _applyAttendance(eventId, name, status, note.trim(), rec.service||'', rec.irregular||false, true);
        }
    );
}

function _applyAttendance(eventId, name, status, note, service, irregular, confirmed) {
    const ev = events.find(x => x.id === eventId);
    if(!ev) return;
    if(!ev.attendance) ev.attendance = {};
    ev.attendance[name] = { status, note:note||'', service:service||'', irregular:!!irregular, confirmed:!!confirmed, ts:Date.now() };
    afterChange();
    if(authLevel >= 2) _refreshAttendanceModal(ev);
    else _renderPersonalView(ev);
}

window.quickMarkAttendance = function(eventId, name) {
    if(authLevel < 2) return;
    if(!_attDayReached(eventId)) { showToast('⚠️ Solo puedes marcar asistencia el mismo día del evento'); return; }
    const ev = events.find(x => x.id === eventId);
    if(!ev) return;
    if(!ev.attendance) ev.attendance = {};
    const cur = ev.attendance[name]?.status || '';
    // Ciclo: sin marcar → presente → ausente → sin marcar
    const next = cur === '' ? 'present' : cur === 'present' ? 'absent' : '';
    if(next === '') {
        delete ev.attendance[name];
    } else {
        ev.attendance[name] = { status: next, note: '', service: '', irregular: false, confirmed: authLevel >= 3, ts: Date.now() };
    }
    autoSave();
    renderCards();
    const label = next === 'present' ? '✅ Presente' : next === 'absent' ? '❌ Ausente' : '⬜ Sin marcar';
    showToast(`${label} — ${name}`);
};

window._confirmAttendance = function(eventId, name) {
    const ev = events.find(x => x.id === eventId);
    if(!ev?.attendance?.[name]) return;
    const rec = ev.attendance[name];

    if(!_attDayReached(eventId)) {
        showToast('⚠️ Solo el mismo día de la asignación se puede confirmar o aprobar');
        return;
    }
    if(rec.status === 'permission') {
        if(authLevel < 3) { showToast('⚠️ Solo un administrador puede aprobar permisos'); return; }
    } else {
        if(!_canConfirmAttendance(name)) {
            showToast('⚠️ Solo puedes confirmar la asistencia de miembros de tu equipo');
            return;
        }
    }
    if(_requiresAdminOverride(eventId, name) && authLevel < 3) {
        showToast('⚠️ Solo un administrador puede confirmar esta asistencia fuera del horario');
        return;
    }
    if((rec.status === 'permission' || rec.status === 'absent') && !rec.note) {
        _promptAttNote(eventId, name, rec.status);
        return;
    }
    rec.confirmed = true;
    afterChange();
    showToast(`✅ ${rec.status === 'permission' ? 'Permiso de' : 'Asistencia de'} ${name} confirmado`);
};

function _refreshAttendanceModal(ev) {
    const acts = activities.filter(a => a.eventId === ev.id);
    const personSet = new Set();
    acts.forEach(a => {
        if(a.responsable) personSet.add(a.responsable);
        (a.tasks||[]).forEach(t => {
            if(t.responsable) personSet.add(t.responsable);
            (t.coliders||[]).forEach(c => { if(c) personSet.add(c); });
            (t.assignedPeople||[]).forEach(p => { if(p) personSet.add(p); });
        });
    });
    _renderAttendanceBody(ev, [...personSet].filter(Boolean).sort(), acts);
}

window._replacePersonInTask = function(eventId, actId, taskId, oldName, newName) {
    if(!newName) return;
    const a = activities.find(x => x.id === actId);
    if(!a) return;
    const t = (a.tasks||[]).find(x => x.id === taskId);
    if(!t) return;
    if(t.responsable === oldName) t.responsable = newName;
    t.coliders = (t.coliders||[]).map(c => c === oldName ? newName : c);
    t.assignedPeople = (t.assignedPeople||[]).map(p => p === oldName ? newName : p);
    a._savedAt = Date.now();
    afterChange();
    showToast(`✅ ${newName} reemplaza a ${oldName}`);
    const ev = events.find(x => x.id === eventId);
    if(ev) _refreshAttendanceModal(ev);
};

/* ── Helper para abrir el popup de auto-asistencia para un evento específico ── */
window.openSelfAttendanceForEvent = function(eventId) {
    const ev = events.find(x => x.id === eventId);
    if(!ev) return;
    const today  = _svDateStr();
    const diffDays = ev.date
        ? Math.round((new Date(ev.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
        : -1;
    const mode = diffDays === 0 ? 'day-of' : 'advance';
    _showSelfAttendancePopup(ev, mode);
};

/* ── Helper de prompt ── */
function customPrompt(labelHtml, defaultVal, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay open';
    overlay.style.zIndex = '900';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;">
        <div class="modal-body" style="padding:20px;">
          <div style="font-size:.8rem;line-height:1.5;margin-bottom:12px;">${labelHtml}</div>
          <textarea id="_cust-prompt-inp" rows="3" placeholder="Escribe el motivo..."
            style="width:100%;resize:vertical;min-height:64px;padding:8px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rsm);color:var(--white);font-family:'Montserrat',sans-serif;font-size:.78rem;outline:none;">${defaultVal||''}</textarea>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="_cust-prompt-cancel">Cancelar</button>
          <button class="btn btn-add" id="_cust-prompt-ok">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#_cust-prompt-inp');
    inp.focus();
    overlay.querySelector('#_cust-prompt-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#_cust-prompt-ok').onclick     = () => { onConfirm(inp.value); overlay.remove(); };
    inp.addEventListener('keydown', e => { if(e.key==='Enter' && e.ctrlKey) { onConfirm(inp.value); overlay.remove(); } });
}

/* ══ AUTO-ASISTENCIA: popup personal ══ */

window._checkSelfAttendancePrompt = function() {
    const myName   = _myAttName();
    if(!myName) return;
    const today    = new Date();
    const todayStr = _svDateStr();
    const nowMin   = today.getHours() * 60 + today.getMinutes();

    const candidates = events.filter(ev => {
        if(!ev.date) return false;
        const diff = Math.round((new Date(ev.date+'T00:00:00') - new Date(todayStr+'T00:00:00')) / 86400000);
        return diff >= 0 && diff <= 4;
    }).sort((a,b) => a.date.localeCompare(b.date));

    for(const ev of candidates) {
        if(ev.attendance?.[myName]?.status && !ev.attendance[myName].autoAbsent) continue;

        const promptKey = `_attPrompt_${currentUser.id}_${ev.id}`;
        if(sessionStorage.getItem(promptKey)) continue;

        const diffDays = Math.round((new Date(ev.date+'T00:00:00') - new Date(todayStr+'T00:00:00')) / 86400000);

        if(diffDays === 0) {
            const person = people.find(p => p.name === myName);
            if(!person?.schedules?.length) continue;
            const times = person.schedules.map(_parseServiceTime).filter(t=>t!==null).sort((a,b)=>a-b);
            if(!times.length) continue;
            if(nowMin < times[0] + 15 || nowMin > times[0] + 120) continue;
            sessionStorage.setItem(promptKey, '1');
            _showSelfAttendancePopup(ev, 'day-of');
            return;
        }
        // Permisos anticipados (1-4 días): solo en la pestaña de asistencia, sin popup
    }
};

/* ══ AUTO-AUSENTE: marcar si el servicio ya terminó sin reporte ══ */
window._checkAutoAbsent = function() {
    const today    = new Date();
    const todayStr = _svDateStr();
    const nowMin   = today.getHours() * 60 + today.getMinutes();

    const todayEvents = events.filter(ev => ev.date === todayStr);
    if(!todayEvents.length) return;

    const acts = activities;
    let changed = false;

    todayEvents.forEach(ev => {
        if(!ev.attendance) ev.attendance = {};

        const evActs = acts.filter(a => a.eventId === ev.id);
        const personSet = new Set();
        evActs.forEach(a => {
            if(a.responsable) personSet.add(a.responsable);
            (a.tasks||[]).forEach(t => {
                if(t.responsable) personSet.add(t.responsable);
                (t.coliders||[]).forEach(c => { if(c) personSet.add(c); });
                (t.assignedPeople||[]).forEach(p => { if(p) personSet.add(p); });
            });
        });

        personSet.forEach(name => {
            const rec = ev.attendance[name];
            // Permiso con nota justificada → esperar aprobación manual de nivel 3
            if(rec?.status === 'permission' && rec?.note) return;
            // Ya confirmado (que no sea auto para poder reforzar)
            if(rec?.confirmed && !rec?.autoAbsent) return;

            const person = people.find(p => p.name === name);
            if(!person?.schedules?.length) return;

            const times = person.schedules.filter(s => s !== 'Extemporáneo')
                .map(_parseServiceTime).filter(t => t !== null).sort((a,b) => a-b);
            if(!times.length) return;

            // Auto-ausencia: 1.5 h (90 min) desde el INICIO del ÚLTIMO servicio asignado
            const autoPoint = times[times.length - 1] + 90;
            if(nowMin < autoPoint) return;

            if(!rec?.status || rec?.autoAbsent) {
                ev.attendance[name] = {
                    status: 'absent',
                    note: 'Sin reporte — ausencia confirmada automáticamente',
                    service: '', irregular: false, selfReported: false,
                    confirmed: true, autoAbsent: true, ts: Date.now()
                };
                changed = true;
            } else if(rec.status === 'absent' && !rec.confirmed) {
                rec.confirmed = true;
                rec.ts = Date.now();
                changed = true;
            }
        });
    });

    if(changed) afterChange();
};

/* ══ Recordatorios automáticos de servicio (#22) ══
   · 6:00 AM del domingo → aviso de servicio dominical
   · 1 hora antes de cada hora de servicio asignada (cualquier día asignado)
   Funciona mientras la app esté abierta; evita duplicados con flags por día. */
const SVC_REMINDER_KEY = 'elim_svc_reminders_v1';
window._checkServiceReminders = function() {
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    const myName = _myAttName();
    if(!myName) return;

    const now      = new Date();
    const todayStr = _svDateStr();
    const nowMin   = now.getHours() * 60 + now.getMinutes();
    const isSunday = now.getDay() === 0;

    // Flags ya disparados (conservar solo los de hoy)
    let fired = [];
    try { fired = JSON.parse(localStorage.getItem(SVC_REMINDER_KEY) || '[]'); } catch(e) {}
    fired = fired.filter(k => k.startsWith(todayStr));
    const has  = k => fired.includes(k);
    const mark = k => { fired.push(k); localStorage.setItem(SVC_REMINDER_KEY, JSON.stringify(fired)); };

    // ¿Tiene asignación hoy?
    const assignedToday = events.filter(ev => ev.date === todayStr).some(ev =>
        activities.filter(a => a.eventId === ev.id).some(a =>
            a.responsable === myName ||
            (a.tasks||[]).some(t =>
                t.responsable === myName ||
                (t.coliders||[]).includes(myName) ||
                (t.assignedPeople||[]).includes(myName))
        )
    );
    if(!assignedToday) return;

    // 1) 6:00 AM del domingo → servicio dominical (ventana 6:00–6:15)
    if(isSunday) {
        const k = todayStr + '::sun6';
        if(nowMin >= 360 && nowMin <= 375 && !has(k)) {
            _showNotif('🔔 Servicio dominical hoy', 'Recuerda que hoy tienes servicio asignado. ¡Te esperamos!');
            mark(k);
        }
    }

    // 2) 1 hora antes de cada servicio asignado (ventana de 10 min)
    const times = _getPersonSchedules(myName).map(_parseServiceTime).filter(t => t !== null).sort((a,b) => a-b);
    times.forEach(t => {
        const k = todayStr + '::pre::' + t;
        const target = t - 60;
        if(nowMin >= target && nowMin <= target + 10 && !has(k)) {
            const hh = Math.floor(t/60), mm = t%60;
            const lbl = `${((hh%12)||12)}:${String(mm).padStart(2,'0')} ${hh<12?'AM':'PM'}`;
            _showNotif('⏰ Tu servicio empieza en 1 hora', `Servicio de las ${lbl}. Prepárate para llegar a tiempo.`);
            mark(k);
        }
    });
};

/* ══ Popup de auto-asistencia ══ */
function _showSelfAttendancePopup(ev, mode) {
    const modal = document.getElementById('self-attendance-modal');
    const body  = document.getElementById('self-att-body');
    const foot  = document.getElementById('self-att-foot');
    if(!modal || !body) return;

    const myName    = _myAttName() || '';
    const myScheds  = _getPersonSchedules(myName);
    const allSvcs   = SERVICE_HOURS.filter(h => h !== 'Extemporáneo');
    const dayNames  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const dayOfEv   = new Date(ev.date + 'T00:00:00');
    const dayLabel  = `${dayNames[dayOfEv.getDay()]} ${dayOfEv.toLocaleDateString('es-SV',{day:'2-digit',month:'long'})}`;
    const evLabel   = `${esc(ev.name)} · ${dayLabel}`;

    const serviceOpts = allSvcs.map(s => {
        const mine = myScheds.includes(s);
        return `<option value="${esc(s)}" ${!mine?'data-irregular="1"':''}>${s}${mine?'':' ⚠️'}</option>`;
    }).join('');

    if(mode === 'day-of') {
        body.innerHTML = `
          <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:2rem;margin-bottom:8px;">🙋</div>
            <div style="font-family:'Nunito',sans-serif;font-size:.95rem;font-weight:800;margin-bottom:4px;">¿Ya llegaste al servicio?</div>
            <div style="font-size:.7rem;color:var(--muted);">${evLabel}</div>
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:.63rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;">¿A qué servicio asististe?</label>
            <select id="self-att-service" onchange="_onSelfServiceChange(this)"
              style="width:100%;padding:7px 10px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rsm);color:var(--white);font-family:'Montserrat',sans-serif;font-size:.76rem;">
              ${serviceOpts}
            </select>
            <div id="self-att-irregular-warn" style="display:none;font-size:.63rem;color:var(--cyan);margin-top:5px;padding:5px 8px;background:rgba(32,172,244,.07);border-radius:var(--rxs);border:1px solid rgba(32,172,244,.2);">
              ⚠️ Este servicio no es tu horario habitual. Será revisado por un director.
            </div>
          </div>
          <div id="self-att-note-wrap" style="display:none;margin-bottom:12px;">
            <label style="font-size:.63rem;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;">Motivo *</label>
            <textarea id="self-att-note" rows="2" placeholder="Describe el motivo..."
              style="width:100%;resize:vertical;min-height:52px;padding:7px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rsm);color:var(--white);font-family:'Montserrat',sans-serif;font-size:.74rem;outline:none;"></textarea>
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;">
            <button onclick="_selfAttChoose('present')" class="btn btn-add" style="justify-content:center;font-size:.8rem;">✅ Sí, ya llegué</button>
            <button onclick="_selfAttChoose('permission')" class="btn btn-ghost" style="justify-content:center;font-size:.8rem;color:var(--amber);border-color:var(--amber);" onclick="document.getElementById('self-att-note-wrap').style.display=''">📋 Llegué tarde / tengo permiso</button>
          </div>
          <div style="font-size:.62rem;color:var(--muted);text-align:center;margin-top:9px;line-height:1.4;">
            Si no marcas, tu ausencia se registrará sola 1.5 h después de tu último servicio.
          </div>`;
    } else {
        body.innerHTML = `
          <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:2rem;margin-bottom:8px;">📋</div>
            <div style="font-family:'Nunito',sans-serif;font-size:.92rem;font-weight:800;margin-bottom:4px;">Solicitar permiso anticipado</div>
            <div style="font-size:.7rem;color:var(--muted);">${evLabel}</div>
          </div>
          <div style="font-size:.72rem;color:var(--muted);margin-bottom:14px;line-height:1.5;">Puedes reportar que no podrás asistir o que llegarás tarde con anticipación.</div>
          <div style="margin-bottom:12px;">
            <label style="font-size:.63rem;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;">Motivo *</label>
            <textarea id="self-att-note" rows="3" placeholder="Describe el motivo de tu permiso o ausencia..."
              style="width:100%;resize:vertical;min-height:64px;padding:7px;background:var(--s1);border:1px solid var(--border);border-radius:var(--rsm);color:var(--white);font-family:'Montserrat',sans-serif;font-size:.74rem;outline:none;"></textarea>
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;">
            <button onclick="_selfAttChoose('permission')" class="btn btn-ghost" style="justify-content:center;font-size:.8rem;color:var(--amber);border-color:var(--amber);">📋 Solicitar permiso</button>
            <button onclick="_selfAttChoose('absent')" class="btn btn-ghost" style="justify-content:center;font-size:.8rem;color:var(--red);border-color:var(--red);">❌ Reportar ausencia</button>
          </div>`;
    }

    foot.innerHTML = `<button class="btn btn-ghost" style="font-size:.7rem;" onclick="document.getElementById('self-attendance-modal').classList.remove('open')">Recordar después</button>`;
    modal._attEvId  = ev.id;
    modal._attMode  = mode;
    modal._attDefaultService = myScheds[0] || allSvcs[0] || '';
    modal.classList.add('open');
    setTimeout(() => { const s = document.getElementById('self-att-service'); if(s) _onSelfServiceChange(s); }, 50);
}

window._onSelfServiceChange = function(sel) {
    const opt = sel?.options[sel.selectedIndex];
    const w   = document.getElementById('self-att-irregular-warn');
    if(w) w.style.display = opt?.getAttribute('data-irregular')==='1' ? '' : 'none';
};

window._selfAttChoose = function(status) {
    const modal   = document.getElementById('self-attendance-modal');
    if(!modal) return;
    const evId    = modal._attEvId;
    const note    = document.getElementById('self-att-note')?.value.trim() || '';
    const selEl   = document.getElementById('self-att-service');
    const service = selEl?.value || modal._attDefaultService || '';
    const opt     = selEl?.options[selEl.selectedIndex];
    const irregular = opt?.getAttribute('data-irregular') === '1';

    if((status === 'permission' || status === 'absent')) {
        if(!note) {
            showToast('⚠️ Describe el motivo antes de continuar');
            const w = document.getElementById('self-att-note-wrap');
            if(w) w.style.display = '';
            document.getElementById('self-att-note')?.focus();
            return;
        }
    }

    if(irregular) {
        customConfirm('⚠️ Este servicio no es tu horario habitual. Tu asistencia será marcada como irregular y revisada por un director. ¿Confirmar?', () => {
            _submitSelfAttendance(evId, status, note, service, true);
        });
        return;
    }
    _submitSelfAttendance(evId, status, note, service, false);
};

window._submitSelfAttendance = function(evId, status, note, service, irregular) {
    const name = _myAttName();
    if(!name || !evId) return;
    const ev = events.find(x => x.id === evId);
    if(!ev) return;
    if(!ev.attendance) ev.attendance = {};
    ev.attendance[name] = { status, note:note||'', service:service||'', irregular:!!irregular, selfReported:true, confirmed:false, ts:Date.now() };
    afterChange();
    document.getElementById('self-attendance-modal')?.classList.remove('open');
    const attModal = document.getElementById('attendance-modal');
    if(attModal?.classList.contains('open') && authLevel < 2) _renderPersonalView(ev);
    showToast({ present:'✅ Asistencia registrada', permission:'📋 Permiso solicitado', absent:'❌ Ausencia registrada' }[status] || '✅ Registrado');
};

/* ══════════════════════════════════════════════════════════════
   HELPERS DE EQUIPO Y CONFIRMACIÓN
══════════════════════════════════════════════════════════════ */

function _getMyTeamMembers() {
    if(!currentUser) return new Set();
    const myIdentity = currentUser.linkedPerson || currentUser.name;
    const memberSet = new Set();
    (teams || []).forEach(t => {
        const leader = people.find(p => p.id === t.leaderId);
        if(!leader || leader.name !== myIdentity) return;
        (t.memberIds || []).forEach(mid => {
            const mp = people.find(p => p.id === mid);
            if(mp) memberSet.add(mp.name);
        });
    });
    return memberSet;
}

function _canConfirmAttendance(name) {
    if(authLevel >= 3) return true;
    if(authLevel < 2) return false;
    return _getMyTeamMembers().has(name);
}

/* ── Ver y aprobar permiso (solo nivel 3) ── */
window._viewPermission = function(eventId, name) {
    if(authLevel < 3) return;
    const ev = events.find(x => x.id === eventId);
    if(!ev?.attendance?.[name]) return;
    const rec = ev.attendance[name];
    const ns  = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    const overlay = document.createElement('div');
    overlay.className = 'overlay open';
    overlay.style.zIndex = '920';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;">
        <div class="modal-head" style="padding:14px 20px;">
          <span>📋 Solicitud de permiso</span>
          <button class="close-btn" onclick="this.closest('.overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="padding:16px 20px;">
          <div style="font-size:.82rem;font-weight:800;margin-bottom:4px;">${esc(name)}</div>
          <div style="font-size:.7rem;color:var(--muted);margin-bottom:14px;">${esc(ev.name)} · ${ev.date}</div>
          ${rec.note
            ? `<div style="padding:10px 12px;background:rgba(255,198,0,.07);border:1px solid rgba(255,198,0,.2);border-radius:var(--rsm);font-size:.75rem;line-height:1.6;margin-bottom:10px;"><strong style="color:var(--amber);">Motivo:</strong> ${esc(rec.note)}</div>`
            : `<div style="color:var(--muted);font-size:.72rem;margin-bottom:10px;">Sin motivo especificado</div>`}
          ${rec.service ? `<div style="font-size:.68rem;color:var(--muted);">🕒 Servicio: ${esc(rec.service)}</div>` : ''}
          ${rec.confirmed ? `<div style="margin-top:10px;font-size:.72rem;color:var(--green);">✓ Permiso ya aprobado</div>` : ''}
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Cerrar</button>
          ${!rec.confirmed
            ? `<button class="btn btn-add" onclick="_approvePermission('${eventId}','${ns}');this.closest('.overlay').remove()">✅ Aprobar permiso</button>`
            : ''}
        </div>
      </div>`;
    document.body.appendChild(overlay);
};

window._approvePermission = function(eventId, name) {
    if(authLevel < 3) { showToast('⚠️ Solo un administrador puede aprobar permisos'); return; }
    if(!_attDayReached(eventId)) {
        showToast('⚠️ Solo el mismo día de la asignación se puede aprobar el permiso');
        return;
    }
    const ev = events.find(x => x.id === eventId);
    if(!ev?.attendance?.[name]) return;
    ev.attendance[name].confirmed = true;
    afterChange();
    showToast(`✅ Permiso de ${name} aprobado`);
};

/* ══════════════════════════════════════════════════════════════
   PESTAÑA DE ASISTENCIA — VISTA PRINCIPAL
══════════════════════════════════════════════════════════════ */

/* ── Estado sub-pestaña ── */
let _attSubTab = 'personal';

window._switchAttSubTab = function(tab) {
    _attSubTab = tab;
    renderAttendanceView();
};

window._attSelectEvent = function(evId) {
    activeEventId = evId;
    afterChange();
};

/* ── Eventos relevantes del mes para una persona ── */
function _getMonthEventsForPerson(name) {
    const now = new Date();
    const yearMonth = _svDateStr(now).slice(0, 7);
    return events.filter(ev => {
        if(!ev.date || !ev.date.startsWith(yearMonth)) return false;
        const d = new Date(ev.date + 'T00:00:00');
        if(d.getDay() === 0) return true;
        const evActs = activities.filter(a => a.eventId === ev.id);
        return evActs.some(a =>
            a.responsable === name ||
            (a.tasks||[]).some(t =>
                t.responsable === name ||
                (t.coliders||[]).includes(name) ||
                (t.assignedPeople||[]).includes(name)
            )
        );
    }).sort((a,b) => a.date.localeCompare(b.date));
}

/* ── Historial de permisos ── */
function _getPermissionHistory(name) {
    const result = [];
    events.forEach(ev => {
        const rec = ev.attendance?.[name];
        if(rec?.status !== 'permission') return;
        const d = new Date(ev.date + 'T00:00:00');
        result.push({
            date: ev.date,
            dateLabel: d.toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'2-digit' }),
            evName: ev.name, note: rec.note || '', confirmed: rec.confirmed || false
        });
    });
    return result.sort((a,b) => b.date.localeCompare(a.date));
}

window._submitAdvancePermission = function(evId) {
    const ta = document.getElementById('att-advance-note-' + evId);
    const note = ta ? ta.value.trim() : '';
    if(!note) { showToast('⚠️ Escribe el motivo del permiso'); return; }
    window._submitSelfAttendance(evId, 'permission', note, '', false);
};

/* Confirmar por adelantado que asistirá a la asignación (RSVP). */
window._confirmWillAttend = function(evId) {
    const name = _myAttName();
    if(!name) return;
    const ev = events.find(x => x.id === evId);
    if(!ev) return;
    if(!ev.attendance) ev.attendance = {};
    const rec = ev.attendance[name] || {};
    if(rec.status === 'permission' && rec.confirmed) { showToast('⚠️ Ya tienes un permiso aprobado para este día'); return; }
    ev.attendance[name] = { ...rec, status: '', note: '', willAttend: true, selfReported: false, confirmed: false, rsvpAt: Date.now() };
    afterChange();
    showToast('🙋 Avisaste que vendrás. Recuerda marcar tu asistencia el día del servicio.');
};

/* Revertir la confirmación de asistencia (sin necesidad de enviar permiso). */
window._revertWillAttend = function(evId) {
    const name = _myAttName();
    if(!name) return;
    const ev = events.find(x => x.id === evId);
    const rec = ev?.attendance?.[name];
    if(!rec || !rec.willAttend) return;
    // Vuelve a estado "sin decidir": ni asistirá ni permiso
    delete ev.attendance[name];
    afterChange();
    showToast('↩️ Confirmación revertida. Puedes decidir más tarde.');
};

/* Mostrar/ocultar el formulario de permiso anticipado. */
window._toggleAdvPerm = function(evId) {
    const el = document.getElementById('advperm-' + evId);
    if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

/* Borrar el propio permiso mientras NO haya sido aprobado.
   Si no se vuelve a enviar y la persona falta, contará como ausencia automática. */
window._deleteMyPermission = function(evId) {
    const name = _myAttName();
    if(!name) return;
    const ev = events.find(x => x.id === evId);
    const rec = ev?.attendance?.[name];
    if(!rec || rec.status !== 'permission') return;
    if(rec.confirmed) { showToast('⚠️ El permiso ya fue aprobado y no se puede eliminar'); return; }
    customConfirm('¿Eliminar tu solicitud de permiso? Si no marcas asistencia luego, contará como ausencia.', () => {
        delete ev.attendance[name];
        afterChange();
        showToast('🗑 Permiso eliminado');
    });
};

/* ══ VISTA PRINCIPAL DE PESTAÑA ══
   Reglas de visibilidad:
   · Todos los usuarios con persona vinculada → vista PERSONAL (kpi, historial, permisos)
   · Nivel ≥2 (líder/director/admin) → además acceso a REPORTE
       - Nivel 2: reporte filtrado SOLO a su equipo, sin aprobar permisos
       - Nivel 3: reporte global completo (aprobar permisos, confirmar, marcar por otro)
   · Admin maestro (nivel 3 sin persona vinculada) → SOLO reporte global
   · Nivel 1 → solo personal                                                        */
function renderAttendanceView() {
    const wrap = document.getElementById('att-view-inner');
    if(!wrap) return;
    if(authLevel < 1) { wrap.innerHTML = ''; return; }

    const myName      = _myAttName();
    const hasPersonal = !!myName;            // tiene persona vinculada
    const hasReport   = authLevel >= 2;      // líder/director/admin
    const reportOnly  = hasReport && !hasPersonal;   // admin maestro (PIN, sin persona)

    // Pestaña efectiva
    let effTab;
    if(reportOnly)        effTab = 'report';
    else if(!hasReport)   effTab = 'personal';
    else                  effTab = (_attSubTab === 'report') ? 'report' : 'personal';

    wrap.innerHTML = '';

    // Sub-pestañas solo cuando hay AMBAS vistas (personal + reporte)
    if(hasPersonal && hasReport) {
        const subBar = document.createElement('div');
        subBar.style.cssText = 'display:flex;gap:0;border-bottom:2px solid var(--border);background:var(--s1);padding:0 20px;flex-shrink:0;';
        [
            { id:'personal', label:'👤 Mi asistencia' },
            { id:'report',   label:'📋 Reporte' }
        ].forEach(t => {
            const btn = document.createElement('button');
            const active = effTab === t.id;
            btn.textContent = t.label;
            btn.style.cssText = `padding:9px 18px;font-size:.72rem;font-weight:700;border:none;background:transparent;
                cursor:pointer;border-bottom:2px solid ${active?'var(--accent)':'transparent'};margin-bottom:-2px;
                color:${active?'var(--white)':'var(--muted)'};font-family:'Montserrat',sans-serif;outline:none;transition:all .15s;`;
            btn.onclick = () => _switchAttSubTab(t.id);
            subBar.appendChild(btn);
        });
        wrap.appendChild(subBar);
    }

    const content = document.createElement('div');
    content.style.cssText = 'padding:16px 20px 32px;';
    wrap.appendChild(content);

    try {
        if(effTab === 'report') {
            _renderReportAttContent(content);
        } else {
            _renderPersonalAttContent(content, myName);
        }
    } catch(err) {
        console.error('renderAttendanceView » contenido', err);
        content.innerHTML = `<div style="padding:30px;text-align:center;color:var(--red);font-size:.78rem;">
            ⚠️ Error al cargar la asistencia.<br>
            <span style="opacity:.7;font-size:.7rem;">${esc(err.message||String(err))}</span></div>`;
    }
}


/* ══ Vista personal — todos los usuarios ══ */
function _renderPersonalAttContent(container, myName) {
    if(!myName) {
        container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-size:.8rem;">
            Tu usuario no tiene una persona vinculada.<br>
            <span style="font-size:.72rem;">Pídele a un administrador que lo configure.</span></div>`;
        return;
    }

    const today  = _svDateStr();
    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    /* KPIs del año */
    const k = _getAttendanceKPIs(myName);
    const kpiRow = `
        <div style="display:flex;gap:8px;margin-bottom:16px;">
            ${[
                { label:'Presencias', val:k.present,             color:'var(--green)', icon:'✅' },
                { label:'Permisos',   val:k.permission,           color:'var(--amber)', icon:'📋' },
                { label:'Ausencias',  val:k.absent+k.autoAbsent, color:'var(--red)',   icon:'❌' },
                { label:'Sin reg.',   val:k.unregistered,         color:'var(--muted)', icon:'⭕' }
            ].map(r => `<div style="flex:1;text-align:center;padding:10px 4px;background:var(--s2);
                    border:1px solid var(--border);border-radius:var(--rsm);">
                <div style="font-size:.95rem;">${r.icon}</div>
                <div style="font-size:1.15rem;font-weight:900;color:${r.color};line-height:1.2;">${r.val}</div>
                <div style="font-size:.56rem;color:var(--muted);margin-top:2px;">${r.label}</div>
            </div>`).join('')}
        </div>`;

    /* Eventos del mes */
    const monthEvts = _getMonthEventsForPerson(myName);
    const d0    = new Date();
    const mName = d0.toLocaleString('es-SV', { month:'long', year:'numeric' });

    const si = (rec) => ({
        present:    { icon:'✅', label:'Presente',       color:'var(--green)' },
        permission: { icon:'📋', label:'Con permiso',    color:'var(--amber)' },
        absent:     { icon:'❌', label:'Ausente',         color:'var(--red)'   }
    }[rec?.status] || { icon:'⭕', label:'Sin registrar', color:'var(--muted)' });

    const dayNames = ['dom','lun','mar','mié','jue','vie','sáb'];

    let monthRows = '';
    if(!monthEvts.length) {
        monthRows = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:.75rem;">Sin eventos este mes.</div>`;
    } else {
        monthRows = monthEvts.map(ev => {
            const rec      = ev.attendance?.[myName] || {};
            const info     = si(rec);
            const dEv      = new Date(ev.date + 'T00:00:00');
            const dateLabel = `${dayNames[dEv.getDay()]} ${String(dEv.getDate()).padStart(2,'0')}`;
            const diffDays  = Math.round((dEv - new Date(today + 'T00:00:00')) / 86400000);
            const isFuture  = diffDays > 0;
            const isToday   = diffDays === 0;

            let actionHtml = '';
            if(isFuture || isToday) {
                const myScheds = _getPersonSchedules(myName);
                const times = myScheds.map(_parseServiceTime).filter(t => t !== null).sort((a,b) => a-b);
                const firstSvc = times[0] ?? null;
                const canConfirmNow = isToday && firstSvc !== null && nowMin >= firstSvc+15 && nowMin <= firstSvc+120;

                const isPendPerm = rec.status === 'permission' && !rec.confirmed;

                // Formulario de permiso (oculto por defecto; visible si ya hay permiso pendiente)
                const placeholder  = isPendPerm ? '' : 'Motivo del permiso…';
                const existingNote = isPendPerm ? esc(rec.note||'') : '';
                const btnLabel     = isPendPerm ? '💾 Actualizar permiso' : '📋 Enviar solicitud de permiso';
                const permForm = `
                    <div id="advperm-${ev.id}" style="display:${isPendPerm?'block':'none'};margin-top:8px;padding:9px 11px;
                        background:rgba(255,198,0,.05);border:1px solid rgba(255,198,0,.2);border-radius:var(--rxs);">
                        <div style="font-size:.58rem;font-weight:800;color:var(--amber);margin-bottom:5px;
                            text-transform:uppercase;letter-spacing:.05em;">
                            ${isPendPerm ? 'Editar solicitud de permiso' : 'No podré asistir — describe el motivo'}
                        </div>
                        <textarea id="att-advance-note-${ev.id}" rows="2" placeholder="${placeholder}"
                            style="width:100%;resize:none;padding:6px;background:var(--s1);border:1px solid var(--border);
                            border-radius:var(--rxs);color:var(--white);font-family:'Montserrat',sans-serif;
                            font-size:.72rem;outline:none;box-sizing:border-box;">${existingNote}</textarea>
                        <button onclick="_submitAdvancePermission('${ev.id}')" class="btn btn-ghost"
                            style="width:100%;justify-content:center;color:var(--amber);border-color:var(--amber);
                            font-size:.7rem;margin-top:6px;padding:4px 0;">${btnLabel}</button>
                        ${isPendPerm ? `<button onclick="_deleteMyPermission('${ev.id}')" class="btn btn-ghost"
                            style="width:100%;justify-content:center;color:var(--red);border-color:rgba(251,99,126,.4);
                            font-size:.66rem;margin-top:5px;padding:4px 0;">🗑 Eliminar permiso</button>
                            <div style="font-size:.58rem;color:var(--muted);margin-top:5px;line-height:1.4;">
                                ⚠️ Si lo eliminas y no marcas asistencia, contará como ausencia.</div>` : ''}
                    </div>`;

                if(isToday && canConfirmNow && (!rec.status || rec.autoAbsent)) {
                    // Día del servicio, dentro de la ventana → marcar asistencia real
                    actionHtml = `<button onclick="openSelfAttendanceForEvent('${ev.id}')" class="btn btn-add"
                        style="width:100%;justify-content:center;font-size:.72rem;padding:5px 0;margin-top:8px;">
                        ✅ Confirmar asistencia de hoy
                    </button>` + permForm;
                } else if(isPendPerm) {
                    actionHtml = permForm;
                } else if(!rec.status || rec.autoAbsent) {
                    // RSVP de la asignación: confirmar que asistirá / avisar que no podrá / decidir luego
                    if(rec.willAttend) {
                        actionHtml = `
                            <div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <span style="font-size:.68rem;font-weight:700;color:var(--cyan);">🙋 Confirmaste que vendrás</span>
                                <button onclick="_revertWillAttend('${ev.id}')" class="btn btn-ghost"
                                    style="font-size:.62rem;padding:3px 9px;margin-left:auto;">↩️ Revertir</button>
                                <button onclick="_toggleAdvPerm('${ev.id}')" class="btn btn-ghost"
                                    style="font-size:.62rem;padding:3px 9px;color:var(--amber);border-color:var(--amber);">📋 No podré</button>
                            </div>
                            <div style="font-size:.57rem;color:var(--muted);margin-top:5px;line-height:1.4;">
                                Aún debes marcar tu asistencia el día del servicio; esto solo avisa que planeas venir.
                                Puedes <b>revertir</b> sin enviar permiso si aún no decides.
                            </div>` + permForm;
                    } else {
                        actionHtml = `
                            <div style="margin-top:8px;display:flex;gap:6px;">
                                <button onclick="_confirmWillAttend('${ev.id}')" class="btn btn-add"
                                    style="flex:1;justify-content:center;font-size:.7rem;padding:5px 0;">✅ Asistiré</button>
                                <button onclick="_toggleAdvPerm('${ev.id}')" class="btn btn-ghost"
                                    style="flex:1;justify-content:center;font-size:.7rem;padding:5px 0;color:var(--amber);border-color:var(--amber);">📋 No podré</button>
                            </div>
                            <div style="font-size:.57rem;color:var(--muted);margin-top:5px;text-align:center;">Puedes confirmar ahora o después.</div>` + permForm;
                    }
                }
            }

            const confTag = rec.confirmed
                ? `<span style="font-size:.55rem;color:var(--green);"> ✓ conf.</span>`
                : (rec.selfReported ? `<span style="font-size:.55rem;color:var(--amber);"> ⏳</span>` : '');
            // Confirmó por adelantado que vendrá (intención, NO es asistencia registrada)
            const willTag = (rec.willAttend && !rec.status)
                ? `<div style="font-size:.55rem;font-weight:700;color:var(--cyan);">🙋 Confirmó que vendrá</div>` : '';
            const noteRow = rec.note
                ? `<div style="font-size:.64rem;color:var(--muted);margin-top:3px;line-height:1.4;">${esc(rec.note)}</div>` : '';

            return `<div style="background:var(--s2);border:1px solid var(--border);border-radius:var(--rsm);
                padding:10px 14px;margin-bottom:7px;${isFuture?'opacity:.85':''}">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="min-width:36px;text-align:center;">
                        <div style="font-size:.62rem;font-weight:800;color:var(--muted);text-transform:uppercase;">${dateLabel}</div>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.75rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ev.name)}</div>
                        ${rec.service ? `<div style="font-size:.61rem;color:var(--muted);">🕒 ${esc(rec.service)}</div>` : ''}
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:.82rem;">${info.icon}</div>
                        <div style="font-size:.58rem;font-weight:700;color:${info.color};">${info.label}${confTag}</div>
                        ${willTag}
                    </div>
                </div>
                ${noteRow}${actionHtml}
            </div>`;
        }).join('');
    }

    const monthSection = `<div style="margin-bottom:16px;">
        <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
            color:var(--muted);margin-bottom:10px;">
            📅 ${mName.charAt(0).toUpperCase() + mName.slice(1)}
        </div>
        ${monthRows}
    </div>`;

    /* Historial de permisos */
    const permHistory = _getPermissionHistory(myName);
    const histSection = !permHistory.length ? '' : `
        <div style="background:var(--s2);border:1px solid var(--border);border-radius:var(--rsm);padding:14px 16px;">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted);margin-bottom:10px;">📋 HISTORIAL DE PERMISOS</div>
            ${permHistory.slice(0, 20).map(h => `
                <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--s3);">
                    <span style="font-size:.64rem;color:var(--muted);white-space:nowrap;min-width:68px;">${h.dateLabel}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.7rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(h.evName)}</div>
                        ${h.note ? `<div style="font-size:.64rem;color:var(--muted);margin-top:2px;line-height:1.4;">${esc(h.note)}</div>` : ''}
                    </div>
                    ${h.confirmed
                        ? `<span style="font-size:.58rem;color:var(--green);white-space:nowrap;flex-shrink:0;">✓ Aprobado</span>`
                        : `<span style="font-size:.58rem;color:var(--amber);white-space:nowrap;flex-shrink:0;">⏳ Pendiente</span>`}
                </div>`).join('')}
        </div>`;

    container.innerHTML = kpiRow + monthSection + histSection;
}

/* ══ Vista de reporte del día (nivel 2+) ══ */
function _renderReportAttContent(container) {
    const today = _svDateStr();
    const d7    = new Date(); d7.setDate(d7.getDate() - 6);
    const since = _svDateStr(d7);

    // Nivel 2: limitar todo el reporte a los miembros de su equipo
    const teamFilter = authLevel === 2 ? _getMyTeamMembers() : null;

    /* KPIs últimos 7 días */
    const recentEvts = events.filter(ev => ev.date >= since && ev.date <= today);
    let r7P=0, r7Perm=0, r7A=0, r7Total=0;
    recentEvts.forEach(ev => {
        const evActs = activities.filter(a => a.eventId === ev.id);
        const personSet = new Set();
        evActs.forEach(a => {
            if(a.responsable) personSet.add(a.responsable);
            (a.tasks||[]).forEach(t => {
                if(t.responsable) personSet.add(t.responsable);
                (t.coliders||[]).forEach(c => { if(c) personSet.add(c); });
                (t.assignedPeople||[]).forEach(p => { if(p) personSet.add(p); });
            });
        });
        personSet.forEach(name => {
            if(teamFilter && !teamFilter.has(name)) return;
            const rec = ev.attendance?.[name];
            r7Total++;
            if(rec?.status === 'present')    r7P++;
            else if(rec?.status === 'permission') r7Perm++;
            else if(rec?.status === 'absent')     r7A++;
        });
    });
    const r7Pct = n => r7Total ? Math.round(n/r7Total*100) : 0;

    const kpi7 = `
        <div style="margin-bottom:16px;">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted);margin-bottom:8px;">📊 ÚLTIMOS 7 DÍAS</div>
            <div style="display:flex;gap:7px;">
                ${[
                    { label:'Presencias', val:r7P,    color:'var(--green)', icon:'✅', pct:r7Pct(r7P) },
                    { label:'Permisos',   val:r7Perm, color:'var(--amber)', icon:'📋', pct:r7Pct(r7Perm) },
                    { label:'Ausencias',  val:r7A,    color:'var(--red)',   icon:'❌', pct:r7Pct(r7A) }
                ].map(r => `<div style="flex:1;text-align:center;padding:10px 4px;background:var(--s2);
                        border:1px solid var(--border);border-radius:var(--rsm);">
                    <div style="font-size:.9rem;">${r.icon}</div>
                    <div style="font-size:1.05rem;font-weight:900;color:${r.color};">${r.val}</div>
                    <div style="font-size:.55rem;color:var(--muted);">${r.label}</div>
                    <div style="font-size:.55rem;color:var(--muted);">${r.pct}%</div>
                </div>`).join('')}
            </div>
        </div>`;

    /* Selector de evento */
    const sortedEvts = events.slice().sort((a,b) => b.date.localeCompare(a.date));
    const selHtml = !sortedEvts.length ? '' : `
        <div style="margin-bottom:12px;">
            <label style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted);display:block;margin-bottom:4px;">EVENTO</label>
            <select id="att-evt-sel" onchange="_attSelectEvent(this.value)"
                style="width:100%;padding:7px 10px;background:var(--s1);border:1px solid var(--border);
                border-radius:var(--rsm);color:var(--white);font-family:'Montserrat',sans-serif;font-size:.75rem;">
                ${sortedEvts.map(e =>
                    `<option value="${e.id}" ${e.id===activeEventId?'selected':''}>${esc(e.name)} · ${e.date}</option>`
                ).join('')}
            </select>
        </div>`;

    const evId = activeEventId || sortedEvts[0]?.id;
    const ev   = evId ? events.find(x => x.id === evId) : null;

    if(!ev) {
        container.innerHTML = kpi7 + selHtml
            + `<div style="padding:20px;text-align:center;color:var(--muted);font-size:.8rem;">Selecciona un evento.</div>`;
        return;
    }

    if(!ev.attendance) ev.attendance = {};
    const att = ev.attendance;

    // Solo el mismo día (o después) se pueden marcar/confirmar/aprobar
    const dayReached = ev.date <= today;

    /* Personas asignadas */
    const evActs = activities.filter(a => a.eventId === evId);
    const personSet = new Set();
    evActs.forEach(a => {
        if(a.responsable) personSet.add(a.responsable);
        (a.tasks||[]).forEach(t => {
            if(t.responsable) personSet.add(t.responsable);
            (t.coliders||[]).forEach(c => { if(c) personSet.add(c); });
            (t.assignedPeople||[]).forEach(p => { if(p) personSet.add(p); });
        });
    });
    let persons = [...personSet].filter(Boolean).sort();

    // Nivel 2 (líder de equipo / director operativo): solo ve a su equipo
    if(teamFilter) persons = persons.filter(n => teamFilter.has(n));

    /* KPI del evento */
    let eP=0,ePerm=0,eA=0,eU=0;
    persons.forEach(n => {
        const r = att[n];
        if(!r?.status) eU++;
        else if(r.status==='present') eP++;
        else if(r.status==='permission') ePerm++;
        else eA++;
    });
    const eTot = persons.length;
    const ePct = n => eTot ? Math.round(n/eTot*100) : 0;

    const evKpi = !eTot ? '' : `
        <div style="margin-bottom:14px;">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted);margin-bottom:7px;">📋 ${esc(ev.name)}</div>
            <div style="display:flex;gap:6px;">
                ${[
                    { label:'Presencias', val:eP,    color:'var(--green)', icon:'✅', pct:ePct(eP) },
                    { label:'Permisos',   val:ePerm, color:'var(--amber)', icon:'📋', pct:ePct(ePerm) },
                    { label:'Ausencias',  val:eA,    color:'var(--red)',   icon:'❌', pct:ePct(eA) },
                    { label:'Sin reg.',   val:eU,    color:'var(--muted)', icon:'⭕', pct:ePct(eU) }
                ].map(r => `<div style="flex:1;text-align:center;padding:7px 2px;background:var(--s2);
                        border:1px solid var(--border);border-radius:var(--rsm);">
                    <div style="font-size:.8rem;">${r.icon}</div>
                    <div style="font-size:.95rem;font-weight:900;color:${r.color};">${r.val}</div>
                    <div style="font-size:.52rem;color:var(--muted);">${r.label} ${r.pct}%</div>
                </div>`).join('')}
            </div>
        </div>`;

    /* Lista detallada */
    const renderPersonRow = (name) => {
        const rec  = att[name] || {};
        const ns   = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const locked = _requiresAdminOverride(evId, name) && authLevel < 3;

        const sBtn = (status, label, color) => {
            const active = (rec.status||'') === status;
            return `<button onclick="_setAttendance('${evId}','${ns}','${status}')"
                title="${locked ? 'Solo admin puede modificar' : ''}"
                style="padding:3px 9px;font-size:.6rem;font-weight:700;border-radius:20px;
                cursor:${locked?'not-allowed':'pointer'};opacity:${locked&&!active?0.4:1};
                ${active
                    ? `background:var(--${color});color:#fff;border:1px solid var(--${color});`
                    : `background:var(--s3);color:var(--muted);border:1px solid var(--border);`}">
                ${label}${locked?' 🔒':''}
            </button>`;
        };

        const pObj  = people.find(p => p.name === name);
        const distHtml = pObj?.district
            ? `<div style="font-size:.58rem;color:var(--muted);margin-top:1px;">📍 ${esc(pObj.district)}</div>` : '';

        const canConf    = _canConfirmAttendance(name) && rec.selfReported && !rec.confirmed && rec.status !== 'permission';
        const isPendPerm = rec.status === 'permission' && !rec.confirmed;
        const confBtn = canConf
            ? `<button onclick="_confirmAttendance('${evId}','${ns}')"
                style="font-size:.58rem;padding:2px 7px;border-radius:20px;background:rgba(38,208,124,.12);
                color:var(--green);border:1px solid rgba(38,208,124,.3);cursor:pointer;font-weight:700;white-space:nowrap;">✓ Confirmar</button>` : '';
        const permBtn = isPendPerm && authLevel >= 3
            ? `<button onclick="_viewPermission('${evId}','${ns}')"
                style="font-size:.58rem;padding:2px 7px;border-radius:20px;background:rgba(255,198,0,.12);
                color:var(--amber);border:1px solid rgba(255,198,0,.3);cursor:pointer;font-weight:700;white-space:nowrap;">📋 Ver permiso</button>` : '';

        const selfB = rec.selfReported && !rec.confirmed
            ? `<span style="font-size:.54rem;padding:1px 5px;border-radius:20px;background:rgba(255,198,0,.15);color:var(--amber);border:1px solid rgba(255,198,0,.3);font-weight:700;">Auto-rep.</span>` : '';
        const confB = rec.confirmed
            ? `<span style="font-size:.54rem;padding:1px 5px;border-radius:20px;background:rgba(38,208,124,.12);color:var(--green);border:1px solid rgba(38,208,124,.25);font-weight:700;">✓ Conf.</span>` : '';
        const autoB = rec.autoAbsent
            ? `<span style="font-size:.54rem;padding:1px 5px;border-radius:20px;background:rgba(251,99,126,.1);color:var(--red);border:1px solid rgba(251,99,126,.25);font-weight:700;">Auto</span>` : '';
        const svcB  = rec.service
            ? `<span style="font-size:.54rem;padding:1px 5px;border-radius:20px;background:var(--s3);color:var(--muted);border:1px solid var(--border);">🕒 ${esc(rec.service)}</span>` : '';
        const willB = (rec.willAttend && !rec.status)
            ? `<span style="font-size:.54rem;padding:1px 5px;border-radius:20px;background:rgba(32,172,244,.1);color:var(--cyan);border:1px solid rgba(32,172,244,.28);font-weight:700;">🙋 Confirmó que vendrá</span>` : '';
        const badges = [willB,selfB,confB,autoB,svcB].filter(Boolean).join('');

        const noteHtml = (rec.status==='permission'||rec.status==='absent') && rec.note
            ? `<div style="margin-top:5px;padding:4px 8px;background:rgba(255,198,0,.06);border:1px solid rgba(255,198,0,.18);
                border-radius:var(--rxs);font-size:.65rem;color:var(--muted);line-height:1.4;">
                <strong style="color:var(--amber);">Motivo:</strong> ${esc(rec.note)}</div>` : '';

        const absentTasks = rec.status==='absent' ? _getPersonTasks(name, evActs) : [];
        const replaceRows = absentTasks.length ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);">
            <div style="font-size:.56rem;font-weight:800;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Reasignar tareas:</div>
            ${absentTasks.map(t => `<div style="display:flex;align-items:center;gap:5px;padding:3px 7px;
                background:var(--s1);border:1px solid var(--border);border-radius:var(--rxs);margin-bottom:3px;">
                <span style="flex:1;font-size:.67rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.name||'')}</span>
                <select onchange="_replacePersonInTask('${evId}','${t.actId}','${t.id}','${ns}',this.value)"
                    style="font-size:.6rem;padding:2px 4px;background:var(--s1);border:1px solid var(--border);
                    border-radius:var(--rxs);color:var(--white);max-width:100px;">
                    <option value="">— Reasignar —</option>
                    ${people.filter(p => p.name !== name && !p.archived).map(p =>
                        `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}
                </select>
            </div>`).join('')}
        </div>` : '';

        // Botones de acción solo el mismo día de la asignación (no antes); la ausencia es automática
        const actionBtns = dayReached
            ? `${confBtn}${permBtn}
               <div style="display:flex;gap:3px;flex-shrink:0;">
                    ${sBtn('present','✅','green')}
                    ${sBtn('permission','📋','amber')}
               </div>`
            : '';

        return `<div style="background:var(--s2);border:1px solid ${rec.selfReported&&!rec.confirmed?'rgba(255,198,0,.35)':'var(--border)'};
            border-radius:var(--rsm);padding:8px 11px;margin-bottom:5px;">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:.75rem;font-weight:700;">${esc(name)}</div>
                    ${distHtml}
                </div>
                ${actionBtns}
            </div>
            ${badges ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px;">${badges}</div>` : ''}
            ${noteHtml}${replaceRows}
        </div>`;
    };

    // Orden por horario del primer servicio asignado (sin servicio → al final)
    const _svcOrder = (name) => {
        const times = _getPersonSchedules(name).map(_parseServiceTime).filter(t => t !== null);
        return times.length ? Math.min(...times) : 99999;
    };

    const byCategory = {};
    ATT_CATEGORY_ORDER.forEach(cat => { byCategory[cat] = []; });
    persons.forEach(name => byCategory[_getPersonCategory(name)].push(name));
    ATT_CATEGORY_ORDER.forEach(cat => {
        byCategory[cat].sort((a, b) => _svcOrder(a) - _svcOrder(b) || a.localeCompare(b));
    });

    let listHtml = '';
    if(!persons.length) {
        listHtml = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:.8rem;">Sin asignados en este evento.</div>`;
    } else {
        ATT_CATEGORY_ORDER.forEach(cat => {
            const group = byCategory[cat] || [];
            if(!group.length) return;
            listHtml += `<div style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--muted);margin:${listHtml?'12px':'0'} 0 6px;">
                ${_catIcon(cat)} ${cat === 'Coordinador General' ? 'Coordinadores' : cat + 's'}
            </div>`;
            listHtml += group.map(renderPersonRow).join('');
        });
    }

    /* Solicitudes de permiso (nivel 3) — solo el mismo día se pueden aprobar */
    const pendingPerms = (authLevel >= 3 && dayReached)
        ? persons.filter(n => att[n]?.status === 'permission' && !att[n]?.confirmed)
        : [];
    const permSection = !pendingPerms.length ? '' : `
        <div style="margin-top:20px;padding-top:14px;border-top:2px solid var(--border);">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--amber);margin-bottom:8px;">📋 SOLICITUDES DE PERMISO (${pendingPerms.length})</div>
            ${pendingPerms.map(name => {
                const rec = att[name];
                const ns  = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div style="background:var(--s2);border:1px solid rgba(255,198,0,.3);border-radius:var(--rsm);
                    padding:9px 13px;margin-bottom:7px;display:flex;align-items:flex-start;gap:9px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.76rem;font-weight:700;">${esc(name)}</div>
                        ${rec.note ? `<div style="font-size:.67rem;color:var(--muted);margin-top:3px;line-height:1.4;">${esc(rec.note)}</div>` : ''}
                        ${rec.service ? `<div style="font-size:.61rem;color:var(--muted);margin-top:2px;">🕒 ${esc(rec.service)}</div>` : ''}
                    </div>
                    <button onclick="_approvePermission('${evId}','${ns}')"
                        style="font-size:.65rem;padding:4px 11px;border-radius:20px;background:rgba(38,208,124,.12);
                        color:var(--green);border:1px solid rgba(38,208,124,.3);cursor:pointer;font-weight:700;white-space:nowrap;flex-shrink:0;">
                        ✅ Aprobar
                    </button>
                </div>`;
            }).join('')}
        </div>`;

    /* Aprobación final: la persona se auto-marcó presente → líder/admin confirma.
       Solo el mismo día de la asignación. */
    const pendingConf = dayReached ? persons.filter(n => {
        const r = att[n];
        return r?.selfReported && !r?.confirmed && r?.status === 'present' && _canConfirmAttendance(n);
    }) : [];

    const approvalSection = !pendingConf.length ? '' : `
        <div style="margin-top:20px;padding-top:14px;border-top:2px solid var(--border);">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--green);margin-bottom:8px;">✅ APROBACIÓN FINAL DE ASISTENCIA (${pendingConf.length})</div>
            <div style="font-size:.6rem;color:var(--muted);margin-bottom:8px;line-height:1.4;">
                Estas personas marcaron su asistencia. Confírmala para darla por válida.</div>
            ${pendingConf.map(name => {
                const rec = att[name] || {};
                const ns  = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div style="background:var(--s2);border:1px solid rgba(255,198,0,.35);border-radius:var(--rsm);
                    padding:9px 13px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.76rem;font-weight:700;">${esc(name)}</div>
                        <div style="font-size:.62rem;color:var(--amber);">⏳ Auto-reportó presente${rec.service?` · 🕒 ${esc(rec.service)}`:''}${rec.irregular?' · ⚠️ irregular':''}</div>
                    </div>
                    <button onclick="_confirmAttendance('${evId}','${ns}')"
                        style="font-size:.65rem;padding:4px 11px;border-radius:20px;background:rgba(38,208,124,.12);
                        color:var(--green);border:1px solid rgba(38,208,124,.3);cursor:pointer;font-weight:700;white-space:nowrap;flex-shrink:0;">
                        ✓ Aprobar
                    </button>
                </div>`;
            }).join('')}
        </div>`;

    /* Marcar asistencia por otro (sin registro aún) — solo el mismo día */
    const noStatus = dayReached ? persons.filter(n => !att[n]?.status && _canConfirmAttendance(n)) : [];

    const markSection = !noStatus.length ? '' : `
        <div style="margin-top:20px;padding-top:14px;border-top:2px solid var(--border);">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
                color:var(--green);margin-bottom:8px;">⏳ MARCAR ASISTENCIA POR OTRO (${noStatus.length})</div>
            ${noStatus.map(name => {
                const ns  = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div style="background:var(--s2);border:1px solid rgba(38,208,124,.2);border-radius:var(--rsm);
                    padding:9px 13px;margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <div style="flex:1;">
                            <div style="font-size:.76rem;font-weight:700;">${esc(name)}</div>
                            <div style="font-size:.62rem;color:var(--muted);">⭕ Sin registrar</div>
                        </div>
                        <button onclick="_setAttendance('${evId}','${ns}','present')"
                            style="font-size:.6rem;padding:3px 9px;border-radius:20px;background:rgba(38,208,124,.12);
                            color:var(--green);border:1px solid rgba(38,208,124,.3);cursor:pointer;font-weight:700;">✅ Presente</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    const dayNotice = dayReached ? '' : `
        <div style="margin:10px 0 14px;padding:9px 13px;background:rgba(32,172,244,.08);
            border:1px solid rgba(32,172,244,.22);border-radius:var(--rsm);font-size:.7rem;color:var(--cyan);">
            ⏳ Las marcas de asistencia y aprobación de permisos se habilitan el mismo día de la asignación.
        </div>`;

    container.innerHTML = kpi7 + selHtml + dayNotice + evKpi + listHtml + permSection + approvalSection + markSection;
}

