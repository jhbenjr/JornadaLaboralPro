/* ══════════════════════════ SUPABASE BACKUP ══════════════════════════ */
async function _supaFetch(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    }
  };
  if(body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
  if(!r.ok) { const txt = await r.text(); throw new Error(txt); }
  return r.status === 204 ? null : r.json();
}

function _backupAgeText() {
  const ts = localStorage.getItem(BACKUP_TS_KEY);
  if(!ts) return null;
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if(diffDays === 0) return 'Hoy';
  if(diffDays === 1) return 'Ayer';
  return `Hace ${diffDays} días`;
}

function _getBackupPayload() {
  // Excluir reminders generados automáticamente por equipos (migración a notificaciones nativas)
  const reminders = _getReminders().filter(r =>
    !r.message?.includes('Has sido asignado/a como líder del equipo') &&
    !r.message?.includes('Has sido agregado/a al equipo')
  );
  // Config global — encabezado, mantenimiento, anuncio — se sincronizan entre dispositivos
  let appHeader = null, maintenance = null, announcement = null, departments = null, serviceHours = null;
  try {
    const cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}');
    appHeader    = cfg.appHeader    || null;
    maintenance  = cfg.maintenance  || null;
    announcement = cfg.announcement || null;
    departments  = cfg.departments  || null;
    serviceHours = cfg.serviceHours || null;
  } catch(e) {}
  return { activities, events, people, activeEventId, templates, users, teams, reminders, remindersTs: _remindersTs, appHeader, maintenance, announcement, departments, serviceHours, initialized: true };
}

