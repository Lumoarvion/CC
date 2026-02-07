import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import { renderDeleteOtpEmail, renderDeleteConfirmationEmail } from "./EmailTemplates/DeleteAccountEmail.js";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,          // e.g. "smtp.gmail.com"
  port: Number(process.env.SMTP_PORT||587),
  secure: String(process.env.SMTP_SECURE||"false") === "true", // true for 465
  auth: {
    user: process.env.SMTP_USER,        // SMTP username
    pass: process.env.SMTP_PASS,        // SMTP password / app password
  },
  // Optional DKIM (recommended for deliverability)
  // dkim: {
  //   domainName: "yourdomain.com",
  //   keySelector: "default",
  //   privateKey: process.env.DKIM_PRIVATE_KEY,
  // },
});

/** Minimal check to fail fast if SMTP is misconfigured */
export async function verifyMailer() {
  try {
    const TIMEOUT_MS = 5000;
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP verify timed out")), TIMEOUT_MS)),
    ]);
    logger.info("mailer.verify: SMTP connection OK");
  } catch (err) {
    logger.error("mailer.verify: SMTP connection failed", { error: String(err) });
  }
}

/**
 * Sends an email. Accepts both html & text bodies.
 */
export async function sendEmail({ to, subject, html, text, headers = {} }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": cryptoSafeId(),
      "X-Auto-Response-Suppress": "All",
      ...headers,
    },
  });
  logger.info("mailer.send: message queued", { to, messageId: info.messageId });
  return info;
}

export async function sendDeletionOtpEmail({ to, name, otp, expiresAt, reason }) {
  const appName = process.env.APP_NAME || "Your App";
  const expiresDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const minutes = Math.max(1, Math.round(Math.max(0, expiresDate.getTime() - Date.now()) / 60000));
  const { html, text } = renderDeleteOtpEmail({ name, otp, appName, expiresInMinutes: minutes, reason });
  const subject = `${appName}: confirm account deletion`;

  await sendEmail({ to, subject, html, text });
}

export async function sendDeletionCompletedEmail({ to, name, confirmedAt, reason }) {
  const appName = process.env.APP_NAME || "Your App";
  const date = confirmedAt instanceof Date ? confirmedAt : new Date(confirmedAt);
  const { html, text } = renderDeleteConfirmationEmail({ name, appName, confirmedAt: date, reason });
  const subject = `${appName}: account deleted`;

  await sendEmail({ to, subject, html, text });
}

function cryptoSafeId() {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }
}

