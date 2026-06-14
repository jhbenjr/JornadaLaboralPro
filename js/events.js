/* ══════════════════════════ EVENT MANAGEMENT ══════════════════════════ */
function renderEventTabs() {
    const wrap = document.getElementById('evt-tabs');
    if(!wrap) return;

    // Nivel 0 (sin usuario): solo puede ver los eventos del día actual
    const isGuest = authLevel === 0;
    let sourceEvents = events;
    if(isGuest) {
        sourceEvents = events.filter(e => e.date === todayStr);
        // Forzar que el evento activo sea uno de hoy
        if(!sourceEvents.some(e => e.id === activeEventId)) {
            activeEventId = sourceEvents.length ? sourceEvents[0].id : null;
        }
    }

    const sortedEvents = sourceEvents.slice().sort((a,b) => new Date(b.date) - new Date(a.date));

    if(sortedEvents.length > 0 && !activeEventId) {
        activeEventId = sortedEvents[0].id;
    }

    if(sortedEvents.length === 0) {
        if(isGuest) {
            wrap.innerHTML = `<span style="font-size:.8rem; color:var(--muted); padding:10px;">📅 No hay actividades programadas para hoy. Inicia sesión para ver todos los eventos.</span>`;
            return;
        }
        wrap.innerHTML = `<span style="font-size:.8rem; color:var(--muted); padding:10px;">Ningún evento creado aún.${authLevel >= 3 ? ' Usa el botón "Nuevo Evento".' : ''}</span>`;
        return;
    }

    let html = '';
    let currentMonth = '';

    sortedEvents.forEach(e => {
        const d = new Date(e.date + 'T00:00:00');
        const mName = d.toLocaleString('es-ES', { month: 'short' }).replace('.', '');
        const yr    = d.getFullYear();
        const mStr  = `${mName} ${yr}`;

        if (mStr !== currentMonth) {
            html += `<div class="evt-month-divider"><span class="emd-mon">${mName}</span><span class="emd-yr">${yr}</span></div>`;
            currentMonth = mStr;
        }
        
        html += `
        <button class="evt-block-btn ${e.id === activeEventId ? 'active' : ''}" onclick="selectEvent('${e.id}')">
            <span class="eb-date">📅 ${formatDateStr(e.date)}</span>
            <span class="eb-name">${esc(e.name)}</span>
        </button>
        `;
    });

    wrap.innerHTML = html;
}

window.selectEvent = function(id) {
    activeEventId = id;
    afterChange();
};

function getActiveActivities() {
    const all = activities.filter(a => a.eventId === activeEventId);
    // Nivel 1: solo actividades con al menos una tarea asignada al usuario actual
    if(authLevel === 1 && currentUser) {
        const name = currentUser.linkedPerson || currentUser.name;
        return all.map(a => {
            const myTasks = (a.tasks||[]).filter(t =>
                t.responsable === name || (t.coliders||[]).includes(name) || (t.assignedPeople||[]).includes(name));
            if(!myTasks.length) return null;
            return { ...a, tasks: myTasks };
        }).filter(Boolean);
    }
    return all;
}

function openNewEventModal() {
    if(authLevel < 2) return;
    document.getElementById('new-evt-date').value = todayStr;
    document.getElementById('new-evt-name').value = "";
    document.getElementById('new-event-modal').classList.add('open');
}

function createNewEvent() {
    if(authLevel < 2) return;
    const date = document.getElementById('new-evt-date').value;
    const title = document.getElementById('new-evt-name').value.trim();
    if(!date || !title) { showToast('⚠️ Ingresa fecha y nombre del evento'); return; }
    
    const newId = 'evt_' + Date.now();
    const finalName = formatEventName(title, date);
    
    events.push({id: newId, date, name: finalName, _savedAt: Date.now()});
    activeEventId = newId; 
    document.getElementById('new-event-modal').classList.remove('open');
    afterChange();
    showToast('✅ Nuevo evento creado');
}

function openRenameEventModal() {
    if(authLevel < 2) return;
    if(!activeEventId) return;
    const evt = events.find(e => e.id === activeEventId);

    let baseName = evt.name;
    const match = baseName.match(/^(.*) - \d{2}\/[a-z]+$/i);
    if(match) baseName = match[1];
    
    document.getElementById('rename-evt-name').value = baseName;
    document.getElementById('rename-evt-date').value = evt.date;
    document.getElementById('rename-event-modal').classList.add('open');
}

function submitRenameEvent() {
    if(authLevel < 2) return;
    if(!activeEventId) return;
    const evt = events.find(e => e.id === activeEventId);

    const newTitle = document.getElementById('rename-evt-name').value.trim();
    const newDate  = document.getElementById('rename-evt-date').value;
    if(!newTitle) { showToast('⚠️ Ingresa un título válido'); return; }
    if(!newDate)  { showToast('⚠️ Ingresa una fecha válida'); return; }

    evt.date = newDate;
    evt.name = formatEventName(newTitle, newDate);

    // Sync fecha on all activities that belong to this event
    activities.forEach(a => { if(a.eventId === activeEventId) a.fecha = newDate; });

    document.getElementById('rename-event-modal').classList.remove('open');
    afterChange();
    showToast('✅ Evento actualizado');
}

