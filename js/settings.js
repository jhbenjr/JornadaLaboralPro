/* ══════════════════════════ APP SETTINGS ══════════════════════════ */
const APP_CONFIG_KEY = 'elim_app_config_v1';

function _loadAppConfig() {
    try {
        const cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}');
        if(cfg.title || cfg.subtitle || cfg.icon) {
            const logoBox = document.querySelector('.logo-box');
            if(logoBox && cfg.icon) logoBox.textContent = cfg.icon;
            const titleEl = document.querySelector('.logo-text b');
            if(titleEl && cfg.title) titleEl.textContent = cfg.title;
            const subEl = document.querySelector('.logo-text span');
            if(subEl && cfg.subtitle) subEl.textContent = cfg.subtitle;
        }
        if(cfg.accentColor) {
            document.documentElement.style.setProperty('--accent', cfg.accentColor);
            document.documentElement.style.setProperty('--s5', cfg.accentColor);
        }
        if(cfg.districtSchedules && typeof cfg.districtSchedules === 'object') {
            DISTRICT_SCHEDULES = cfg.districtSchedules;
        }
        if(Array.isArray(cfg.departments) && cfg.departments.length) {
            DEPARTMENTS = cfg.departments.slice();
        }
        if(Array.isArray(cfg.serviceHours) && cfg.serviceHours.length) {
            SERVICE_HOURS = [...cfg.serviceHours.filter(h => h !== 'Extemporáneo'), 'Extemporáneo'];
        }
    } catch(e) {}
    _applyHeaderLogo();
    // Aplicar modo mantenimiento y anuncio guardados localmente
    setTimeout(() => { _checkMaintenanceMode(); _checkAnnouncement(); }, 200);
}

/* Aplica el encabezado según el tema y el modo configurado.
   Modos: 'default' (ícono+texto) | 'recolor' (1 asset recoloreado por modo) | 'images' (2 imágenes). */
window._applyHeaderLogo = function() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    const h = cfg.appHeader || {};
    const imgEl  = document.getElementById('header-logo-img');
    const maskEl = document.getElementById('header-logo-mask');
    const boxEl  = document.getElementById('logo-box-default');
    const txtEl  = document.getElementById('logo-text-default');
    if(!imgEl || !maskEl) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    const showDefault = () => {
        imgEl.style.display = 'none'; imgEl.removeAttribute('src');
        maskEl.style.display = 'none';
        if(boxEl) boxEl.style.display = '';
        if(txtEl) txtEl.style.display = '';
    };

    if(h.mode === 'recolor' && h.asset) {
        const color = (isLight ? h.colorLight : h.colorDark) || (isLight ? '#4a25aa' : '#ffffff');
        maskEl.style.webkitMaskImage = `url("${h.asset}")`;
        maskEl.style.maskImage = `url("${h.asset}")`;
        maskEl.style.backgroundColor = color;
        maskEl.style.aspectRatio = String(h.aspect || 4);
        maskEl.style.display = '';
        imgEl.style.display = 'none';
        if(boxEl) boxEl.style.display = 'none';
        if(txtEl) txtEl.style.display = 'none';
    } else if(h.mode === 'images') {
        const src = (isLight ? h.imgLight : h.imgDark) || h.imgDark || h.imgLight;
        if(src) {
            imgEl.src = src; imgEl.style.display = '';
            maskEl.style.display = 'none';
            if(boxEl) boxEl.style.display = 'none';
            if(txtEl) txtEl.style.display = 'none';
        } else showDefault();
    } else {
        showDefault();
    }
};

/* Aplica una configuración de encabezado recibida de la nube (gana la más reciente). */
window._applyRemoteAppHeader = function(remoteHeader) {
    if(!remoteHeader) return;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    const localTs = (cfg.appHeader && cfg.appHeader.ts) || 0;
    if((remoteHeader.ts || 0) < localTs) return; // lo local es más nuevo
    cfg.appHeader = remoteHeader;
    localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(cfg));
    _applyHeaderLogo();
};

window._applyRemoteMaintenance = function(remoteMaint) {
    if(!remoteMaint) return;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    cfg.maintenance = remoteMaint;
    localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(cfg));
    _checkMaintenanceMode();
};

window._applyRemoteAnnouncement = function(remoteAnn) {
    if(!remoteAnn) return;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    cfg.announcement = remoteAnn;
    localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(cfg));
    _checkAnnouncement();
};

