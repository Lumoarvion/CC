import User from "../../models/User.js";
import AccountOtp from "../../models/AccountOtp.js";
import { Role, Degree, Department, StaffDesignation } from "../../models/index.js";
import { Op } from "sequelize";
import { requireAllowedBrand } from "../../utils/domain.js"; 
import { logger } from "../../utils/logger.js";
import { sendEmail } from "../../utils/mailer.js";
import { otpEmailHTML, otpEmailText } from "../../utils/EmailTemplates/OtpEmail.js";
import crypto from "crypto";

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

function generateOtp4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function generateTicket10() {
  // 10-digit numeric ticket using crypto.randomInt
  let s = "";
  for (let i = 0; i < 10; i++) s += String(crypto.randomInt(0, 10));
  return s;
}

function sha256Decimal(str) {
  const hex = crypto.createHash("sha256").update(String(str), "utf8").digest("hex");
  return BigInt("0x" + hex).toString(10);
}

// ---------- request-otp ----------
export async function requestOtp(req, res) {
  const startedAt = Date.now();
  // Don't log full body; it may contain sensitive data.
  const rawEmail = req.body?.email;
  let email = String(rawEmail || "").trim().toLowerCase();
  const ip = clientIp(req);
  const ua = req.headers["user-agent"] || null;

  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      logger.info("otp.request: invalid email", { email });
      return res.status(400).json({ error: "Invalid email" });
    }

    // Domain/brand allowlist check
    let brand;
    try {
      brand = await requireAllowedBrand(email);
    } catch (e) {
      if (e.code === "DOMAIN_NOT_ALLOWED") {
        logger.info("otp.request: domain not allowed", { email });
        return res.status(403).json({ error: "Email domain is not allowed" });
      }
      throw e;
    }

    // Already registered?
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      logger.info("otp.request: blocked (already registered)", { email });
      return res
        .status(409)
        .json({ error: "Email already registered. Please login." });
    }

    // ---------- Rate limits & cooldown ----------
    const COOLDOWN_SEC = Number(process.env.OTP_COOLDOWN_SEC || 30);
    const MAX_PER_EMAIL_HR = Number(process.env.OTP_MAX_PER_EMAIL_HR || 5);
    const MAX_PER_IP_HR = Number(process.env.OTP_MAX_PER_IP_HR || 20);

    const nowMs = Date.now();
    const hourAgo = new Date(nowMs - 60 * 60 * 1000);

    // Per-email hourly cap (count in parallel with lastEmailReq)
    const [emailCount, lastEmailReq] = await Promise.all([
      AccountOtp.count({ where: { email, purpose: "register", createdAt: { [Op.gt]: hourAgo } } }),
      AccountOtp.findOne({ where: { email, purpose: "register" }, order: [["createdAt", "DESC"]], attributes: ["createdAt"] }),
    ]);
    if (emailCount >= MAX_PER_EMAIL_HR) {
      const oldestEmailReq = await AccountOtp.findOne({
        where: { email, purpose: "register", createdAt: { [Op.gt]: hourAgo } },
        order: [["createdAt", "ASC"]],
        attributes: ["createdAt"],
      });
      let retryAfter = 3600;
      if (oldestEmailReq) {
        const elapsed = nowMs - new Date(oldestEmailReq.createdAt).getTime();
        retryAfter = Math.max(1, Math.ceil((3600 * 1000 - elapsed) / 1000));
      }
      logger.info("otp.request: rate_limit.email", { email, count: emailCount, retryAfter });
      res.set("Retry-After", retryAfter);
      return res.status(429).json({ error: "Too many OTP requests. Try later." });
    }

    // Per-IP hourly cap and lastIpReq in parallel (if IP known)
    let lastIpReq = null;
    if (ip) {
      const [ipCount, _lastIpReq] = await Promise.all([
        AccountOtp.count({ where: { createdIp: ip, purpose: "register", createdAt: { [Op.gt]: hourAgo } } }),
        AccountOtp.findOne({ where: { createdIp: ip, purpose: "register" }, order: [["createdAt", "DESC"]], attributes: ["createdAt"] }),
      ]);
      lastIpReq = _lastIpReq;
      if (ipCount >= MAX_PER_IP_HR) {
        const oldestIpReq = await AccountOtp.findOne({
          where: { createdIp: ip, purpose: "register", createdAt: { [Op.gt]: hourAgo } },
          order: [["createdAt", "ASC"]],
          attributes: ["createdAt"],
        });
        let retryAfter = 3600;
        if (oldestIpReq) {
          const elapsed = nowMs - new Date(oldestIpReq.createdAt).getTime();
          retryAfter = Math.max(1, Math.ceil((3600 * 1000 - elapsed) / 1000));
        }
        logger.info("otp.request: rate_limit.ip", { ip, count: ipCount, retryAfter });
        res.set("Retry-After", retryAfter);
        return res.status(429).json({ error: "Too many OTP requests from this IP. Try later." });
      }
    }

    // Cooldown: block if recent request by same email OR same IP
    const remainingFrom = (lastTs) =>
      Math.ceil((COOLDOWN_SEC * 1000 - (nowMs - new Date(lastTs).getTime())) / 1000);

    if (lastEmailReq) {
      const elapsed = nowMs - new Date(lastEmailReq.createdAt).getTime();
      if (elapsed < COOLDOWN_SEC * 1000) {
        const retryAfter = Math.max(1, remainingFrom(lastEmailReq.createdAt));
        logger.info("otp.request: cooldown.email", { email, retryAfter });
        res.set("Retry-After", retryAfter);
        return res.status(429).json({ error: `OTP recently sent. Try again in ${retryAfter}s` });
      }
    }
    if (lastIpReq) {
      const elapsed = nowMs - new Date(lastIpReq.createdAt).getTime();
      if (elapsed < COOLDOWN_SEC * 1000) {
        const retryAfter = Math.max(1, remainingFrom(lastIpReq.createdAt));
        logger.info("otp.request: cooldown.ip", { ip, retryAfter });
        res.set("Retry-After", retryAfter);
        return res.status(429).json({ error: `OTP recently sent. Try again in ${retryAfter}s` });
      }
    }

    // Invalidate previous unconsumed OTPs
    await AccountOtp.update(
      { consumed: true },
      { where: { email, purpose: "register", consumed: false } }
    );

    // Create new OTP
    const otp = generateOtp4();
    const TTL_MIN = Number(process.env.OTP_TTL_MIN || 5);
    const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000);

    const rec = await AccountOtp.create({
      email,
      purpose: "register",
      otp, // stored plaintext per your spec
      expiresAt,
      createdIp: ip,
      createdUa: ua,
    });

    // Build email (HTML + text)
    const appName = process.env.APP_NAME || "Your App";
    const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";
    const html = otpEmailHTML({ otp, minutes: TTL_MIN, appName, supportEmail });
    const text = otpEmailText({ otp, minutes: TTL_MIN, appName, supportEmail });

    // Send email
    try {
      await sendEmail({
        to: email,
        subject: `${appName} verification code: ${otp}`,
        html,
        text,
      });
    } catch (err) {
      logger.error("otp.request: mail send failed", {
        email,
        error: err, // log full object for better visibility (Render will JSON-stringify)
        message: err?.message,
        code: err?.code,
        status: err?.statusCode,
        stack: err?.stack,
      });
      return res.status(502).json({ error: "Failed to send OTP email" });
    }

    logger.info("otp.request: created", {
      email,
      domain: rec.domain,
      ttlMin: TTL_MIN,
      ms: Date.now() - startedAt,
    });

    // Include OTP in response only in dev (default true; set false in prod)
    const includeOtp = (process.env.INCLUDE_OTP_IN_RESPONSE || "true") === "true";

    return res.status(200).json({
      message: "OTP sent to email",
      email,
      domain: rec.domain,
      expiresInSeconds: TTL_MIN * 60,
      ...(includeOtp ? { otp } : {}),
    });
  } catch (err) {
    logger.error("otp.request: error", { email, error: String(err) });
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ---------- verify-otp ----------
export async function verifyOtp(req, res) {
  let { email, otp } = req.body || {};
  email = String(email || "").trim().toLowerCase();
  otp = String(otp || "").trim();

  if (!email || !otp) {
    return res.status(400).json({ error: "email and otp are required" });
  }

  try {
    const record = await AccountOtp.findOne({
      where: { email, purpose: "register", consumed: false },
      order: [["createdAt", "DESC"]],
    });
    if (!record)
      return res
        .status(400)
        .json({ error: "No active OTP. Request a new one." });

    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      await record.update({ consumed: true });
      return res.status(400).json({ error: "OTP expired" });
    }

    if (record.otp !== otp) {
      await record.update({ attempts: record.attempts + 1 });
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Mark OTP consumed and issue registration ticket (10-digit numeric)
    const TICKET_TTL_MIN = Number(process.env.OTP_TICKET_TTL_MIN || 30);
    const otpConsumedAt = new Date();
    const otpTicket = generateTicket10();
    const ticketHashDecimal = sha256Decimal(otpTicket);
    const ticketExpiresAt = new Date(Date.now() + TICKET_TTL_MIN * 60 * 1000);

    await record.update({
      consumed: true,
      otpConsumedAt,
      ticketHashDecimal,
      ticketExpiresAt,
      ticketConsumedAt: null,
    });

    // Return only roles for UI to choose next step and include ticket
    const roles = await Role.findAll({
      where: { isActive: true, roleKey: { [Op.in]: [2, 3] } }, // Staff, Student
      order: [["roleKey", "ASC"]],
      attributes: ["roleKey", "roleName", "description"],
    });

    logger.info("otp.verify.success", { email, ttlMin: TICKET_TTL_MIN });
    return res.status(200).json({
      message: "OTP verified",
      email,
      roles,
      otpTicket,
      expiresInSeconds: TICKET_TTL_MIN * 60,
    });
  } catch (err) {
    logger.error("otp.verify.error", { email, error: String(err) });
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ---------- reference-data (by roleKey) ----------
export async function referenceData(req, res) {
  try {
    const roleKey = req.query?.roleKey; // GET only
    const ip = clientIp(req);
    const rk = Number(String(roleKey ?? '').trim());
    if (!Number.isFinite(rk) || ![2, 3].includes(rk)) {
      logger.info("ref.data: bad roleKey", { roleKey, ip });
      return res.status(400).json({ error: 'Invalid or missing roleKey (2=Staff, 3=Student)' });
    }

    // Always include departments
    const departmentsPromise = Department.findAll({
      where: { isActive: true, isVisible: true },
      order: [["departmentName", "ASC"]],
      attributes: ["departmentId", "departmentName"],
    });

    if (rk === 3) {
      // Student: degrees + departments
      const [degrees, departments] = await Promise.all([
        Degree.findAll({
          where: { isActive: true },
          order: [["level", "ASC"], ["degreeName", "ASC"]],
          attributes: ["degreeId", "degreeAbbr", "degreeName", "level"],
        }),
        departmentsPromise,
      ]);
      logger.info("ref.data: student", { ip, roleKey: rk, degrees: degrees.length, departments: departments.length });
      return res.status(200).json({ roleKey: rk, degrees, departments });
    } else {
      // Staff: designations + departments
      const [designations, departments] = await Promise.all([
        StaffDesignation.findAll({
          where: { isActive: true },
          order: [["seniorityOrder", "ASC"], ["designationName", "ASC"]],
          attributes: ["designationId", "designationName", "isTeaching"],
        }),
        departmentsPromise,
      ]);
      logger.info("ref.data: staff", { ip, roleKey: rk, designations: designations.length, departments: departments.length });
      return res.status(200).json({ roleKey: rk, designations, departments });
    }
  } catch (err) {
    logger.error("ref.data: error", { error: String(err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
}



