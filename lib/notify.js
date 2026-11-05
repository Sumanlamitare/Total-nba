// In-app notifications (the bell; the browser shows them as system notifications when the user allows it).
export async function notify(d, { kind, title, body = '', link = null, ref = null, live = false }) {
  if (ref && await d.collection('notifications').findOne({ ref, kind })) return null; // one per event and kind
  const doc = { kind, title, body, link, ref, live, read: false, createdAt: new Date() };
  await d.collection('notifications').insertOne(doc);
  return doc;
}

export async function log(d, level, message, extra = {}) {
  await d.collection('log').insertOne({ at: new Date(), level, message, ...extra }).catch(() => {});
}
