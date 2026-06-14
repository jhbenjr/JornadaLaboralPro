/* ══════════════════════════ CORE LOAD/SAVE ══════════════════════════ */
function genSkills(values) {
    return KNOWN_SKILLS.map((sk, i) => ({ name: sk, rating: values[i] || 0 }));
}

function loadSampleData() {
    events        = [];
    activities    = [];
    people        = [];
    templates     = [];
    users         = [];
    activeEventId = null;
}

function resetToSampleData() {
    if(authLevel < 3) { showToast('⚠️ Solo un administrador puede cargar datos de ejemplo'); return; }
    if(events.length > 0) {
        showToast('⚠️ Ya hay eventos creados. Elimínalos primero para cargar ejemplos.');
        return;
    }
    // NUNCA tocar usuarios ni personas — solo agregar eventos y actividades de ejemplo
    const eid = 'ev_sample1';
    const adminName = users.find(u => (u.level||0) >= 3)?.name || 'Administrador';
    events = [{
        id: eid,
        name: 'Servicio Dominical (Ejemplo)',
        date: new Date().toISOString().slice(0,10),
        type: 'Servicio'
    }];
    activities = [
        {
            id: 'act_s1', eventId: eid,
            activity: 'Alabanza y Adoración',
            responsable: adminName,
            lugar: 'Templo principal',
            horario: '9:00 AM',
            color: 'morado', prioridad: 'Alta',
            tasks: [
                { id: 'ts1', name: 'Preparar lista de canciones', responsable: adminName, assignedPeople: [], done: false, notes: '' },
                { id: 'ts2', name: 'Prueba de sonido', responsable: adminName, assignedPeople: [], done: false, notes: '' }
            ]
        },
        {
            id: 'act_s2', eventId: eid,
            activity: 'Clase Infantil',
            responsable: adminName,
            lugar: 'Salón 3',
            horario: '10:30 AM',
            color: 'cyan', prioridad: 'Normal',
            tasks: [
                { id: 'ts3', name: 'Preparar material didáctico', responsable: adminName, assignedPeople: [], done: false, notes: '' }
            ]
        }
    ];
    activeEventId = eid;
    autoSave();
    afterChange();
    showToast('✅ Datos de ejemplo cargados');
}

function autoSave() {
  _lastSavedAt = Date.now();
  if(!_applyingRemote) {
    _localModifiedAt = _lastSavedAt;
    localStorage.setItem('elim_data_modified_at', _localModifiedAt.toString());
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    activities, events, people, activeEventId, templates, users, teams,
    reminders: _getReminders(), remindersTs: _remindersTs,
    initialized: true
  }));
  // Guardar usuarios en clave separada — sobrevive cualquier sobreescritura de la nube
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if(!_applyingRemote) _scheduleSyncToCloud();
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) {
      loadSampleData();
  } else {
    try {
        const d = JSON.parse(raw); 
        activities = d.activities || []; 
        activities.forEach(a => {
            if(!a.horario && a.horarios && a.horarios.length > 0) {
                a.horario = a.horarios[0];
            }
        });
        events = d.events || [];
        people = (d.people || []).map(p => p.id ? p : { ...p, id: 'p_' + Math.random().toString(36).slice(2,9) });
        activeEventId = d.activeEventId || null;
        templates = d.templates || [];
        users = d.users || [];
        teams = d.teams || [];
        _remindersTs = d.remindersTs || 0;
        _saveReminders((d.reminders || []).filter(r => r.expiresAt > Date.now()));
    } catch(e) {
        loadSampleData();
    }
  }
  // Fusionar siempre con la clave separada de usuarios (sobrevive recargas de nube)
  try {
    const localUsers = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    localUsers.forEach(lu => { if(!users.find(u => u.id === lu.id)) users.push(lu); });
    // Si la clave separada tiene más usuarios, también actualizar STORAGE_KEY
    if(localUsers.length > 0) localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch(e) {}
}