// Aplica departamentos / horarios de servicio recibidos de la nube
window._applyRemoteConfigLists = function(departments, serviceHours) {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    let changed = false;
    if(Array.isArray(departments) && departments.length) {
        DEPARTMENTS = departments.slice(); cfg.departments = DEPARTMENTS; changed = true;
    }
    if(Array.isArray(serviceHours) && serviceHours.length) {
        SERVICE_HOURS = [...serviceHours.filter(h => h !== 'Extemporáneo'), 'Extemporáneo'];
        cfg.serviceHours = SERVICE_HOURS; changed = true;
    }
    if(changed) localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(cfg));
};

function _checkMaintenanceMode() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    const maint = cfg.maintenance;
    const overlay = document.getElementById('maintenance-overlay');
    if(!overlay) return;
    if(maint?.enabled && authLevel < 3) {
        const msgEl = document.getElementById('maintenance-msg');
        if(msgEl) msgEl.textContent = maint.message || 'La aplicación está en mantenimiento. Por favor, intenta más tarde.';
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}
window._checkMaintenanceMode = _checkMaintenanceMode;

function _checkAnnouncement() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    const ann = cfg.announcement;
    if(!ann?.active || !ann?.text) return;
    const dismissedTs = parseInt(sessionStorage.getItem('_annDismissed') || '0', 10);
    if(dismissedTs >= (ann.ts || 0)) return;
    const banner = document.getElementById('announcement-banner');
    if(!banner) return;
    const textEl = document.getElementById('announcement-text-display');
    if(textEl) textEl.textContent = ann.text;
    banner.style.display = 'flex';
}
window._checkAnnouncement = _checkAnnouncement;

window.dismissAnnouncement = function() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}'); } catch(e) {}
    const ts = cfg.announcement?.ts || Date.now();
    sessionStorage.setItem('_annDismissed', ts.toString());
    const banner = document.getElementById('announcement-banner');
    if(banner) banner.style.display = 'none';
};

// Estado de edición del encabezado (antes de guardar)
let _hdrEdit = { mode:'default', asset:null, aspect:null, colorDark:'#ffffff', colorLight:'#4a25aa', imgDark:null, imgLight:null };

window.openAppSettings = function() {
    if(authLevel < 3) return;
    const cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{}');
    document.getElementById('app-icon').value = cfg.icon || '⛪';
    document.getElementById('app-title').value = cfg.title || 'DEPARTAMENTO DE COMUNICACIONES';
    document.getElementById('app-subtitle').value = cfg.subtitle || 'MISIÓN CRISTIANA ELIM';
    document.getElementById('app-accent-color').value = cfg.accentColor || '#4a25aa';
    const h = cfg.appHeader || {};
    _hdrEdit = {
        mode: h.mode || 'default',
        asset: h.asset || null,
        aspect: h.aspect || null,
        colorDark: h.colorDark || '#ffffff',
        colorLight: h.colorLight || '#4a25aa',
        imgDark: h.imgDark || null,
        imgLight: h.imgLight || null
    };
    const modeSel = document.getElementById('hdr-mode'); if(modeSel) modeSel.value = _hdrEdit.mode;
    const cd = document.getElementById('hdr-color-dark'); if(cd) cd.value = _hdrEdit.colorDark;
    const cl = document.getElementById('hdr-color-light'); if(cl) cl.value = _hdrEdit.colorLight;
    _onHeaderModeChange();
    // Mantenimiento
    const maint = cfg.maintenance || {};
    const maintChk = document.getElementById('maintenance-enabled');
    const maintMsg = document.getElementById('maintenance-message');
    if(maintChk) maintChk.checked = !!maint.enabled;
    if(maintMsg) maintMsg.value = maint.message || '';
    // Anuncio
    const ann = cfg.announcement || {};
    const annChk = document.getElementById('announcement-active');
    const annTxt = document.getElementById('announcement-text-input');
    if(annChk) annChk.checked = !!ann.active;
    if(annTxt) annTxt.value = ann.text || '';
    document.getElementById('app-settings-modal').classList.add('open');
    _renderDistrictEditor();
    _renderDepartmentEditor();
    _renderServiceHoursEditor();
};

window._onHeaderModeChange = function() {
    const mode = document.getElementById('hdr-mode')?.value || 'default';
    _hdrEdit.mode = mode;
    const rc = document.getElementById('hdr-recolor-fields');
    const im = document.getElementById('hdr-images-fields');
    if(rc) rc.style.display = mode === 'recolor' ? '' : 'none';
    if(im) im.style.display = mode === 'images' ? '' : 'none';
    _renderHeaderPrevs();
};

