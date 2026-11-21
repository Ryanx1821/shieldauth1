// Vercel Serverless Function: /api/licenses
// Shared per-application license pool for ShieldAuth Owners, Teams, and Resellers.
// Uses Upstash Redis / Vercel KV REST API with in-memory fallback.

const MEMORY_LICENSES = globalThis.__shieldauthLicenses || new Map();
globalThis.__shieldauthLicenses = MEMORY_LICENSES;

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
  if (!cfg) return MEMORY_LICENSES.get(key) || [];
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
    MEMORY_LICENSES.set(key, value);
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

function appKey(appId) {
  return `shieldauth:licenses:app:${String(appId || '').trim()}`;
}

function ownerAppKey(ownerEmail, appName) {
  const o = String(ownerEmail || '').trim().toLowerCase();
  const n = String(appName || '').trim().toLowerCase();
  if (!o || !n) return '';
  return `shieldauth:licenses:owner:${o}:app:${n}`;
}

function mergeUniqueLicenses(...lists) {
  const byKey = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && item.key && !byKey.has(item.key)) {
        byKey.set(item.key, item);
      }
    }
  }
  return Array.from(byKey.values());
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    // GET /api/licenses?appId=app_xxx&ownerEmail=...&appName=...&requester=...&isOwner=1
    if (req.method === 'GET') {
      const appId = String(req.query.appId || '').trim();
      const ownerEmail = String(req.query.ownerEmail || '').trim().toLowerCase();
      const appName = String(req.query.appName || '').trim();
      const requester = String(req.query.requester || '').trim().toLowerCase();
      const isOwner = req.query.isOwner === '1';

      if (!appId && !(ownerEmail && appName)) {
        res.status(400).json({ error: 'Missing appId' });
        return;
      }

      const oKey = ownerAppKey(ownerEmail, appName);
      const [byAppId, byOwnerName] = await Promise.all([
        appId ? redisGet(appKey(appId)) : Promise.resolve([]),
        oKey ? redisGet(oKey) : Promise.resolve([])
      ]);

      const all = mergeUniqueLicenses(byAppId, byOwnerName);
      const scoped = isOwner
        ? all
        : all.filter((l) => String(l.createdBy || '').toLowerCase() === requester);

      res.status(200).json({ licenses: scoped });
      return;
    }

    // POST /api/licenses — append newly generated licenses for an app
    if (req.method === 'POST') {
      const { appId, appName, ownerEmail, licenses } = req.body || {};
      if (!appId || !Array.isArray(licenses) || !licenses.length) {
        res.status(400).json({ error: 'Missing appId or licenses array' });
        return;
      }

      const existing = await redisGet(appKey(appId));
      const next = mergeUniqueLicenses(licenses, existing);
      await redisSet(appKey(appId), next);

      const oKey = ownerAppKey(ownerEmail, appName);
      if (oKey) {
        const existingOwner = await redisGet(oKey);
        const nextOwner = mergeUniqueLicenses(licenses, existingOwner);
        await redisSet(oKey, nextOwner);
      }

      res.status(200).json({ ok: true, count: licenses.length });
      return;
    }

    // PATCH /api/licenses — update a license (status, expiry, note, level, usedBy)
    if (req.method === 'PATCH') {
      const { appId, appName, ownerEmail, key, updates } = req.body || {};
      if (!appId || !key || !updates) {
        res.status(400).json({ error: 'Missing appId, key, or updates' });
        return;
      }

      const existing = await redisGet(appKey(appId));
      await redisSet(appKey(appId), existing.map((l) => (l.key === key ? { ...l, ...updates } : l)));

      const oKey = ownerAppKey(ownerEmail, appName);
      if (oKey) {
        const existingOwner = await redisGet(oKey);
        await redisSet(oKey, existingOwner.map((l) => (l.key === key ? { ...l, ...updates } : l)));
      }

      res.status(200).json({ ok: true });
      return;
    }

    // DELETE /api/licenses — remove one or more keys
    if (req.method === 'DELETE') {
      const { appId, appName, ownerEmail, keys } = req.body || {};
      if (!appId || !Array.isArray(keys)) {
        res.status(400).json({ error: 'Missing appId or keys' });
        return;
      }
      const removeSet = new Set(keys);
      const existing = await redisGet(appKey(appId));
      await redisSet(appKey(appId), existing.filter((l) => !removeSet.has(l.key)));

      const oKey = ownerAppKey(ownerEmail, appName);
      if (oKey) {
        const existingOwner = await redisGet(oKey);
        await redisSet(oKey, existingOwner.filter((l) => !removeSet.has(l.key)));
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