window.openBackupModal = async function() {
  if(authLevel < 3) return;
  const modal = document.getElementById('backup-modal');
  const body  = document.getElementById('backup-modal-body');
  modal.classList.add('open');
  body.innerHTML = `<p style="color:var(--muted);font-size:.8rem;">⏳ Cargando respaldos…</p>`;

  const ageText  = _backupAgeText();
  const isOnline = navigator.onLine;
  let warnHtml = '';
  if(!ageText) {
    warnHtml = `<div class="bk-warn">⚠️ <span>Aún no tienes ningún respaldo en la nube. <b>Si el navegador pierde sus datos, perderás todo.</b> Crea tu primer respaldo ahora.</span></div>`;
  } else if(ageText !== 'Hoy' && ageText !== 'Ayer') {
    warnHtml = `<div class="bk-warn">⚠️ <span>Último respaldo: <b>${ageText}</b>. Se recomienda respaldar al menos cada semana.</span></div>`;
  } else {
    warnHtml = `<div class="bk-ok">✅ <span>Último respaldo: <b>${ageText}</b>. Datos al día.</span></div>`;
  }

  const localHtml = `<div class="bk-section-title">☁️ Historial de respaldos</div>`;

  if(!isOnline) {
    body.innerHTML = warnHtml + localHtml +
      `<div class="bk-warn" style="margin-top:0;">📡 Sin conexión a internet. Los respaldos en la nube no están disponibles.</div>`;
    return;
  }

  let backups = [];
  try {
    backups = await _supaFetch('GET', 'dashboard_backups?select=id,created_at,label&order=created_at.desc');
  } catch(e) {
    body.innerHTML = warnHtml + localHtml +
      `<div class="bk-warn" style="margin-top:0;">❌ Error al conectar con Supabase: ${esc(e.message)}</div>`;
    return;
  }

  let listHtml = '';
  if(!backups.length) {
    listHtml = `<div class="bk-empty">☁️ No hay respaldos en la nube todavía.</div>`;
  } else {
    listHtml = `<div class="bk-list">` + backups.map(b => {
      const d = new Date(b.created_at);
      const dateStr = d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div class="bk-item">
        <div class="bk-item-info">
          <div class="bk-item-label">📦 ${esc(b.label||'Sin etiqueta')}</div>
          <div class="bk-item-date">🕐 ${dateStr}</div>
        </div>
        <button class="btn btn-ghost" style="font-size:.72rem;padding:5px 10px;" onclick="_restoreCloudBackup('${b.id}','${esc(b.label||'Sin etiqueta')}')">↩️ Restaurar</button>
        <button class="ico-btn del" onclick="_deleteCloudBackup('${b.id}')" title="Eliminar respaldo">🗑</button>
      </div>`;
    }).join('') + `</div>`;
  }

  body.innerHTML = warnHtml + localHtml +
    `<button class="btn btn-add" onclick="_createCloudBackup()" style="font-size:.74rem;margin-bottom:14px;">☁️ Crear nuevo respaldo</button>` +
    listHtml;
};

window._createCloudBackup = async function() {
  const label = prompt('Etiqueta para este respaldo (opcional):', `Respaldo ${new Date().toLocaleDateString('es-ES')}`);
  if(label === null) return; // cancelado
  const body = document.getElementById('backup-modal-body');
  body.innerHTML = `<p style="color:var(--muted);font-size:.8rem;">⏳ Guardando respaldo en la nube…</p>`;
  try {
    await _supaFetch('POST', 'dashboard_backups', { label: label||'Sin etiqueta', data: _getBackupPayload() });
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
    showToast('✅ Respaldo guardado en Supabase');
    _updateBackupBadge();
    openBackupModal(); // refrescar lista
  } catch(e) {
    showToast('❌ Error al guardar: ' + e.message);
    openBackupModal();
  }
};

window._restoreCloudBackup = async function(id, label) {
  customConfirm(`¿Restaurar el respaldo "${label}"?\n\nSe reemplazarán TODOS los datos actuales. Esta acción no se puede deshacer.`, async () => {
    const body = document.getElementById('backup-modal-body');
    body.innerHTML = `<p style="color:var(--muted);font-size:.8rem;">⏳ Restaurando…</p>`;
    try {
      const rows = await _supaFetch('GET', `dashboard_backups?id=eq.${id}&select=data`);
      if(!rows || !rows.length) throw new Error('Respaldo no encontrado');
      const d = rows[0].data;
      activities     = d.activities     || [];
      events         = d.events         || [];
      people         = d.people         || [];
      activeEventId  = d.activeEventId  || null;
      templates      = d.templates      || [];
      users          = d.users          || [];
      autoSave();
      afterChange();
      document.getElementById('backup-modal').classList.remove('open');
      showToast('✅ Datos restaurados desde el respaldo en la nube');
    } catch(e) {
      showToast('❌ Error al restaurar: ' + e.message);
      openBackupModal();
    }
  });
};

window._deleteCloudBackup = async function(id) {
  customConfirm('¿Eliminar este respaldo de la nube? No se puede deshacer.', async () => {
    try {
      await _supaFetch('DELETE', `dashboard_backups?id=eq.${id}`);
      showToast('🗑 Respaldo eliminado');
      openBackupModal();
    } catch(e) {
      showToast('❌ Error: ' + e.message);
    }
  });
};

window._exportLocalBackup = function() {
  const data = JSON.stringify(_getBackupPayload(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `elim-dashboard-backup-${date}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('📥 JSON exportado');
};

window._importLocalBackup = function(evt) {
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    customConfirm('¿Importar este archivo? Se reemplazarán TODOS los datos actuales.', () => {
      try {
        const d = JSON.parse(e.target.result);
        if(!d.activities || !d.events) throw new Error('Archivo inválido');
        activities    = d.activities    || [];
        events        = d.events        || [];
        people        = d.people        || [];
        activeEventId = d.activeEventId || null;
        templates     = d.templates     || [];
        users         = d.users         || [];
        autoSave();
        afterChange();
        document.getElementById('backup-modal').classList.remove('open');
        showToast('✅ Datos importados correctamente');
      } catch(err) {
        showToast('❌ El archivo no es válido: ' + err.message);
      }
    });
  };
  reader.readAsText(file);
};

/* ══════════════════════════ REALTIME SYNC ══════════════════════════ */
async function _syncToCloud() {
  if(!navigator.onLine || !_supaClient) return;
  _setSyncStatus('syncing');
  try {
    await fetch(`${SUPA_URL}/rest/v1/dashboard_state`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: 'current',
        data: _getBackupPayload(),
        updated_by: SESSION_ID,
        updated_at: new Date().toISOString()
      })
    });
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
    _lastSavedAt = Date.now();
    _syncPending = false;
    _setSyncStatus('ok');
    _updateBackupBadge();
  } catch(e) {
    _syncPending = false;
    _setSyncStatus('error');
  }
}
