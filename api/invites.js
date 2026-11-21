// Vercel Serverless Function: /api/invites
// Shared cross-device invite store for ShieldAuth Teams & Resellers.
// Works automatically with Vercel Marketplace Upstash Redis / Vercel KV
// (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN).

const MEMORY_STORE = globalThis.__shieldauthInvites || new Map();
globalThis.__shieldauthInvites = MEMORY_STORE;

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function safeParseArray(raw) {
  let val = raw;
  for (let i = 0; i < 3 && typeof val === 'string'; i++) {
    try {
      val = JSON.parse(val);
    } catch {
      break;
    }
  }
  return Array.isArray(val) ? val : [];
}

async function redisGet(key) {
  const cfg = getRedisConfig();
  if (!cfg) return MEMORY_STORE.get(key) || [];
  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['GET', key])
  });
  const data = await resp.json();
  if (!data || data.result == null) return [];
  return safeParseArray(data.result);
}

async function redisSet(key, value) {
  const cfg = getRedisConfig();
  if (!cfg) {
    MEMORY_STORE.set(key, value);
    return;
  }
  await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value)])
  });
}

function inboxKey(email) {
  return `shieldauth:invites:to:${String(email || '').trim().toLowerCase()}`;
}

function sentKey(email) {
  return `shieldauth:invites:from:${String(email || '').trim().toLowerCase()}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const persistent = Boolean(getRedisConfig());

  try {
    // GET /api/invites?email=user@example.com
    if (req.method === 'GET') {
      const email = String(req.query.email || '').trim().toLowerCase();
      if (!email) {
        res.status(400).json({ error: 'Missing email query parameter' });
        return;
      }
      const [incoming, sent] = await Promise.all([
        redisGet(inboxKey(email)),
        redisGet(sentKey(email))
      ]);
      res.status(200).json({ incoming, sent, persistent });
      return;
    }

    // POST /api/invites — create & deliver invite to recipient's account
    if (req.method === 'POST') {
      const inv = req.body || {};
      const toEmail = String(inv.toEmail || '').trim().toLowerCase();
      const fromEmail = String(inv.fromEmail || '').trim().toLowerCase();
      if (!inv.id || !toEmail || !inv.kind) {
        res.status(400).json({ error: 'Missing required invite fields' });
        return;
      }

      const record = {
        id: inv.id,
        kind: inv.kind,
        toEmail,
        fromEmail: fromEmail || 'admin@shieldauth',
        appId: inv.appId || '',
        appName: inv.appName || 'ShieldAuth',
        appVersion: inv.appVersion || '1.0',
        detail: inv.detail || '',
        balance: Number(inv.balance || 0),
        status: 'Pending Invite',
        createdAt: inv.createdAt || new Date().toISOString()
      };

      const recipientList = await redisGet(inboxKey(toEmail));
      const nextRecipient = [record, ...recipientList.filter((x) => x.id !== record.id)];
      await redisSet(inboxKey(toEmail), nextRecipient);

      if (fromEmail) {
        const senderList = await redisGet(sentKey(fromEmail));
        const nextSender = [record, ...senderList.filter((x) => x.id !== record.id)];
        await redisSet(sentKey(fromEmail), nextSender);
      }

      res.status(200).json({ ok: true, invite: record, persistent });
      return;
    }

    // PATCH /api/invites — accept or decline an invite
    if (req.method === 'PATCH') {
      const { id, toEmail, fromEmail, action } = req.body || {};
      const to = String(toEmail || '').trim().toLowerCase();
      const from = String(fromEmail || '').trim().toLowerCase();
      if (!id || !to || !action) {
        res.status(400).json({ error: 'Missing id, toEmail, or action' });
        return;
      }

      const recipientList = await redisGet(inboxKey(to));
      const nextRecipient =
        action === 'decline'
          ? recipientList.filter((x) => x.id !== id)
          : recipientList.map((x) => (x.id === id ? { ...x, status: 'Active' } : x));
      await redisSet(inboxKey(to), nextRecipient);

      if (from) {
        const senderList = await redisGet(sentKey(from));
        const nextSender =
          action === 'decline'
            ? senderList.filter((x) => x.id !== id)
            : senderList.map((x) => (x.id === id ? { ...x, status: 'Active' } : x));
        await redisSet(sentKey(from), nextSender);
      }

      res.status(200).json({ ok: true, persistent });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
