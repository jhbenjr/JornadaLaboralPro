/* ══════════════════════════ WEB PUSH (notificaciones aunque la app esté cerrada) ══════════════════════════ */
/* Pega aquí tu VAPID PUBLIC KEY (la del generador). Si queda vacío, el push queda desactivado
   y la app sigue funcionando con las notificaciones en primer plano/segundo plano de siempre. */
const VAPID_PUBLIC_KEY = 'BC1uEodu0GBL9xNxm0iSVu1iO0TLMwklGHU608zKJIxwESY2LoIBciJ54rUwIs_zQ7lDcHnBqCzTOM6bV8DFVFU';

function _urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/* Suscribe este dispositivo al push y guarda la suscripción en Supabase (por persona). */
async function _registerPush() {
  try {
    if (!VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!currentUser) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlB64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const name = currentUser.linkedPerson || currentUser.name;
    await fetch(`${SUPA_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        person_name: name,
        endpoint: sub.endpoint,
        subscription: sub.toJSON()
      })
    });
  } catch (e) { /* silencioso */ }
}
window._registerPush = _registerPush;

/* Llama a la Edge Function para enviar push a una lista de personas. */
async function _sendPushToRecipients(recipients, title, body) {
  try {
    if (!VAPID_PUBLIC_KEY) return;
    if (!Array.isArray(recipients) || !recipients.length) return;
    await fetch(`${SUPA_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      },
      body: JSON.stringify({ recipients, title, body })
    });
  } catch (e) { /* silencioso */ }
}
