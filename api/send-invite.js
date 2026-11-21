// Vercel Serverless Function: POST /api/send-invite
// Sends real ShieldAuth Team & Reseller invite emails via Resend (https://resend.com).
// Set RESEND_API_KEY (and optional INVITE_FROM_EMAIL) in Vercel Project -> Settings -> Environment Variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { kind, toEmail, fromEmail, appName, detail, balance, acceptUrl } = req.body || {};

  if (!toEmail || !kind) {
    res.status(400).json({ error: 'Missing required invite fields' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(200).json({
      sent: false,
      reason: 'RESEND_API_KEY not configured in Vercel Environment Variables'
    });
    return;
  }

  const fromAddress = process.env.INVITE_FROM_EMAIL || 'ShieldAuth <onboarding@resend.dev>';
  const isTeam = kind === 'team';
  const subject = isTeam
    ? `You're invited to join ${appName || 'ShieldAuth'} as ${detail || 'Team Member'}`
    : `You're invited to become a ${appName || 'ShieldAuth'} Reseller`;

  const detailLine = isTeam
    ? `Role: <strong>${escapeHtml(detail || 'Member')}</strong>`
    : `Scope: <strong>${escapeHtml(detail || 'All Levels')}</strong>`;

  const html = `
    <div style="background:#050506;color:#f5f5f7;font-family:Inter,Arial,sans-serif;padding:36px 20px;">
      <div style="max-width:520px;margin:0 auto;background:#111114;border:1px solid #27272a;border-radius:14px;padding:32px;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;margin-bottom:10px;">
          ${isTeam ? 'TEAM INVITATION' : 'RESELLER INVITATION'}
        </div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#ffffff;">
          You've been invited to ${escapeHtml(appName || 'ShieldAuth')}
        </h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#a1a1aa;">
          <strong style="color:#ffffff;">${escapeHtml(fromEmail || 'An administrator')}</strong> invited you to collaborate on ShieldAuth.
        </p>
        <div style="background:#09090b;border:1px solid #27272a;border-radius:8px;padding:14px 16px;font-size:13px;color:#d4d4d8;margin-bottom:24px;">
          ${detailLine}
        </div>
        <a href="${escapeHtml(acceptUrl || '#')}" style="display:inline-block;background:#ffffff;color:#09090b;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">
          Open Invitation in ShieldAuth
        </a>
        <p style="margin:22px 0 0;font-size:12px;color:#71717a;">
          Sign in with <strong>${escapeHtml(toEmail)}</strong> to view and accept this invitation in your ${isTeam ? 'Teams' : 'Resellers'} tab.
        </p>
      </div>
    </div>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject,
        html
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      res.status(502).json({ sent: false, error: data.message || 'Email provider rejected request' });
      return;
    }

    res.status(200).json({ sent: true, id: data.id });
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message || 'Failed to send email' });
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
