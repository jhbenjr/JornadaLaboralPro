/* ══════════════════════════ USER SYSTEM ══════════════════════════ */
let users = [];
let currentUser = null;
let loginPendingAction = null; // {reqLevel, onSuccess}
let loginSelectedUserId = null;

const LEVEL_LABELS = ['Invitado', 'Estándar', 'Director / Enlace', 'Administrador'];
const LEVEL_BADGE_CLS = ['um-badge-0', 'um-badge-1', 'um-badge-2', 'um-badge-3'];

/* ── Login Modal ── */
function openLoginModal(pendingReqLevel, pendingSuccess) {
  loginPendingAction = (pendingReqLevel != null) ? { reqLevel: pendingReqLevel, onSuccess: pendingSuccess } : null;
  loginSelectedUserId = null;
  _renderLoginStep1();
  document.getElementById('login-modal').classList.add('open');
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
  loginPendingAction = null;
  loginSelectedUserId = null;
}

function _renderLoginStep1() {
  const body = document.getElementById('login-modal-body');
  const foot = document.getElementById('login-modal-foot');
  document.getElementById('login-modal-title').textContent = '🔐 Iniciar Sesión';

  // Always show username + password form. Admin master uses empty username + PIN.
  body.innerHTML = `
    <div class="login-hero">
      <div class="login-hero-icon">🔐</div>
      <div class="login-hero-title">Bienvenido</div>
      <div class="login-hero-sub">Ingresa tus credenciales para continuar</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div class="ffield">
        <label class="flabel" for="lm-username">Usuario o correo</label>
        <div class="finput-wrap">
          <span class="finput-ico">👤</span>
          <input class="finput" id="lm-username" placeholder="Tu usuario o correo"
            autocomplete="username"
            oninput="_clearLoginError()"
            onkeypress="if(event.key==='Enter'){ const p=document.getElementById('lm-password'); if(p) p.focus(); }" />
        </div>
      </div>
      <div class="ffield" style="text-align:center;">
        <label class="flabel" style="display:block;text-align:left;margin-bottom:6px;">PIN</label>
        ${_pinPadHTML('lm-password', '_submitLogin()', '')}
      </div>
      <div id="lm-error" style="display:none;font-size:.72rem;color:var(--red);text-align:center;padding:2px 0;font-weight:600;"></div>
    </div>`;
  foot.innerHTML = `<button class="btn btn-ghost" onclick="closeLoginModal()">Cancelar</button>`;
  setTimeout(() => { const el = document.getElementById('lm-username'); if(el) el.focus(); }, 80);
}

window._toggleLoginPass = function() {
  const inp = document.getElementById('lm-password');
  const eye = document.getElementById('lm-eye');
  if(!inp) return;
  if(inp.type === 'password') { inp.type = 'text'; if(eye) eye.textContent = '🙈'; }
  else { inp.type = 'password'; if(eye) eye.textContent = '👁'; }
  inp.focus();
};

window._clearLoginError = function() {
  const errEl = document.getElementById('lm-error');
  if(errEl) errEl.style.display = 'none';
};

function _findUser(ql) {
  const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const q = _norm(ql);
  return users.find(x => _norm(x.username) === q)
      || users.find(x => _norm(x.email) === q)
      || users.find(x => _norm(x.name) === q)
      || (() => {
           const p = people.find(px => _norm(px.code) === q || _norm(px.name) === q);
           return p ? users.find(x => x.linkedPerson === p.name || _norm(x.linkedPerson) === _norm(p.name)) : null;
         })();
}

window._submitLogin = async function() {
  const username = (document.getElementById('lm-username').value || '').trim();
  const password = document.getElementById('lm-password').value;
  const errEl = document.getElementById('lm-error');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    const inp = document.getElementById('lm-password');
    if(inp) { inp.value = ''; _refreshPinDots('lm-password'); }
  }

  if(!password) { showErr('Ingresa tu PIN'); return; }

  // Asegurar que users esté cargado (localStorage + USERS_KEY)
  if(users.length === 0) {
    try {
      const saved = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      if(saved.length > 0) users = saved;
    } catch(e) {}
  }

  const inputHash = await _hashPin(password);

  // Admin master: username vacío o "admin" + PIN maestro
  if(!username || username.toLowerCase() === 'admin') {
    let lvl = 0;
    if(inputHash === _HASH_ADMIN) lvl = 3;
    else if(inputHash === _HASH_DIR) lvl = 2;
    if(lvl > 0) {
      authLevel = lvl;
      currentUser = null;
      _editUnlocked = true;
      document.body.classList.add('edit-unlocked');
      _saveSession();
      closeLoginModal();
      updateAuthUI();
      showToast(lvl === 3 ? '🔓 Acceso Total (Admin maestro)' : '🔓 Acceso Director / Enlace');
      if(loginPendingAction && authLevel >= loginPendingAction.reqLevel) loginPendingAction.onSuccess?.();
      loginPendingAction = null;
      showUpcomingPanel();
      return;
    }
    showErr('Credenciales incorrectas');
    return;
  }

  let u = _findUser(username);

  // Si no se encontró, intentar recargar desde Supabase (puede que la nube no había cargado aún)
  if(!u && navigator.onLine) {
    showErr('Buscando…');
    try {
      const rows = await _supaFetch('GET', 'dashboard_state?id=eq.current&select=data');
      if(rows?.[0]?.data?.users?.length) {
        const cloudUsers = rows[0].data.users;
        cloudUsers.forEach(cu => { if(!users.find(lu => lu.id === cu.id)) users.push(cu); });
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        u = _findUser(username);
      }
    } catch(e) {}
  }

  if(!u) { showErr('Usuario o correo no encontrado'); return; }

  const pinOk = inputHash === u.pin || (u.pin.length < 64 && password === u.pin);
  if(!pinOk) { showErr('Contraseña incorrecta'); return; }
  // Migración: si el PIN estaba en texto plano, guardarlo hasheado
  if(u.pin.length < 64) { u.pin = inputHash; autoSave(); }
  _doLogin(u);
};

function _saveSession() {
  localStorage.setItem('elim_session', JSON.stringify({ authLevel, currentUserId: currentUser?.id || null, tab: currentTab }));
}

