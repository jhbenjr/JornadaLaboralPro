const CACHE = 'depcom-mce-v48';
const STATE_CACHE = 'depcom-state-v2';
const STATIC = [
  './', './index.html', './icon.svg', './manifest.json',
  './js/config.js', './js/state.js', './js/utils.js', './js/auth.js',
  './js/reminders.js', './js/settings.js', './js/notifications.js',
  './js/ui.js', './js/events.js', './js/activities.js', './js/evals.js',
  './js/render.js', './js/people.js', './js/storage.js', './js/views.js',
  './js/cloud.js', './js/push.js', './js/pwa.js', './js/attendance.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== STATE_CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if(!e.request.url.startsWith('http')) return;
  // Supabase GET (lectura): network-first; si offline, fallback a cache
  if(e.request.url.includes('supabase.co') && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).then(res => {
        if(res.ok) {
          const clone = res.clone();
          caches.open(STATE_CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(async () => {
        const cached = await caches.open(STATE_CACHE).then(c => c.match(e.request));
        return cached || new Response('[]', { status: 200, headers: {'Content-Type':'application/json'} });
      })
    );
    return;
  }
  // Supabase escrituras: siempre red, sin cachear
  if(e.request.url.includes('supabase.co')) return;
  // Assets estáticos: red primero, fallback a cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ── Estado guardado (Cache API accesible desde SW) ── */
async function getState() {
  const cache = await caches.open(STATE_CACHE);
  const res = await cache.match('/__userstate__');
  return res ? res.json() : null;
}
async function setState(data) {
  const cache = await caches.open(STATE_CACHE);
  await cache.put('/__userstate__', new Response(JSON.stringify(data), { headers: {'Content-Type':'application/json'} }));
}

/* ── Mensaje desde la página → actualiza estado guardado ── */
self.addEventListener('message', async e => {
  if(e.data?.type === 'UPDATE_STATE') {
    const { type, ...data } = e.data;
    await setState(data);
  }
});

/* ── Periodic Background Sync ── */
self.addEventListener('periodicsync', e => {
  if(e.tag === 'depcom-check') e.waitUntil(bgCheckAssignments());
});

async function bgCheckAssignments() {
  const state = await getState();
  if(!state?.userName || !state?.supaUrl || !state?.supaKey) return;

  try {
    const res = await fetch(
      `${state.supaUrl}/rest/v1/dashboard_state?id=eq.current&select=data`,
      { headers: { 'apikey': state.supaKey, 'Authorization': `Bearer ${state.supaKey}` } }
    );
    const rows = await res.json();
    const data = rows?.[0]?.data;
    if(!data) return;

    const name = state.userName;
    const known = new Set(state.knownTaskIds || []);
    const nowIds = new Set();
    const newTasks = [];

    (data.activities || []).forEach(a => {
      (a.tasks || []).forEach(t => {
        const assigned = t.responsable === name || (t.assignedPeople || []).includes(name);
        if(!assigned) return;
        nowIds.add(t.id);
        if(!known.has(t.id)) {
          const evt = (data.events || []).find(ev => ev.id === a.eventId);
          const isLead = t.responsable === name;
          newTasks.push({ taskName: t.name, actName: a.activity, evtName: evt?.name || '', date: evt?.date || a.fecha || '', isLead });
        }
      });
    });

    for(const t of newTasks) {
      const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('es-SV',{weekday:'short',day:'numeric',month:'short'}) : '';
      const role = t.isLead ? '👑 Líder' : '👥 Apoyo';
      await self.registration.showNotification('📋 Nueva asignación — DEPCOM MCE', {
        body: `${t.taskName}\n${t.actName}${t.evtName ? ' · ' + t.evtName : ''}${dateStr ? ' · ' + dateStr : ''}\n${role}`,
        icon: './icon.svg',
        badge: './icon.svg',
        tag: 'depcom-task-' + t.taskName.slice(0,20),
        vibrate: [200, 100, 200],
        data: { taskName: t.taskName }
      });
    }

    await setState({ ...state, knownTaskIds: [...nowIds] });
  } catch(_) {}
}

/* ── Push desde servidor (futuro) ── */
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'DEPCOM MCE', {
    body: data.body || 'Tienes una nueva asignación',
    icon: './icon.svg',
    badge: './icon.svg',
    vibrate: [200, 100, 200],
    data
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = e.notification.data?.tab || null;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
      if(open) {
        open.focus();
        if(tab) open.postMessage({ type: 'SWITCH_TAB', tab });
        return;
      }
      return clients.openWindow('./' + (tab ? '#' + tab : ''));
    })
  );
});
