// E-mail through Resend when RESEND_API_KEY is set (admin alerts, login links, access-request
// notifications); otherwise the server log. Never throws.
export interface Mail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendEmail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[mail not sent: RESEND_API_KEY unset] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL || 'alerts@dwaprice.com', to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error('resend failed', res.status, await res.text());
    return res.ok;
  } catch (error) {
    console.error('resend failed', error);
    return false;
  }
}

export async function notifyAdmin(subject: string, text: string, replyTo?: string): Promise<boolean> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) {
    console.warn(`[admin alert] ${subject}\n${text}`);
    return false;
  }
  return sendEmail({ to, subject: `[dwaprice API] ${subject}`, text, replyTo });
}