/* ══════════════════════════ COMPARAR EVENTOS (#15) ══════════════════════════ */
function _eventStats(evId) {
    const acts = activities.filter(a => a.eventId === evId);
    let tasks = 0, done = 0;
    const ppl = new Set();
    const actNames = new Map(); // nombre normalizado → nombre original
    acts.forEach(a => {
        const key = (a.activity||'').trim().toLowerCase();
        if(key) actNames.set(key, a.activity);
        if(a.responsable) ppl.add(a.responsable);
        (a.tasks||[]).forEach(t => {
            if(t.cancelled) return;
            tasks++; if(t.done) done++;
            [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].forEach(n => { if(n) ppl.add(n); });
        });
    });
    return { actsCount: acts.length, tasks, done, pct: tasks ? Math.round(done/tasks*100) : 0, people: ppl, actNames };
}

window.openCompareEvents = function() {
    if(authLevel < 2) return;
    const sorted = events.slice().sort((a,b) => b.date.localeCompare(a.date));
    if(sorted.length < 2) { showToast('⚠️ Necesitas al menos 2 eventos para comparar'); return; }
    const opts = sorted.map(e => `<option value="${e.id}">${esc(e.name)} · ${e.date}</option>`).join('');
    const selA = document.getElementById('cmp-a'), selB = document.getElementById('cmp-b');
    selA.innerHTML = opts; selB.innerHTML = opts;
    selA.value = sorted[0].id;
    selB.value = sorted[1].id;
    _renderEventComparison();
    document.getElementById('cmp-modal').classList.add('open');
};

window._renderEventComparison = function() {
    const aId = document.getElementById('cmp-a')?.value;
    const bId = document.getElementById('cmp-b')?.value;
    const out = document.getElementById('cmp-result');
    if(!out || !aId || !bId) return;
    if(aId === bId) { out.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:.78rem;">Selecciona dos eventos distintos.</div>`; return; }

    const evA = events.find(e => e.id === aId), evB = events.find(e => e.id === bId);
    const sA = _eventStats(aId), sB = _eventStats(bId);

    const kpiRow = (label, va, vb, suffix='') => `
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
            <div style="text-align:right;font-size:.85rem;font-weight:800;color:var(--cyan);">${va}${suffix}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;text-align:center;min-width:90px;">${label}</div>
            <div style="text-align:left;font-size:.85rem;font-weight:800;color:var(--a2);">${vb}${suffix}</div>
        </div>`;

    // Actividades en común vs exclusivas (por nombre)
    const aNames = new Set(sA.actNames.keys()), bNames = new Set(sB.actNames.keys());
    const common = [...aNames].filter(n => bNames.has(n)).map(n => sA.actNames.get(n));
    const onlyA  = [...aNames].filter(n => !bNames.has(n)).map(n => sA.actNames.get(n));
    const onlyB  = [...bNames].filter(n => !aNames.has(n)).map(n => sB.actNames.get(n));

    // Personas en común
    const commonPpl = [...sA.people].filter(n => sB.people.has(n));

    const chips = (arr, color) => arr.length
        ? arr.map(x => `<span style="display:inline-block;font-size:.64rem;padding:2px 8px;margin:2px;border-radius:20px;background:${color}1a;color:${color};border:1px solid ${color}55;">${esc(x)}</span>`).join('')
        : `<span style="font-size:.66rem;color:var(--muted2);">—</span>`;

    out.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;margin-bottom:10px;">
            <div style="text-align:right;font-size:.72rem;font-weight:800;color:var(--cyan);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(evA.name)}</div>
            <div style="font-size:.6rem;color:var(--muted);text-align:center;">vs</div>
            <div style="text-align:left;font-size:.72rem;font-weight:800;color:var(--a2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(evB.name)}</div>
        </div>
        ${kpiRow('Actividades', sA.actsCount, sB.actsCount)}
        ${kpiRow('Tareas', sA.tasks, sB.tasks)}
        ${kpiRow('Completado', sA.pct, sB.pct, '%')}
        ${kpiRow('Personas', sA.people.size, sB.people.size)}

        <div style="margin-top:14px;">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--green);margin-bottom:5px;">🔁 Actividades repetidas (${common.length})</div>
            <div>${chips(common, '#26d07c')}</div>
        </div>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
                <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--cyan);margin-bottom:5px;">Solo en A (${onlyA.length})</div>
                <div>${chips(onlyA, '#20acf4')}</div>
            </div>
            <div>
                <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--a2);margin-bottom:5px;">Solo en B (${onlyB.length})</div>
                <div>${chips(onlyB, '#7c5cff')}</div>
            </div>
        </div>
        <div style="margin-top:14px;">
            <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--amber);margin-bottom:5px;">👥 Personas en ambos (${commonPpl.length})</div>
            <div>${chips(commonPpl, '#ffc600')}</div>
        </div>`;
};

function deleteCurrentEvent() {
    if(!activeEventId) return;

    forceAdminPin(() => {
        customConfirm('¿Eliminar el EVENTO ACTUAL y todas sus actividades permanentemente?', () => {
            activities = activities.filter(a => a.eventId !== activeEventId);
            events = events.filter(e => e.id !== activeEventId);
            activeEventId = null;
            afterChange();
            showToast('🗑 Evento eliminado');
        });
    });
}

