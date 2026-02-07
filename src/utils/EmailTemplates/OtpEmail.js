export function otpEmailHTML({
  otp,
  minutes = 5,
  appName = "Your App",
  supportEmail = "support@yourdomain.com",
}) {
  const escapedApp = escapeHtml(appName);
  const escapedSupport = escapeHtml(supportEmail);
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedApp} Verification Code</title>
  <style>
    /* Client-safe inlined styles */
    body { margin:0; padding:0; background:#f6f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
    .container { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
    .card { background:#ffffff; border-radius:12px; padding: 28px 24px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
    h1 { font-size:20px; margin:0 0 12px 0; color:#111827; }
    p { font-size:14px; line-height:1.6; color:#374151; margin:0 0 12px 0; }
    .otp { letter-spacing:6px; font-weight:700; font-size:32px; color:#111827; border:1px dashed #e5e7eb; border-radius:10px; padding:14px 16px; text-align:center; background:#fafafa; }
    .meta { font-size:12px; color:#6b7280; margin-top:10px; }
    .footer { text-align:center; color:#9ca3af; font-size:12px; margin-top:18px; }
    @media (prefers-color-scheme: dark) {
      body { background:#0b0e11; }
      .card { background:#111418; box-shadow:none; }
      h1, .otp { color:#e5e7eb; }
      p { color:#cbd5e1; }
      .meta, .footer { color:#94a3b8; }
      .otp { background:#0f172a; border-color:#334155; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>Your ${escapedApp} verification code</h1>
      <p>Use the code below to continue. This code will expire in <strong>${minutes} minute${minutes == 1 ? "" : "s"}</strong>.</p>
      <div class="otp" role="text" aria-label="One-time passcode">${escapeHtml(otp)}</div>
      <p class="meta">For your security, never share this code with anyone—even if they claim to be from ${escapedApp}.</p>
      <p class="meta">If you didn't request this, you can safely ignore this email.</p>
      <p class="footer">Need help? <a href="mailto:${escapedSupport}" style="color:#3b82f6; text-decoration:none;">${escapedSupport}</a></p>
    </div>
  </div>
</body>
</html>
`;
}

export function otpEmailText({
  otp,
  minutes = 5,
  appName = "Your App",
  supportEmail = "support@yourdomain.com",
}) {
  return [
    `Your ${appName} verification code: ${otp}`,
    ``,
    `This code expires in ${minutes} minute${minutes == 1 ? "" : "s"}.`,
    `Do not share this code with anyone.`,
    `If you didn't request it, ignore this message.`,
    `Support: ${supportEmail}`,
  ].join("\n");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
