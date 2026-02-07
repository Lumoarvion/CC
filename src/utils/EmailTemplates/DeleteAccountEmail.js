const DEFAULT_APP_NAME = 'Social Sync';

function fmtMinutes(minutes) {
  if (minutes === undefined || minutes === null || Number.isNaN(Number(minutes))) return 'a few minutes';
  const safe = Math.max(1, Math.round(Number(minutes)));
  return safe === 1 ? '1 minute' : `${safe} minutes`;
}

export function renderDeleteOtpEmail({ name, otp, appName, expiresInMinutes, reason }) {
  const safeName = escapeHtml(name || 'there');
  const rawOtp = String(otp || '').trim() || '000000';
  const safeOtp = escapeHtml(rawOtp);
  const appLabel = escapeHtml(appName || DEFAULT_APP_NAME);
  const expiresText = fmtMinutes(expiresInMinutes);
  const reasonHtml = reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : '';
  const reasonText = reason ? `Reason: ${reason}` : null;

  const html = `
    <p>Hi ${safeName},</p>
    <p>We received a request to delete your ${appLabel} account.</p>
    ${reasonHtml}
    <p>Your confirmation code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:3px;">${safeOtp}</p>
    <p>The code expires in ${escapeHtml(expiresText)}. If you did not request this, please ignore this email.</p>
  `;

  const textLines = [
    `Hi ${name || 'there'},`,
    `We received a request to delete your ${appName || DEFAULT_APP_NAME} account.`,
  ];
  if (reasonText) textLines.push(reasonText);
  textLines.push('Your confirmation code is:');
  textLines.push(rawOtp);
  textLines.push(`The code expires in ${expiresText}. If you did not request this, please ignore this email.`);

  return { html: wrapHtml(html), text: textLines.join('\n\n') };
}

export function renderDeleteConfirmationEmail({ name, appName, confirmedAt, reason }) {
  const safeName = escapeHtml(name || 'there');
  const appLabel = escapeHtml(appName || DEFAULT_APP_NAME);
  const confirmedDate = toDisplayDate(confirmedAt);
  const reasonHtml = reason ? `<p><strong>Reason provided:</strong> ${escapeHtml(reason)}</p>` : '';
  const reasonText = reason ? `Reason provided: ${reason}` : null;

  const html = `
    <p>Hi ${safeName},</p>
    <p>Your ${appLabel} account has been deleted on <strong>${escapeHtml(confirmedDate)}</strong>.</p>
    ${reasonHtml}
    <p>If you believe this was a mistake, contact support immediately.</p>
  `;

  const textLines = [
    `Hi ${name || 'there'},`,
    `Your ${appName || DEFAULT_APP_NAME} account has been deleted on ${confirmedDate}.`,
  ];
  if (reasonText) textLines.push(reasonText);
  textLines.push('If you believe this was a mistake, contact support immediately.');

  return { html: wrapHtml(html), text: textLines.join('\n\n') };
}

function wrapHtml(inner) {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111;">${inner}</body></html>`;
}

function toDisplayDate(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