function _doLogin(u) {
  authLevel = u.level;
  currentUser = u;
  _saveSession();
  updateAuthUI();
  if(authLevel >= 2) { _editUnlocked = true; document.body.classList.add('edit-unlocked'); }
  _updateSWState();
  _logAccess('login');
  if(window._checkMaintenanceMode) _checkMaintenanceMode();
  setTimeout(() => { if(typeof _checkSelfAttendancePrompt === 'function') _checkSelfAttendancePrompt(); }, 2000);
  showUpcomingPanel(true); // renderiza bienvenida en el mismo modal, no cerrar antes
  showToast(`👋 Bienvenido, ${u.name}!`);
  _notifyNewReminders();
  if(loginPendingAction && authLevel >= loginPendingAction.reqLevel) {
    loginPendingAction.onSuccess?.();
    loginPendingAction = null;
  } else {
    loginPendingAction = null;
  }
  performSwitchTab(currentTab);
  afterChange();
}

function logoutUser() {
  _logAccess('logout');
  currentUser = null;
  authLevel = 0;
  localStorage.removeItem('elim_session');
  updateAuthUI();
  if(currentTab === 'people' || currentTab === 'evals' || currentTab === 'byp' || currentTab === 'teams') switchTab('acts');
  afterChange();
  openLoginModal();
}

/* ── User Management ── */
function openUserMgmt() {
  renderUserMgmt();
  document.getElementById('user-edit-form').style.display = 'none';
  document.getElementById('user-mgmt-modal').classList.add('open');
}

