// Dipanggil Vercel Cron tiap hari 06:00 UTC = 13:00 WIB.
// Kirim push ke leader yang BELUM punya catatan aktivitas hari ini.
// Env yang dibutuhkan: VAPID_PUBLIC, VAPID_PRIVATE, APPS_SCRIPT_URL, CRON_SECRET
const webpush = require('web-push');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  const okAuth = secret && (auth === 'Bearer ' + secret || req.query.key === secret);
  if (!okAuth) return res.status(401).json({ error: 'unauthorized' });

  const { VAPID_PUBLIC, VAPID_PRIVATE, APPS_SCRIPT_URL } = process.env;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !APPS_SCRIPT_URL) {
    return res.status(500).json({ error: 'env belum lengkap (VAPID_PUBLIC, VAPID_PRIVATE, APPS_SCRIPT_URL)' });
  }
  webpush.setVapidDetails('mailto:rikkoadrie.prudential@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  // tanggal hari ini menurut WIB (yyyy-mm-dd)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const testAll = req.query.test === '1';   // kirim ke semua langganan, abaikan status isi
  const dry = req.query.dry === '1';        // hanya laporan, tidak kirim

  let data;
  try {
    const r = await fetch(`${APPS_SCRIPT_URL}?action=reminderData&date=${today}&key=${encodeURIComponent(secret)}`);
    data = await r.json();
  } catch (e) {
    return res.status(502).json({ error: 'gagal ambil data dari Apps Script', detail: String(e) });
  }
  if (!data || data.error) return res.status(502).json({ error: 'Apps Script menolak', detail: data && data.error });

  const filled = new Set(data.filled || []);
  const subs = data.subs || [];
  const report = { today, totalSubs: subs.length, filled: [...filled], sent: [], skipped: [], failed: [], removed: 0 };
  const dead = [];

  for (const s of subs) {
    if (!testAll && filled.has(s.leader)) { report.skipped.push(s.leader); continue; }
    if (dry) { report.sent.push(s.leader + ' (dry)'); continue; }
    const payload = JSON.stringify({
      title: 'Impact Board Leader',
      body: testAll
        ? `Tes pengingat untuk ${s.leader}. Kalau kamu lihat ini, notifikasi sudah jalan.`
        : `Halo ${s.leader}, belum ada aktivitas tercatat hari ini. Yuk isi dulu!`,
      url: './',
    });
    try {
      await webpush.sendNotification(s.sub, payload, { TTL: 6 * 3600 });
      report.sent.push(s.leader);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.sub.endpoint);
      report.failed.push({ leader: s.leader, status: e.statusCode });
    }
  }

  for (const endpoint of dead) {
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'removeSub', endpoint }),
      });
      report.removed++;
    } catch (e) {}
  }

  return res.status(200).json(report);
};
