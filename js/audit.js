/* ══════════════════════════ AUDITORÍA DE ACCESOS ══════════════════════════ */
const AUDIT_ID = 'access_log';
const AUDIT_MAX = 300;

function _auditDevice() {
    const ua = navigator.userAgent;
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
    let browser = 'Desconocido';
    if(/Chrome\//.test(ua) && !/Chromium|Edge|OPR/.test(ua)) browser = 'Chrome';
    else if(/Firefox\//.test(ua)) browser = 'Firefox';
    else if(/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if(/Edg\//.test(ua)) browser = 'Edge';
    else if(/OPR\//.test(ua)) browser = 'Opera';
    return `${mobile ? '📱 Móvil' : '🖥️ Escritorio'} · ${browser}`;
}

async function _logAccess(action) {
    if(!currentUser) return;
    try {
        // Leer log actual
        const rows = await fetch(`${SUPA_URL}/rest/v1/dashboard_state?id=eq.${AUDIT_ID}&select=data`, {
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
        }).then(r => r.json()).catch(() => []);

        const existing = rows?.[0]?.data?.log || [];
        const entry = {
            ts: Date.now(),
            user: currentUser.name,
            level: currentUser.level,
            action,
            device: _auditDevice()
        };
        const log = [entry, ...existing].slice(0, AUDIT_MAX);

        await fetch(`${SUPA_URL}/rest/v1/dashboard_state?on_conflict=id`, {
            method: 'POST',
            headers: {
                'apikey': SUPA_KEY,
                'Authorization': `Bearer ${SUPA_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ id: AUDIT_ID, data: { log } })
        });
    } catch(e) { /* silencioso */ }
}

window.openAuditLog = async function() {
    if(authLevel < 3) return;
    const modal = document.getElementById('audit-modal');
    const body = document.getElementById('audit-body');
    if(!modal || !body) return;
    body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>`;
    modal.classList.add('open');

    try {
        const rows = await fetch(`${SUPA_URL}/rest/v1/dashboard_state?id=eq.${AUDIT_ID}&select=data`, {
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
        }).then(r => r.json());

        const log = rows?.[0]?.data?.log || [];
        if(!log.length) {
            body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);">Sin registros aún</div>`;
            return;
        }

        const levelLabel = l => l >= 3 ? '<span style="color:var(--red);font-weight:700;">Admin Maestro</span>' : l >= 2 ? '<span style="color:var(--cyan);">Director</span>' : '<span style="color:var(--muted);">Usuario</span>';
        const actionLabel = a => a === 'login' ? '<span style="color:var(--green);">▶ Ingreso</span>' : '<span style="color:var(--amber);">◼ Cierre</span>';
        const fmt = ts => new Date(ts).toLocaleString('es-SV', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        body.innerHTML = `
          <div style="font-size:.7rem;color:var(--muted);padding:0 0 8px;border-bottom:1px solid var(--border);margin-bottom:10px;">${log.length} registro(s) · últimos ${AUDIT_MAX} máx.</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${log.map(e => `
              <div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;padding:8px 10px;background:var(--card);border:1px solid var(--border);border-radius:8px;">
                <div>
                  <div style="font-size:.78rem;font-weight:700;">${esc(e.user)} ${levelLabel(e.level)}</div>
                  <div style="font-size:.67rem;color:var(--muted);margin-top:2px;">${e.device||''}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-size:.72rem;">${actionLabel(e.action)}</div>
                  <div style="font-size:.63rem;color:var(--muted);margin-top:2px;">${fmt(e.ts)}</div>
                </div>
              </div>`).join('')}
          </div>`;
    } catch(e) {
        body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);">Error al cargar el registro</div>`;
    }
};