window._onHeaderColorChange = function(which, val) {
    if(which === 'dark') _hdrEdit.colorDark = val; else _hdrEdit.colorLight = val;
    _renderHeaderPrevs();
};

/* Lee el aspecto (w/h) de un SVG por su viewBox si la imagen no reporta tamaño. */
function _svgAspect(dataUrl) {
    try {
        const txt = decodeURIComponent(dataUrl.replace(/^data:[^,]*,/, ''));
        const m = txt.match(/viewBox\s*=\s*["']([\d.\s,-]+)["']/i);
        if(m) { const p = m[1].trim().split(/[\s,]+/).map(Number); if(p.length === 4 && p[3]) return p[2]/p[3]; }
    } catch(e) {}
    return null;
}

/* Asset recoloreable (SVG/PNG): guarda dataURL + aspecto, sin rasterizar (SVG queda nítido). */
window._onHeaderAssetPick = function(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const dataUrl = e.target.result;
        const img = new Image();
        const finish = aspect => { _hdrEdit.asset = dataUrl; _hdrEdit.aspect = +(aspect || 4).toFixed(3); _renderHeaderPrevs(); };
        img.onload  = () => finish((img.naturalWidth && img.naturalHeight) ? img.naturalWidth/img.naturalHeight : (_svgAspect(dataUrl) || 4));
        img.onerror = () => finish(_svgAspect(dataUrl) || 4);
        img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
};

/* Imágenes a color: redimensiona a 120px de alto (nítida), PNG (conserva transparencia). */
function _resizeHeaderImg(file, cb) {
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const targetH = 120;
            const scale = targetH / img.naturalHeight;
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = targetH;
            canvas.getContext('2d').drawImage(img, 0, 0, w, targetH);
            cb(canvas.toDataURL('image/png'));
        };
        img.onerror = () => cb(null);
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

window._onHeaderImgPick = function(event, mode) {
    const file = event.target.files[0];
    if(!file) return;
    _resizeHeaderImg(file, dataUrl => {
        if(!dataUrl) { showToast('❌ No se pudo procesar la imagen'); return; }
        if(mode === 'dark') _hdrEdit.imgDark = dataUrl; else _hdrEdit.imgLight = dataUrl;
        _renderHeaderPrevs();
    });
    event.target.value = '';
};

window._clearHeaderImgs = function() {
    _hdrEdit.asset = null; _hdrEdit.aspect = null;
    _hdrEdit.imgDark = null; _hdrEdit.imgLight = null;
    _renderHeaderPrevs();
};

function _renderHeaderPrevs() {
    const maskSpan = color => _hdrEdit.asset
        ? `<span style="display:inline-block;height:38px;aspect-ratio:${_hdrEdit.aspect||4};-webkit-mask:url('${_hdrEdit.asset}') no-repeat left center/contain;mask:url('${_hdrEdit.asset}') no-repeat left center/contain;background-color:${color};"></span>`
        : 'Sin asset';
    const rcD = document.getElementById('hdr-recolor-dark-prev');
    const rcL = document.getElementById('hdr-recolor-light-prev');
    if(rcD) rcD.innerHTML = maskSpan(_hdrEdit.colorDark);
    if(rcL) rcL.innerHTML = maskSpan(_hdrEdit.colorLight);

    const dk = document.getElementById('hdr-img-dark-prev');
    const lt = document.getElementById('hdr-img-light-prev');
    if(dk) dk.innerHTML = _hdrEdit.imgDark ? `<img src="${_hdrEdit.imgDark}" style="height:40px;width:auto;max-width:100%;object-fit:contain;"/>` : 'Sin imagen';
    if(lt) lt.innerHTML = _hdrEdit.imgLight ? `<img src="${_hdrEdit.imgLight}" style="height:40px;width:auto;max-width:100%;object-fit:contain;"/>` : 'Sin imagen';
}

window.saveAppSettings = function() {
    // Leer los editores antes de guardar
    _readDistrictEditorIntoGlobal();
    _readDepartmentEditorIntoGlobal();
    _readServiceHoursIntoGlobal();
    const appHeader = {
        mode: _hdrEdit.mode,
        asset: _hdrEdit.asset,
        aspect: _hdrEdit.aspect,
        colorDark: _hdrEdit.colorDark,
        colorLight: _hdrEdit.colorLight,
        imgDark: _hdrEdit.imgDark,
        imgLight: _hdrEdit.imgLight,
        ts: Date.now()
    };
    const cfg = {
        icon: document.getElementById('app-icon').value.trim() || '⛪',
        title: document.getElementById('app-title').value.trim() || 'DEPARTAMENTO DE COMUNICACIONES',
        subtitle: document.getElementById('app-subtitle').value.trim() || 'MISIÓN CRISTIANA ELIM',
        accentColor: document.getElementById('app-accent-color').value,
        districtSchedules: DISTRICT_SCHEDULES,
        departments: DEPARTMENTS,
        serviceHours: SERVICE_HOURS,
        appHeader,
        maintenance: {
            enabled: document.getElementById('maintenance-enabled')?.checked || false,
            message: document.getElementById('maintenance-message')?.value.trim() || 'La aplicación está en mantenimiento. Por favor, intenta más tarde.'
        },
        announcement: {
            active: document.getElementById('announcement-active')?.checked || false,
            text: document.getElementById('announcement-text-input')?.value.trim() || '',
            ts: Date.now()
        }
    };
    localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(cfg));
    _loadAppConfig();
    _checkMaintenanceMode();
    _checkAnnouncement();
    // Propagar a todos los dispositivos vía la nube
    if(typeof _scheduleSyncToCloud === 'function') _scheduleSyncToCloud();
    document.getElementById('app-settings-modal').classList.remove('open');
    showToast('✅ Configuración guardada');
};

function _renderDistrictEditor() {
    const container = document.getElementById('district-schedule-editor');
    if(!container) return;
    container.innerHTML = Object.entries(DISTRICT_SCHEDULES).map(([dist, scheds], idx) => {
        const schOpts = SERVICE_HOURS.map(h =>
            `<label style="display:inline-flex;align-items:center;gap:3px;font-size:.63rem;white-space:nowrap;">
                <input type="checkbox" data-sch="${esc(h)}" ${scheds.includes(h)?'checked':''} style="width:12px;height:12px;"> ${h}
             </label>`
        ).join('');
        return `<div class="district-row" data-idx="${idx}" style="background:var(--s1);border:1px solid var(--border);border-radius:var(--rsm);padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;gap:6px;">
                <input type="text" class="dist-name-input" value="${esc(dist)}" placeholder="Nombre distrito"
                    style="flex:1;font-size:.72rem;padding:4px 7px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rxs);color:var(--white);">
                <button onclick="_removeDistrictRow(${idx})" title="Eliminar distrito"
                    style="background:rgba(251,99,126,.12);border:1px solid rgba(251,99,126,.3);color:var(--red);border-radius:var(--rxs);padding:3px 7px;cursor:pointer;font-size:.7rem;">✕</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${schOpts}</div>
        </div>`;
    }).join('');
}

function _readDistrictEditorIntoGlobal() {
    const container = document.getElementById('district-schedule-editor');
    if(!container) return;
    const newMap = {};
    container.querySelectorAll('.district-row').forEach(row => {
        const name = row.querySelector('.dist-name-input')?.value.trim();
        if(!name) return;
        const scheds = [];
        row.querySelectorAll('input[data-sch]:checked').forEach(cb => scheds.push(cb.getAttribute('data-sch')));
        newMap[name] = scheds;
    });
    DISTRICT_SCHEDULES = newMap;
}

window._addDistrictRow = function() {
    _readDistrictEditorIntoGlobal();
    const newKey = 'Distrito ' + (Object.keys(DISTRICT_SCHEDULES).length + 1);
    DISTRICT_SCHEDULES[newKey] = [];
    _renderDistrictEditor();
};

window._removeDistrictRow = function(idx) {
    _readDistrictEditorIntoGlobal();
    const keys = Object.keys(DISTRICT_SCHEDULES);
    if(keys[idx]) delete DISTRICT_SCHEDULES[keys[idx]];
    _renderDistrictEditor();
};

/* ── Editor de DEPARTAMENTOS ── */
function _renderDepartmentEditor() {
    const c = document.getElementById('department-editor');
    if(!c) return;
    c.innerHTML = DEPARTMENTS.map((d, idx) => `
        <div class="dept-row" style="display:flex;align-items:center;gap:6px;">
            <input type="text" class="dept-name-input" value="${esc(d)}" placeholder="Nombre del departamento"
                style="flex:1;font-size:.72rem;padding:5px 8px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rxs);color:var(--white);">
            <button onclick="_removeDepartmentRow(${idx})" title="Eliminar"
                style="background:rgba(251,99,126,.12);border:1px solid rgba(251,99,126,.3);color:var(--red);border-radius:var(--rxs);padding:4px 8px;cursor:pointer;font-size:.7rem;">✕</button>
        </div>`).join('');
}
function _readDepartmentEditorIntoGlobal() {
    const c = document.getElementById('department-editor');
    if(!c) return;
    const list = [];
    c.querySelectorAll('.dept-name-input').forEach(inp => { const v = inp.value.trim(); if(v) list.push(v); });
    if(list.length) DEPARTMENTS = list;
}
window._addDepartmentRow = function() {
    _readDepartmentEditorIntoGlobal();
    DEPARTMENTS.push('Nuevo departamento');
    _renderDepartmentEditor();
};
window._removeDepartmentRow = function(idx) {
    _readDepartmentEditorIntoGlobal();
    DEPARTMENTS.splice(idx, 1);
    _renderDepartmentEditor();
};

/* ── Editor de HORARIOS DE SERVICIO (Extemporáneo es fijo, no editable aquí) ── */
function _renderServiceHoursEditor() {
    const c = document.getElementById('servicehours-editor');
    if(!c) return;
    const editable = SERVICE_HOURS.filter(h => h !== 'Extemporáneo');
    c.innerHTML = editable.map((h, idx) => `
        <div class="sh-row" style="display:flex;align-items:center;gap:6px;">
            <input type="text" class="sh-input" value="${esc(h)}" placeholder="Ej. 7:00 AM"
                style="flex:1;font-size:.72rem;padding:5px 8px;background:var(--s2);border:1px solid var(--border);border-radius:var(--rxs);color:var(--white);">
            <button onclick="_removeServiceHourRow(${idx})" title="Eliminar"
                style="background:rgba(251,99,126,.12);border:1px solid rgba(251,99,126,.3);color:var(--red);border-radius:var(--rxs);padding:4px 8px;cursor:pointer;font-size:.7rem;">✕</button>
        </div>`).join('')
        + `<div style="font-size:.62rem;color:var(--muted);margin-top:2px;">Formato: <b>7:00 AM</b> / <b>2:00 PM</b>. "Extemporáneo" siempre está disponible.</div>`;
}
function _readServiceHoursIntoGlobal() {
    const c = document.getElementById('servicehours-editor');
    if(!c) return;
    const list = [];
    c.querySelectorAll('.sh-input').forEach(inp => { const v = inp.value.trim(); if(v) list.push(v); });
    SERVICE_HOURS = [...list, 'Extemporáneo'];
}
window._addServiceHourRow = function() {
    _readServiceHoursIntoGlobal();
    SERVICE_HOURS = [...SERVICE_HOURS.filter(h => h !== 'Extemporáneo'), '12:00 PM', 'Extemporáneo'];
    _renderServiceHoursEditor();
};
window._removeServiceHourRow = function(idx) {
    _readServiceHoursIntoGlobal();
    const editable = SERVICE_HOURS.filter(h => h !== 'Extemporáneo');
    editable.splice(idx, 1);
    SERVICE_HOURS = [...editable, 'Extemporáneo'];
    _renderServiceHoursEditor();
};

window._toggleUserMenu = function() {
    const dd = document.getElementById('user-dropdown');
    if(!dd) return;
    const wasOpen = dd.classList.contains('open');
    _closeAllHeaderDropdowns();
    if(!wasOpen) dd.classList.add('open');
};
window._closeUserMenu = function() {
    document.getElementById('user-dropdown')?.classList.remove('open');
};
window._toggleNotifDropdown = function() {
    const dd = document.getElementById('notif-dropdown');
    if(!dd) return;
    const wasOpen = dd.classList.contains('open');
    _closeAllHeaderDropdowns();
    if(!wasOpen) { dd.classList.add('open'); _renderNotifList(); }
};
function _closeAllHeaderDropdowns() {
    document.getElementById('user-dropdown')?.classList.remove('open');
    document.getElementById('notif-dropdown')?.classList.remove('open');
}
document.addEventListener('click', function(e) {
    if(!e.target.closest('#user-menu-wrap') && !e.target.closest('#notif-wrap')) _closeAllHeaderDropdowns();
});