function renderUserMgmt() {
  const list = document.getElementById('user-mgmt-list');
  if(!users.length) {
    list.innerHTML = `<div style="text-align:center;padding:20px;font-size:.78rem;color:var(--muted2);">
      No hay usuarios creados. Haz clic en <b>+ Nuevo Usuario</b> para empezar.
    </div>`;
    return;
  }
  // Ordenar por nivel descendente (Admin primero) y luego por nombre
  const sorted = [...users].sort((a,b) => (b.level||1)-(a.level||1) || (a.name||'').localeCompare(b.name||''));
  list.innerHTML = `<div class="um-grid">` + sorted.map(u => {
    const pObj = u.linkedPerson ? people.find(p => p.name === u.linkedPerson) : null;
    const avStyle = pObj?.photo ? `background-image:url(${pObj.photo});background-size:cover;background-color:transparent;color:transparent;font-size:0;` : `background:${avc(u.name)}`;
    const avContent = pObj?.photo ? '' : ini(u.name);
    const isSelf = currentUser?.id === u.id;
    const badgeCls = LEVEL_BADGE_CLS[u.level]||'um-badge-0';
    const badgeLbl = LEVEL_LABELS[u.level]||'Lectura';
    const cargoLine = (() => {
      if(!pObj) return '';
      const c1 = pObj.cargos?.[0];
      return c1 ? `<div style="font-size:.58rem;color:var(--cyan);font-weight:700;">${esc(c1.role)}${c1.area?` · ${esc(c1.area)}`:''}</div>` : '';
    })();
    return `<div class="um-card">
      <div class="um-card-av" style="${avStyle}">${avContent}</div>
      <div class="um-card-name">${esc(u.name)}${isSelf?' <span style="font-size:.55rem;color:var(--cyan);">● Tú</span>':''}</div>
      ${cargoLine}
      <span class="um-badge ${badgeCls}" style="font-size:.55rem;">${badgeLbl}</span>
      <div class="um-card-meta">
        ${u.username ? `👤 ${esc(u.username)}` : '<span style="color:var(--amber);">⚠️ sin usuario</span>'}
        ${u.email ? `<br>✉️ ${esc(u.email)}` : ''}
      </div>
      <div class="um-card-actions">
        <button class="btn btn-ghost" style="font-size:.6rem;padding:3px 9px;" onclick="openUserForm('${u.id}')">✏️</button>
        <button class="btn btn-danger" style="font-size:.6rem;padding:3px 8px;${isSelf?'opacity:.3;pointer-events:none;':''}" onclick="deleteUser('${u.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

window._ufSyncFromPerson = function() {
  const sel = document.getElementById('uf-linked');
  const pName = sel?.value || '';
  const pObj = pName ? people.find(p => p.name === pName) : null;
  const nameEl = document.getElementById('uf-name');
  const emailEl = document.getElementById('uf-email');
  const userEl = document.getElementById('uf-username');
  const hint = document.getElementById('uf-linked-hint');
  if(pObj) {
    const dn = window._getDisplayName ? _getDisplayName(pObj) : pObj.name;
    nameEl.value = dn;
    nameEl.readOnly = true; nameEl.style.opacity='.6';
    if(pObj.email) { emailEl.value = pObj.email; emailEl.readOnly = true; emailEl.style.opacity='.6'; }
    else { emailEl.readOnly = false; emailEl.style.opacity=''; }
    if(pObj.username) { userEl.value = pObj.username; userEl.readOnly = true; userEl.style.opacity='.6'; }
    else { userEl.readOnly = false; userEl.style.opacity=''; }
    if(hint) hint.textContent = '🔒 Nombre, correo y usuario se sincronizan desde el perfil';
  } else {
    nameEl.readOnly = false; nameEl.style.opacity='';
    emailEl.readOnly = false; emailEl.style.opacity='';
    userEl.readOnly = false; userEl.style.opacity='';
    if(hint) hint.textContent = '';
  }
};

window.openUserForm = function(id, presetName, presetEmail) {
  const u = id ? users.find(x => x.id === id) : null;
  const form = document.getElementById('user-edit-form');
  const linkedVal = u?.linkedPerson || presetName || '';
  const pLinked = linkedVal ? people.find(p => p.name === linkedVal) : null;
  const hasLinked = !!pLinked;
  const displayName = hasLinked ? (window._getDisplayName ? _getDisplayName(pLinked) : pLinked.name) : (u?.name || presetName || '');
  const displayEmail = hasLinked ? (pLinked.email || u?.email || presetEmail || '') : (u?.email || presetEmail || '');
  const displayUsername = hasLinked ? (pLinked.username || u?.username || '') : (u?.username || '');
  const ro = hasLinked ? 'readonly style="opacity:.6"' : '';
  const roEmail = (hasLinked && pLinked.email) ? 'readonly style="opacity:.6"' : '';
  const roUser = (hasLinked && pLinked.username) ? 'readonly style="opacity:.6"' : '';
  const peopleOpts = people.filter(p => !p.archived).map(p => `<option value="${esc(p.name)}" ${linkedVal===p.name?'selected':''}>${esc(p.name)}</option>`).join('');

  form.innerHTML = `
    <div style="font-family:'Nunito',sans-serif;font-size:.8rem;font-weight:800;margin-bottom:12px;color:var(--a2);">
      ${u ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
    </div>
    <input type="hidden" id="uf-id" value="${u?.id||''}">
    <div style="margin-bottom:10px;">
      <label class="flabel">Vincular a persona</label>
      <select class="finput" id="uf-linked" onchange="_ufSyncFromPerson()">
        <option value="">— Sin vincular —</option>
        ${peopleOpts}
      </select>
      <div id="uf-linked-hint" style="font-size:.6rem;color:var(--cyan);margin-top:3px;">${hasLinked?'🔒 Nombre, correo y usuario se sincronizan desde el perfil':''}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div>
        <label class="flabel">Nombre para mostrar</label>
        <input class="finput" id="uf-name" placeholder="Ej: Juan Pérez" value="${esc(displayName)}" ${ro} />
      </div>
      <div>
        <label class="flabel">Usuario (para ingresar)</label>
        <input class="finput" id="uf-username" placeholder="Ej: jperez" value="${esc(displayUsername)}" ${roUser} autocomplete="off" autocapitalize="none" />
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <label class="flabel">Correo electrónico (también sirve para ingresar)</label>
      <input class="finput" id="uf-email" type="email" placeholder="Ej: jperez@correo.com" value="${esc(displayEmail)}" ${roEmail} autocomplete="off" autocapitalize="none" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div>
        <label class="flabel">PIN de acceso</label>
        <input class="finput" id="uf-pin" type="password" placeholder="${u?'(dejar vacío = sin cambio)':'Ej: 1234'}" autocomplete="new-password" />
      </div>
      <div>
        <label class="flabel">Nivel de acceso</label>
        <select class="finput" id="uf-level">
          <option value="1" ${(u?.level||1)===1?'selected':''}>1 — Estándar (solo ver)</option>
          <option value="2" ${u?.level===2?'selected':''}>2 — Director / Enlace (editar tareas)</option>
          <option value="3" ${u?.level===3?'selected':''}>3 — Administrador (acceso total)</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="document.getElementById('user-edit-form').style.display='none'">Cancelar</button>
      <button class="btn btn-add" onclick="saveUserForm()">💾 Guardar</button>
    </div>`;
  form.style.display = 'block';
  setTimeout(() => form.scrollIntoView({behavior:'smooth',block:'nearest'}), 50);
};

window.saveUserForm = async function() {
  const id       = document.getElementById('uf-id').value;
  const linked   = document.getElementById('uf-linked').value;
  const pLinked  = linked ? people.find(p => p.name === linked) : null;
  // Si hay persona vinculada, nombre/correo/usuario vienen del perfil
  const name     = pLinked ? (window._getDisplayName ? _getDisplayName(pLinked) : pLinked.name) : document.getElementById('uf-name').value.trim();
  const username = (pLinked?.username) ? pLinked.username : document.getElementById('uf-username').value.trim();
  const email    = (pLinked?.email) ? pLinked.email : document.getElementById('uf-email').value.trim();
  const pinV     = document.getElementById('uf-pin').value;
  const level    = parseInt(document.getElementById('uf-level').value);

  if(!name) { showToast('⚠️ Ingresa un nombre para mostrar'); return; }
  if(!username) { showToast('⚠️ Ingresa un nombre de usuario'); return; }
  if(/\s/.test(username)) { showToast('⚠️ El usuario no debe contener espacios'); return; }
  if(username.toLowerCase() === 'admin') { showToast('⚠️ "admin" está reservado para el acceso maestro'); return; }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('⚠️ El correo electrónico no es válido'); return; }

  const dupUser = users.find(u => (u.username||'').toLowerCase() === username.toLowerCase() && u.id !== id);
  if(dupUser) { showToast('⚠️ Ese nombre de usuario ya está en uso'); return; }
  if(email) {
    const dupEmail = users.find(u => (u.email||'').toLowerCase() === email.toLowerCase() && u.id !== id);
    if(dupEmail) { showToast('⚠️ Ese correo electrónico ya está en uso'); return; }
  }

  const hashedPin = pinV ? await _hashPin(pinV) : null;

  const linkedName = linked || name;
  if(id) {
    const u = users.find(x => x.id === id);
    if(u) {
      u.name = name;
      u.username = username;
      u.email = email || null;
      if(hashedPin) u.pin = hashedPin;
      u.level = level;
      u.linkedPerson = linked || null;
      if(currentUser?.id === id) { currentUser = u; authLevel = u.level; updateAuthUI(); }
    }
  } else {
    if(!pinV) { showToast('⚠️ El PIN es obligatorio para usuarios nuevos'); return; }
    users.push({ id: 'usr_'+Date.now().toString(36), name, username, email: email || null, pin: hashedPin, level, linkedPerson: linked || null });
  }
  // Sincronizar correo con la persona vinculada en el directorio
  if(email && typeof people !== 'undefined') {
    const pObj = people.find(p => p.name === linked || p.name === name);
    if(pObj) pObj.email = email;
  }

  afterChange();
  renderUserMgmt();
  document.getElementById('user-edit-form').style.display = 'none';
  showToast(`✅ Usuario "${name}" guardado`);
};

window.deleteUser = function(id) {
  if(currentUser?.id === id) { showToast('⚠️ No puedes eliminar tu propia cuenta'); return; }
  const u = users.find(x => x.id === id);
  if(!u) return;
  customConfirm(`¿Eliminar al usuario "${u.name}"?`, () => {
    users = users.filter(x => x.id !== id);
    afterChange(); // guarda localmente Y sincroniza a la nube
    renderUserMgmt();
    showToast('🗑 Usuario eliminado');
  });
};

/* ── My Summary — abre #summary-modal ── */
window.showMyProfile = function() {
  showMySummary();
};

function showMySummary() {
  if(!currentUser && authLevel === 0) { openLoginModal(); return; }
  // Admins autenticados por PIN maestro (sin cuenta de usuario) también pueden ver el resumen
  if(!currentUser && authLevel >= 2) {
    const body = document.getElementById('resumen-modal-body');
    const title = document.getElementById('resumen-modal-title');
    if(title) title.textContent = '📋 Resumen del Evento';
    if(body) {
      // Solo mostrar resumen del evento activo para admins sin cuenta vinculada
      const activeEvt = events.find(e => e.id === activeEventId);
      if(!activeEvt) { body.innerHTML = `<div class="upc-empty">Sin evento activo seleccionado.</div>`; }
      else {
        const now = new Date();
        let cards = '';
        getActiveActivities().forEach(a => {
          (a.tasks||[]).forEach(t => {
            if(t.done||t.cancelled) return;
            const endDT = a.fecha&&t.fin ? new Date(`${a.fecha}T${t.fin}`) : null;
            const startDT = a.fecha&&t.inicio ? new Date(`${a.fecha}T${t.inicio}`) : null;
            let st = '', color = 'var(--muted)';
            if(endDT&&endDT<now){ st='Vencida'; color='var(--red)'; }
            else if(startDT&&endDT&&startDT<=now&&now<=endDT){ st='En curso'; color='var(--amber)'; }
            else { st='Próxima'; color='var(--green)'; }
            cards += `<div class="smr-live-card"><div class="smr-live-hdr"><span style="color:${color}">●</span> ${esc(t.name)}</div><div class="smr-live-sub">${esc(a.activity)} · ${t.responsable?esc(_dn(t.responsable)):'Sin líder'}${t.inicio?' · ⏰ '+t.inicio:''}</div></div>`;
          });
        });
        body.innerHTML = `<div class="smr-section-title">⚡ ${esc(activeEvt.name)}</div>${cards||'<div class="upc-empty">Sin tareas activas.</div>'}`;
      }
    }
    document.getElementById('resumen-modal').classList.add('open');
    return;
  }
  const body  = document.getElementById('resumen-modal-body');
  const title = document.getElementById('resumen-modal-title');
  const foot  = document.getElementById('resumen-modal-foot');
  if(!body) return;

  const name = currentUser.linkedPerson || currentUser.name;
  const firstName = currentUser.name.split(' ')[0];
  const pObj = people.find(p => p.name === name);
  const now  = new Date();
  const today = new Date(); today.setHours(0,0,0,0);
  const in7   = new Date(today); in7.setDate(today.getDate()+7); in7.setHours(23,59,59,999);
  const ago3  = new Date(today); ago3.setDate(today.getDate()-3);
  const fmt   = d => d.toLocaleDateString('es-SV',{day:'numeric',month:'short'});
  const DAYS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  // KPIs
  let futuras=0, completadas3d=0, pendientesHist=0;
  activities.forEach(a => {
    const evt = events.find(e => e.id === a.eventId);
    const d   = (evt?.date||a.fecha) ? new Date((evt?.date||a.fecha)+'T12:00:00') : null;
    (a.tasks||[]).forEach(t => {
      const assigned = t.responsable===name||(t.assignedPeople||[]).includes(name)||(t.coliders||[]).includes(name);
      if(!assigned||t.cancelled) return;
      if(t.done){ if(d&&d>=ago3) completadas3d++; }
      else if(d&&d>=today&&d<=in7) futuras++;
      else if(d&&d<today) pendientesHist++;
    });
  });

  // Lista próximos 7 días
  const upcoming = _getUpcomingTasks();
  const listHTML = upcoming.length===0
    ? `<div class="upc-empty">✅ Sin asignaciones pendientes esta semana</div>`
    : upcoming.map(({t,a,evt,isLead,date}) => {
        const isToday = date.toDateString()===today.toDateString();
        const role = isLead?'<span class="upc-role lead">👑 Líder</span>':'<span class="upc-role support">👥 Apoyo</span>';
        const myRsvp = t.rsvp?.[name];
        const rsvpHTML = isToday ? '' : (myRsvp?.status === 'confirmed'
          ? `<div class="upc-rsvp"><span class="rsvp-badge rsvp-confirmed">✅ Confirmado</span><button class="rsvp-btn rsvp-change" onclick="setRSVP('${a.id}','${t.id}','${name}','declined')">❌ No podré</button></div>`
          : myRsvp?.status === 'declined'
          ? `<div class="upc-rsvp"><span class="rsvp-badge rsvp-declined">❌ No podré asistir</span><button class="rsvp-btn rsvp-change" onclick="setRSVP('${a.id}','${t.id}','${name}','confirmed')">✅ Asistiré</button></div>`
          : `<div class="upc-rsvp"><button class="rsvp-btn rsvp-yes" onclick="setRSVP('${a.id}','${t.id}','${name}','confirmed')">✅ Asistiré</button><button class="rsvp-btn rsvp-no" onclick="setRSVP('${a.id}','${t.id}','${name}','declined')">❌ No podré</button></div>`);
        return `<div class="upc-item"${isToday?' style="border-color:var(--cyan);"':''}>
          <div class="upc-date-col"><div class="upc-day">${date.getDate()}</div><div class="upc-dow">${DAYS[date.getDay()]}</div></div>
          <div class="upc-info">
            <div class="upc-task">${esc(t.name)}</div>
            <div class="upc-act">${esc(a.activity)}${evt?.name?' · '+esc(evt.name):''}</div>
            ${role}${t.inicio?`<span style="font-size:.6rem;color:var(--muted);margin-left:4px;">⏰ ${t.inicio}</span>`:''}
            ${rsvpHTML}
          </div>
        </div>`;
      }).join('');

  // Para admins: resumen del evento activo (En Vivo)
  let liveHTML = '';
  if(authLevel >= 3) {
    const activeEvt = events.find(e => e.id === activeEventId);
    if(activeEvt) {
      const overdue=[], active=[], upcoming2=[];
      getActiveActivities().forEach(a => {
        (a.tasks||[]).forEach(t => {
          if(t.done||t.cancelled) return;
          const startDT = a.fecha&&t.inicio ? new Date(`${a.fecha}T${t.inicio}`) : null;
          const endDT   = a.fecha&&t.fin   ? new Date(`${a.fecha}T${t.fin}`)   : null;
          const item = {a,t,startDT,endDT};
          if(endDT&&endDT<now) overdue.push(item);
          else if(startDT&&endDT&&startDT<=now&&now<=endDT) active.push(item);
          else if(startDT&&startDT>now&&(startDT-now)<=2*3600000) upcoming2.push(item);
        });
      });
      const liveCard = (items, label, color) => items.length===0?'':
        `<div class="smr-section-title" style="color:${color}">${label} (${items.length})</div>`+
        items.slice(0,5).map(({a,t,startDT,endDT})=>`
          <div class="smr-live-card">
            <div class="smr-live-hdr"><span style="color:${color}">●</span> ${esc(t.name)}</div>
            <div class="smr-live-sub">${esc(a.activity)} · ${t.responsable||'Sin líder'}${t.inicio?' · ⏰ '+t.inicio+(t.fin?' → '+t.fin:''):''}</div>
          </div>`).join('');
      liveHTML = `
        <div class="smr-section-title">⚡ En Vivo — ${esc(activeEvt.name)}</div>
        ${liveCard(active,'🟡 En curso','var(--amber)')}
        ${liveCard(overdue,'🔴 Vencidas','var(--red)')}
        ${liveCard(upcoming2,'🟢 Próximas','var(--green)')}
        ${active.length+overdue.length+upcoming2.length===0?'<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:8px;">Sin tareas activas en este momento</div>':''}`;
    }
  }

  const hour = now.getHours();
  const greeting = hour<12?'Buenos días':hour<18?'Buenas tardes':'Buenas noches';
  // Saludo especial el día del cumpleaños (y hasta 2 días después) — fecha El Salvador UTC-6
  let isBday = false;
  if(pObj?.dob) {
    const dp = pObj.dob.split('-').map(Number);
    const [ty, tmo, tdd] = _svDateParts();
    const diffPast = Math.round((Date.UTC(ty, tmo-1, tdd) - Date.UTC(ty, dp[1]-1, dp[2])) / 86400000);
    isBday = diffPast >= 0 && diffPast <= 2;
  }
  if(title) {
    if(isBday) {
      title.innerHTML = `🎉🎂 ¡Feliz cumpleaños, ${esc(firstName)}! 🥳🎈🎁
        <div style="font-size:.7rem;font-weight:600;opacity:.92;margin-top:3px;line-height:1.4;">
          El equipo de Comunicaciones de Iglesia Infantil te desea muchas felicidades en este nuevo año de vida ✨🙌🙏</div>`;
    } else {
      title.textContent = `👋 ${greeting}, ${firstName}`;
    }
  }

  // ── Perfil de la persona vinculada ──
  let profileHTML = '';
  if(pObj) {
    const sex = pObj.sex || 'Masculino';
    const avStyle = pObj.photo
      ? `background-image:url(${pObj.photo});background-size:cover;background-color:transparent;`
      : `background:${avc(pObj.name)};`;
    const avContent = pObj.photo ? '' : ini(pObj.name);
    const age = _getAge(pObj.dob);
    const firstCargoRole = (pObj.cargos||[]).filter(c=>c.role)[0]?.role || '';
    const firstCargoRoleG = firstCargoRole ? formatGender(firstCargoRole, sex) : '';
    // Solo mostrar categoría si no duplica el cargo principal
    const BASE_ROLES = ['Servidor','Servidora','Colaborador','Colaboradora'];
    const showCat = pObj.type && !(BASE_ROLES.includes(firstCargoRole));
    const catLabel = showCat ? formatGender(pObj.type, sex) : '';
    const cargosHTML = (pObj.cargos||[]).filter(c=>c.role).map(c => {
      let txt = formatGender(c.role, sex);
      if(c.area) txt += ` de ${esc(c.area)}`;
      return `<span style="font-size:.7rem;font-weight:600;color:var(--cyan);">${txt}</span>`;
    }).join('<span style="color:var(--border);margin:0 4px;">|</span>');
    const scheds = (pObj.schedules||[]);
    const distScheds = [
      pObj.district,
      ...(scheds.length ? scheds : ['Sin horario definido'])
    ].filter(Boolean);
    const locationLine = `<span style="font-size:.65rem;color:var(--muted);">📍 ${esc(pObj.district||'Sin distrito')}${scheds.length ? '  ·  ' + scheds.join(' · ') : ''}</span>`;
    profileHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;background:var(--s1);border:1px solid var(--border);border-radius:var(--rsm);padding:14px;margin-bottom:14px;">
        <div style="width:56px;height:56px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Nunito',sans-serif;font-weight:800;font-size:1.3rem;${avStyle}border:2px solid #4a25aa;">${avContent}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Nunito',sans-serif;font-weight:800;font-size:.92rem;line-height:1.2;">${esc(pObj.name)}</div>
          ${pObj.code ? `<div style="font-size:.63rem;color:var(--muted);font-weight:600;letter-spacing:.04em;margin-top:1px;">${esc(pObj.code)}</div>` : ''}
          <div style="font-size:.68rem;color:var(--muted);margin-top:4px;">${age!==null?age+' años':''}${catLabel?' · '+catLabel:''}</div>
          ${cargosHTML ? `<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;">${cargosHTML}</div>` : ''}
          <div style="margin-top:6px;">${locationLine}</div>
        </div>
      </div>`;
  }

  const kpisHTML = `<div class="wlc-kpis">
      <div class="wlc-kpi"><div class="wlc-kpi-val" style="color:var(--cyan)">${futuras}</div><div class="wlc-kpi-lbl">Asignadas<br>próx. 7 días</div></div>
      <div class="wlc-kpi"><div class="wlc-kpi-val" style="color:var(--green)">${completadas3d}</div><div class="wlc-kpi-lbl">Completadas<br>últ. 3 días</div></div>
      <div class="wlc-kpi" style="${pendientesHist>0?'border-color:rgba(251,99,126,.4);background:rgba(251,99,126,.06);':''}"><div class="wlc-kpi-val" style="color:${pendientesHist>0?'var(--red)':'var(--muted)'}">${pendientesHist}</div><div class="wlc-kpi-lbl">Pendientes<br>históricas</div></div>
    </div>`;

  // ── Mensajes importantes ──
  const myReminders = _getMyReminders();
  const remindersHTML = myReminders.length ? `
    <div class="smr-section-title" style="color:var(--cyan);">💬 Mensajes Importantes (${myReminders.length})</div>
    ${myReminders.map(r => {
      const daysLeft = Math.ceil((r.expiresAt - Date.now()) / 86400000);
      return `<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 12px;background:rgba(32,172,244,.07);border:1px solid rgba(32,172,244,.22);border-left:3px solid var(--cyan);border-radius:var(--rsm);margin-bottom:6px;">
        <span style="font-size:1rem;flex-shrink:0;">💬</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.74rem;line-height:1.45;">${esc(r.message)}</div>
          <div style="font-size:.61rem;color:var(--muted);margin-top:3px;">De: ${esc(r.createdBy||'Admin')} · vence en ${daysLeft} día${daysLeft!==1?'s':''}</div>
        </div>
      </div>`;
    }).join('')}` : '';

  body.innerHTML = `
    ${profileHTML}
    ${remindersHTML}
    <div class="smr-section-title">Próximos 7 días · ${fmt(today)} – ${fmt(in7)}</div>
    ${kpisHTML}
    <div class="wlc-list" style="max-height:220px;overflow-y:auto;margin:0 -4px;">${listHTML}</div>
    ${liveHTML}`;

  if(foot) foot.innerHTML = `<button class="btn btn-add" onclick="document.getElementById('resumen-modal').classList.remove('open')">Cerrar</button>`;
  document.getElementById('resumen-modal').classList.add('open');
  _markNotifsRead();
}

/* ── My Summary (viejo, por compatibilidad con referencias antiguas) ── */
function _showMySummaryLegacy() {
  const user = currentUser;
  if(!user) return;
  const searchName = user.linkedPerson || user.name;
  const now = new Date();

  function taskStatus(a, t) {
    if(t.cancelled) return 'cancelled';
    if(t.done) return 'done';
    const end   = a.fecha && t.fin   ? new Date(`${a.fecha}T${t.fin}`)   : null;
    const start = a.fecha && t.inicio ? new Date(`${a.fecha}T${t.inicio}`) : null;
    if(end && end < now) return 'overdue';
    if(start && end && start <= now && now <= end) return 'active';
    return 'upcoming';
  }

  // Solo tareas pendientes (no done, no overdue pasadas de eventos ya terminados)
  // Incluir overdue solo si el evento es hoy o futuro (aún relevante)
  const byEvent = {};
  activities.forEach(a => {
    const evt = events.find(e => e.id === a.eventId);
    if(!evt) return;
    const evtDate = evt.date || '';
    const evtIsFuture = evtDate >= todayStr; // hoy o futuro
    (a.tasks||[]).forEach(t => {
      const involved = [...new Set([t.responsable, ...(t.assignedPeople||[])].filter(Boolean))];
      if(!involved.includes(searchName)) return;
      const status = taskStatus(a, t);
      // Excluir: canceladas, completadas y vencidas en eventos pasados
      if(status === 'cancelled') return;
      if(status === 'done') return;
      if(status === 'overdue' && !evtIsFuture) return;
      if(!byEvent[a.eventId]) byEvent[a.eventId] = [];
      byEvent[a.eventId].push({a, t, status});
    });
  });

  const eventIds = Object.keys(byEvent);

  // Contar stats sobre TODAS las tareas asignadas (incluyendo done) para contexto
  let totalAssigned = 0, totalDone = 0;
  activities.forEach(a => {
    (a.tasks||[]).forEach(t => {
      const involved = [...new Set([t.responsable, ...(t.assignedPeople||[])].filter(Boolean))];
      if(!involved.includes(searchName)) return;
      if(t.cancelled) return;
      totalAssigned++;
      if(t.done) totalDone++;
    });
  });
  const pendingCount = eventIds.reduce((s,id) => s + byEvent[id].length, 0);

  if(!pendingCount) {
    document.getElementById('my-summary-title').textContent = `👋 Hola, ${user.name}`;
    document.getElementById('my-summary-body').innerHTML = `<div class="ms-empty">
      <div style="font-size:2rem;margin-bottom:8px;">🎉</div>
      <div style="font-weight:700;margin-bottom:6px;">¡Todo al día!</div>
      No tienes tareas pendientes próximas.
      ${totalDone > 0 ? `<div style="margin-top:10px;font-size:.65rem;color:var(--muted);">${totalDone} tarea${totalDone!==1?'s':''} completada${totalDone!==1?'s':''} en total</div>` : ''}
    </div>`;
    document.getElementById('my-summary-modal').classList.add('open');
    return;
  }

  // Ordenar eventos: activo primero, luego por fecha ascendente (los más próximos primero)
  const sortedEvtIds = eventIds.sort((a,b) => {
    if(a === activeEventId) return -1;
    if(b === activeEventId) return 1;
    const ea = events.find(e => e.id === a);
    const eb = events.find(e => e.id === b);
    return (ea?.date||'').localeCompare(eb?.date||'');
  });

  function dotCls(status) {
    return { active:'dot-active', overdue:'dot-overdue', upcoming:'dot-pending' }[status] || 'dot-pending';
  }
  function statusLabel(status, a, t) {
    if(status === 'active') return `<span style="font-size:.6rem;color:var(--amber);font-weight:800;">● EN CURSO</span>`;
    if(status === 'overdue') return `<span style="font-size:.6rem;color:var(--red);font-weight:800;">● PENDIENTE</span>`;
    return '';
  }

  const sectionsHTML = sortedEvtIds.map(evtId => {
    const evt = events.find(e => e.id === evtId);
    if(!evt) return '';
    const items = byEvent[evtId];
    // Ordenar: active primero, luego upcoming por hora
    items.sort((x,y) => {
      const order = {active:0, overdue:1, upcoming:2};
      if(order[x.status] !== order[y.status]) return order[x.status] - order[y.status];
      return (x.t.inicio||'').localeCompare(y.t.inicio||'');
    });

    const tasksHTML = items.map(({a,t,status}) => `
      <div class="ms-task-row">
        <div class="ms-task-dot ${dotCls(status)}"></div>
        <div class="ms-task-info">
          <div class="ms-task-name">${esc(t.name)} ${statusLabel(status,a,t)}</div>
          <div class="ms-task-sub">
            ${esc(a.activity)}
            ${t.inicio ? ' · ' + t.inicio + (t.fin ? ' → ' + t.fin : '') : ''}
            ${t.responsable === searchName ? ' · <b style="color:var(--amber)">👑 Líder</b>' : ''}
          </div>
        </div>
      </div>`).join('');

    const evtLabel = evtId === activeEventId ? '⚡ ' : (evt.date > todayStr ? '📅 ' : '');
    return `<div class="ms-event-hdr">${evtLabel}${esc(evt.name)}
      <span style="font-size:.58rem;color:var(--muted);font-weight:500;margin-left:6px;">${formatDateStr(evt.date)}</span>
    </div>${tasksHTML}`;
  }).join('');

  document.getElementById('my-summary-title').textContent = `👋 Hola, ${user.name}`;
  document.getElementById('my-summary-body').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
      <div class="sum-stat"><div class="sum-stat-val cv-cyan">${totalAssigned}</div><div class="sum-stat-lbl">Asignadas</div></div>
      <div class="sum-stat"><div class="sum-stat-val cv-green">${totalDone}</div><div class="sum-stat-lbl">Completadas</div></div>
      <div class="sum-stat"><div class="sum-stat-val cv-amber">${pendingCount}</div><div class="sum-stat-lbl">Pendientes</div></div>
    </div>
    ${sectionsHTML}`;
  document.getElementById('my-summary-modal').classList.add('open');
}

/* ══════════════════════════ PIN AUTHENTICATION ══════════════════════════ */
let authLevel = 0; // 0: Invitado · 1: Estándar · 2: Director/Enlace · 3: Admin
let _editUnlocked = false; // edición siempre bloqueada por defecto independiente del nivel de sesión
let pendingAction = null;

function _openPinModal(hint) {
    const container = document.getElementById('pin-pad-container');
    if(container) container.innerHTML = _pinPadHTML('pin-input', 'verifyPin()', hint || 'Ingresa el PIN para continuar');
    const errEl = document.getElementById('pin-err');
    if(errEl) errEl.textContent = '';
    document.getElementById('pin-modal').classList.add('open');
    setTimeout(() => document.getElementById('pin-input')?.focus(), 80);
}

function requestPin(reqLevel, onSuccess) {
    if(authLevel >= reqLevel) {
        if(onSuccess) onSuccess();
    } else if(users.length > 0) {
        openLoginModal(reqLevel, onSuccess);
    } else {
        pendingAction = { reqLevel, onSuccess };
        _openPinModal();
    }
}

/* Exige PIN de admin para borrar — salvo que ya seas admin (acceso total) */
function forceAdminPin(onSuccess) {
    // Un administrador autenticado tiene acceso total: sin re-pedir PIN
    if(authLevel >= 3) { onSuccess?.(); return; }
    pendingAction = { reqLevel: 3, onSuccess, forceVerify: true };
    const title = document.getElementById('pin-modal-title');
    if(title) title.textContent = '🔐 Confirma PIN de administrador';
    _openPinModal('PIN de cualquier administrador');
}

window.verifyPin = async function() {
    const pin = (document.getElementById('pin-input')?.value || '').trim();
    const errEl = document.getElementById('pin-err');
    function showErr(msg) {
        if(errEl) errEl.textContent = msg;
        const inp = document.getElementById('pin-input');
        if(inp) { inp.value = ''; _refreshPinDots('pin-input'); }
    }

    const inputHash = await _hashPin(pin);

    // Modo verificación forzada (borrado — solo admins)
    if(pendingAction?.forceVerify) {
        const isAdmin = inputHash === _HASH_ADMIN ||
            users.filter(u => (u.level||0) >= 3).some(u =>
                u.pin.length >= 64 ? u.pin === inputHash : u.pin === pin
            );
        if(isAdmin) {
            const cb = pendingAction.onSuccess;
            closePinModal();
            cb?.();
        } else { showErr('❌ PIN de administrador incorrecto'); }
        return;
    }

    let newLvl = authLevel;
    if(inputHash === _HASH_ADMIN) newLvl = 3;
    else if(inputHash === _HASH_DIR) newLvl = Math.max(authLevel, 2);
    else {
        // Verificar PINs de usuarios nivel >= 2 (con soporte de migración)
        const match = users.find(u => (u.level||0) >= 2 &&
            (u.pin === inputHash || (u.pin.length < 64 && u.pin === pin))
        );
        if(match) {
            newLvl = Math.max(authLevel, match.level);
            if(match.pin.length < 64) { match.pin = inputHash; autoSave(); }
        }
    }

    if (newLvl >= (pendingAction ? pendingAction.reqLevel : 1)) {
        authLevel = newLvl;
        closePinModal();
        updateAuthUI();
        if(authLevel >= 2) { _editUnlocked = true; document.body.classList.add('edit-unlocked'); }
        showToast(authLevel === 3 ? '🔓 Acceso Total Concedido' : '🔓 Acceso Director / Enlace');
        if(pendingAction?.onSuccess) pendingAction.onSuccess();
    } else if (newLvl > authLevel) {
        authLevel = newLvl;
        updateAuthUI();
        showErr('⚠️ Nivel insuficiente para esta acción');
    } else {
        showErr('❌ PIN incorrecto');
    }
}

window.closePinModal = function() {
    document.getElementById('pin-modal').classList.remove('open');
    pendingAction = null;
    const title = document.getElementById('pin-modal-title');
    if(title) title.textContent = '🔐 Acceso Restringido';
}

function updateAuthUI() {
    document.body.setAttribute('data-auth', authLevel);
    // Badge de respaldo se actualiza después del render del header
    setTimeout(_updateBackupBadge, 50);
    const padlocks = document.querySelectorAll('.session-lock-btn');
    padlocks.forEach(btn => {
        btn.innerHTML = authLevel > 0 ? '🔓' : '🔒';
        btn.title = authLevel > 0 ? 'Bloquear / Cerrar sesión' : 'Iniciar sesión';
        if(authLevel > 0) btn.classList.add('unlocked-style');
        else btn.classList.remove('unlocked-style');
    });

    // Botón de usuario en topbar
    const btnEl = document.getElementById('topbar-user-btn');
    const ddEl  = document.getElementById('user-dropdown');
    if(!btnEl || !ddEl) return;
    if(authLevel === 0) {
        btnEl.innerHTML = `<button class="tb-icon-btn" style="border-style:dashed;width:auto;padding:0 10px;font-size:.72rem;gap:5px;" onclick="openLoginModal()">🔑 <span class="tb-user-name">Iniciar Sesión</span></button>`;
        ddEl.innerHTML = '';
    } else {
        const name = currentUser ? currentUser.name : (authLevel === 3 ? 'Admin' : 'Director');
        const pObj = currentUser ? people.find(p => p.name === (currentUser.linkedPerson||currentUser.name)) : null;
        const avStyle = pObj?.photo ? `background-image:url(${pObj.photo});background-size:cover;` : `background:${avc(name)}`;
        const avContent = pObj?.photo ? '' : ini(name);
        // Cargo como subtítulo: usa el cargo principal del perfil vinculado
        let cargoSub = '';
        if(pObj) {
            const sex = pObj.sex || 'Masculino';
            if(pObj.cargos && pObj.cargos[0]) cargoSub = formatGender(pObj.cargos[0].role, sex) || '';
            if(!cargoSub && pObj.type) cargoSub = formatGender(pObj.type, sex);
        } else if(authLevel === 3) { cargoSub = 'Administrador'; }
        else if(authLevel === 2) { cargoSub = 'Director / Enlace'; }
        const subHTML = cargoSub ? `<span class="tb-user-sub">${esc(cargoSub)}</span>` : '';
        btnEl.innerHTML = `
          <div class="tb-user-btn" onclick="_toggleUserMenu()" title="Menú de usuario">
            <div class="av-mini" style="${avStyle}">${avContent}</div>
            <div class="tb-user-info tb-user-name">
              <span class="tb-user-nametext">${esc(name)}</span>
              ${subHTML}
            </div>
            <span class="tb-user-chevron">▾</span>
          </div>`;
        ddEl.innerHTML = `
          <button class="user-drop-identity" onclick="_closeUserMenu();showMyProfile()" style="cursor:pointer;width:100%;text-align:left;border:none;background:var(--s3);font-family:inherit;" title="Ver mi perfil y resumen">
            <div class="av-mini" style="${avStyle}">${avContent}</div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:.78rem;color:var(--white);">${esc(name)}</div>
              <div style="font-size:.62rem;color:var(--cyan)">👁 Ver mi perfil y resumen</div>
            </div>
          </button>
          <div class="user-drop-sep"></div>
          ${authLevel >= 2 ? `<div class="user-drop-item" onclick="_closeUserMenu();switchTab('evals')">⭐ Evaluación de Tareas</div>` : ''}
          ${authLevel >= 3 ? `<div class="user-drop-item" onclick="_closeUserMenu();switchTab('people')">👥 Talento Humano</div>
          <div class="user-drop-sep"></div>
          <div class="user-drop-item" onclick="_closeUserMenu();openUserMgmt()">👤 Administrar Usuarios</div>
          <button class="user-drop-item" id="btn-cloud-backup" style="width:100%;text-align:left;background:transparent;border:none;color:var(--white);cursor:pointer;" onclick="_closeUserMenu();openBackupModal()">☁️ Respaldos en la Nube</button>
          <div class="user-drop-item" onclick="_closeUserMenu();openAppSettings()">⚙️ Configuración</div>
          <div class="user-drop-item" onclick="_closeUserMenu();_openCefecReminderAdmin()" style="color:var(--amber);">🎓 Recordatorio CEFEC</div>` : ''}
          <div class="user-drop-sep"></div>
          <div class="user-drop-item danger" onclick="_closeUserMenu();logoutUser()">🚪 Cerrar Sesión</div>`;
    }
    // Botón CEFEC para usuarios de 15 años
    const cefecBtn = document.getElementById('cefec-reminder-btn');
    if(cefecBtn) {
        const pObjForAge = currentUser ? people.find(p => p.name === (currentUser.linkedPerson||currentUser.name)) : null;
        const age15 = pObjForAge ? _getAge(pObjForAge.dob) === 15 : false;
        cefecBtn.style.display = (authLevel > 0 && age15) ? '' : 'none';
    }

    setTimeout(_checkNotifications, 100);
}

window._showCefecReminder = function() {
    customAlert('⏰ Recuerda que debes graduarte del Diplomado en Liderazgo Infantil (CEFEC) próximamente para seguir sirviendo.');
};

window._openCefecReminderAdmin = function() {
    if(authLevel < 3) return;
    const targets = people.filter(p => !p.archived && p.dob && (_getAge(p.dob) === 15 || _getAge(p.dob) === 16));
    if(targets.length === 0) {
        customAlert('No hay servidores de 15 o 16 años registrados actualmente.');
        return;
    }
    const list = targets.map(p => {
        const avStyle = p.photo
            ? `background-image:url(${p.photo});background-size:cover;background-color:transparent;color:transparent;font-size:0;`
            : `background:${avc(p.name)};`;
        const avContent = p.photo ? '' : ini(p.name);
        const age = _getAge(p.dob);
        const urgency = age >= 16
            ? `<span style="background:rgba(251,99,126,.15);border:1px solid rgba(251,99,126,.35);color:var(--red);border-radius:10px;padding:1px 7px;font-size:.58rem;font-weight:700;">URGENTE</span>`
            : `<span style="background:rgba(255,198,0,.12);border:1px solid rgba(255,198,0,.3);color:var(--amber);border-radius:10px;padding:1px 7px;font-size:.58rem;font-weight:700;">PRÓXIMO</span>`;
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(135deg,rgba(255,198,0,.06),rgba(255,198,0,.02));border:1px solid rgba(255,198,0,.2);border-left:3px solid var(--amber);border-radius:var(--rsm);">
            <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Nunito',sans-serif;font-weight:800;font-size:.9rem;border:2px solid #4a25aa;${avStyle}">${avContent}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-family:'Nunito',sans-serif;font-size:.8rem;font-weight:800;">${esc(p.name)}</div>
                <div style="font-size:.62rem;color:var(--muted);margin-top:2px;">${age} años${p.district ? ' · ' + esc(p.district) : ''}</div>
            </div>
            ${urgency}
        </div>`;
    }).join('');
    customAlert(`<div style="text-align:left;min-width:280px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">
            <span style="font-size:1.4rem;">🎓</span>
            <div>
                <div style="font-family:'Nunito',sans-serif;font-weight:800;color:var(--amber);font-size:.88rem;line-height:1.2;">Pendientes de graduación CEFEC</div>
                <div style="font-size:.62rem;color:var(--muted);margin-top:1px;">${targets.length} servidor${targets.length!==1?'es':''} de 15–16 años</div>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;max-height:240px;overflow-y:auto;">${list}</div>
        <div style="font-size:.65rem;color:var(--muted2);padding:8px 10px;background:var(--s1);border-radius:var(--rxs);line-height:1.5;">Deben graduarse del <strong>Diplomado en Liderazgo Infantil</strong> impartido por CEFEC para continuar sirviendo.</div>
    </div>`);
};