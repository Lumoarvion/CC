import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { User, Role, Degree, Department, StaffDesignation } from '../models/index.js';
import AccountOtp from '../models/AccountOtp.js';
import { sequelize } from '../db.js';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { isLocked as loginIsLocked, recordFailure as loginRecordFailure, clearFailures as loginClearFailures } from '../utils/loginLimiter.js';
dotenv.config();

function sha256Decimal(str) {
  const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
  return BigInt('0x' + hex).toString(10);
}

function normalizeEmail(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

export const register = async (req, res) => {
  const startedAt = Date.now();
  let baseLog = {};
  try {
    const { name, fullName, username, email: rawEmail, password, otpTicket, roleKey: reqRoleKey, accountType, degreeId: reqDegreeId, departmentId: reqDepartmentId, designationId: reqDesignationBizId, empId: reqEmpId, gender: rawGender, yearOfJoining: bodyYear, academicYear, studentId: rawStudentId } = req.body;
    const displayName = fullName || name; // support legacy 'name'
    const safeUsername = typeof username === 'string' ? username.trim() : '';
    const safeEmail = normalizeEmail(rawEmail);
    baseLog = { email: safeEmail, username: safeUsername || username };
    const missingFields = [];
    if (!displayName) missingFields.push('name');
    if (!safeUsername) missingFields.push('username');
    if (!safeEmail) missingFields.push('email');
    if (!password) missingFields.push('password');
    if (missingFields.length) {
      logger.info('register.validate.missing_fields', { ...baseLog, missingFields });
      return res.status(400).json({ message: 'All fields are required' });
    }

    const usernamePattern = /^[A-Za-z0-9._-]{3,30}$/;
    if (!usernamePattern.test(safeUsername)) {
      logger.info('register.validate.username_invalid', { ...baseLog, length: safeUsername.length });
      return res.status(400).json({ message: 'Username must be 3-30 characters and can include letters, numbers, dot, underscore, or hyphen.' });
    }

    if (!otpTicket || !/^[0-9]{10}$/.test(String(otpTicket))) {
      logger.info('register.ticket.invalid_format', { ...baseLog, provided: Boolean(otpTicket) });
      return res.status(400).json({ message: 'otpTicket is required (10 digits)' });
    }
    logger.info('register.step.ticket_format_ok', { ...baseLog });

    logger.info('register.attempt', { ...baseLog });
    const exists = safeEmail ? await User.findOne({ where: { email: safeEmail } }) : null;
    if (exists) {
      logger.info('register.validate.email_exists', { ...baseLog });
      return res.status(409).json({ message: 'Email already in use' });
    }
    logger.info('register.step.email_available', { ...baseLog });

    const usernameExists = await User.findOne({ where: { username: safeUsername } });
    if (usernameExists) {
      logger.info('register.validate.username_exists', { ...baseLog });
      return res.status(409).json({ message: 'Username already in use' });
    }
    logger.info('register.step.username_available', { ...baseLog });

    const hash = await bcrypt.hash(password, 10);
    logger.info('register.step.password_hashed', { ...baseLog });

    // Resolve roleKey with precedence over accountType
    let resolvedRoleKey;
    {
      const raw = reqRoleKey;
      const trimmed = raw !== undefined && raw !== null ? String(raw).trim() : undefined;
      const parsed = trimmed !== undefined && trimmed !== '' ? Number(trimmed) : undefined;
      if (Number.isFinite(parsed)) resolvedRoleKey = parsed;
    }
    let acctRoleKey;
    if (accountType) {
      const t = String(accountType).toLowerCase();
      if (t === 'staff' || t === 'faculty') acctRoleKey = 2;
      else if (t === 'student' || t === 'user') acctRoleKey = 3;
    }
    if (resolvedRoleKey !== undefined && acctRoleKey !== undefined && resolvedRoleKey !== acctRoleKey) {
      logger.info('register.validate.role_conflict', { ...baseLog, resolvedRoleKey, acctRoleKey });
      return res.status(400).json({ message: 'roleKey and accountType conflict' });
    }
    if (resolvedRoleKey === undefined) resolvedRoleKey = acctRoleKey !== undefined ? acctRoleKey : 3; // default Student
    if (![2, 3].includes(Number(resolvedRoleKey))) {
      logger.info('register.validate.unsupported_role', { ...baseLog, resolvedRoleKey });
      return res.status(400).json({ message: 'Unsupported roleKey' });
    }
    logger.info('register.step.role_resolved', { ...baseLog, resolvedRoleKey, accountType: accountType ?? null, rawRoleKey: reqRoleKey ?? null });

    // Degree handling: required for students, optional for staff
    let degreeId = null;
    if (Number(resolvedRoleKey) === 3) {
      if (reqDegreeId == null) {
        logger.info('register.validate.degree_missing', { ...baseLog });
        return res.status(400).json({ message: 'degreeId is required' });
      }
      const deg = await Degree.findOne({ where: { degreeId: reqDegreeId } });
      if (!deg) {
        logger.info('register.validate.degree_invalid', { ...baseLog, degreeId: reqDegreeId });
        return res.status(400).json({ message: 'Invalid degreeId' });
      }
      degreeId = deg.id;
      logger.info('register.step.degree_resolved', { ...baseLog, degreeId: reqDegreeId });
    } else if (reqDegreeId != null) {
      const deg = await Degree.findOne({ where: { degreeId: reqDegreeId } });
      if (!deg) {
        logger.info('register.validate.degree_invalid', { ...baseLog, degreeId: reqDegreeId });
        return res.status(400).json({ message: 'Invalid degreeId' });
      }
      degreeId = deg.id;
      logger.info('register.step.degree_attached_for_staff', { ...baseLog, degreeId: reqDegreeId });
    } else {
      logger.info('register.step.degree_skipped', { ...baseLog });
    }

    // Resolve department by business departmentId (not PK)
    if (reqDepartmentId == null) {
      logger.info('register.validate.department_missing', { ...baseLog });
      return res.status(400).json({ message: 'departmentId is required' });
    }
    const dept = await Department.findOne({ where: { departmentId: reqDepartmentId } });
    if (!dept) {
      logger.info('register.validate.department_invalid', { ...baseLog, departmentId: reqDepartmentId });
      return res.status(400).json({ message: 'Invalid departmentId' });
    }
    const departmentId = dept.id;
    logger.info('register.step.department_resolved', { ...baseLog, departmentId: reqDepartmentId });

    // Staff designation: required when staff (roleKey=2)
    let staffDesignationId = null;
    if (Number(resolvedRoleKey) === 2) {
      if (reqDesignationBizId == null) {
        logger.info('register.validate.designation_missing', { ...baseLog });
        return res.status(400).json({ message: 'designationId is required for staff' });
      }
      const des = await StaffDesignation.findOne({ where: { designationId: reqDesignationBizId } });
      if (!des) {
        logger.info('register.validate.designation_invalid', { ...baseLog, designationId: reqDesignationBizId });
        return res.status(400).json({ message: 'Invalid designationId' });
      }
      staffDesignationId = des.id;
      logger.info('register.step.designation_resolved', { ...baseLog, designationId: reqDesignationBizId });
    } else {
      logger.info('register.step.designation_skipped', { ...baseLog });
    }
    // Staff empId: required and unique
    let empId = null;
    if (Number(resolvedRoleKey) === 2) {
      const eid = reqEmpId != null ? String(reqEmpId).trim() : '';
      if (!eid) {
        logger.info('register.validate.empid_missing', { ...baseLog });
        return res.status(400).json({ message: 'empId is required for staff' });
      }
      if (eid.length > 64) {
        logger.info('register.validate.empid_too_long', { ...baseLog, length: eid.length });
        return res.status(400).json({ message: 'empId too long' });
      }
      const empExists = await User.findOne({ where: { empId: eid } });
      if (empExists) {
        logger.info('register.validate.empid_exists', { ...baseLog });
        return res.status(409).json({ message: 'empId already in use' });
      }
      empId = eid;
      logger.info('register.step.empid_resolved', { ...baseLog, length: eid.length });
    } else {
      logger.info('register.step.empid_skipped', { ...baseLog });
    }
    // Load roleId based on resolvedRoleKey
    let roleId;
    const role = await Role.findOne({ where: { roleKey: Number(resolvedRoleKey) } });
    if (!role) {
      logger.info('register.config.missing_role', { ...baseLog, resolvedRoleKey });
      return res.status(400).json({ message: 'Role not configured' });
    }
    roleId = role.id;
    logger.info('register.step.role_model_resolved', { ...baseLog, resolvedRoleKey });
    // Additional fields: gender (optional), yearOfJoining + studentId for students
    let gender = null;
    if (rawGender != null) {
      const g = String(rawGender).toLowerCase().replace(/\s+/g, '_');
      const allowed = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
      if (!allowed.has(g)) {
        logger.info('register.validate.gender_invalid', { ...baseLog, rawGender });
        return res.status(400).json({ message: 'Invalid gender' });
      }
      gender = g;
      logger.info('register.step.gender_normalized', { ...baseLog, gender });
    } else {
      logger.info('register.step.gender_skipped', { ...baseLog });
    }

    // Accept either academicYear or yearOfJoining
    const yearRaw = academicYear ?? bodyYear;
    let yearOfJoining = null;
    let studentId = rawStudentId != null ? String(rawStudentId).trim() : null;
    if (Number(resolvedRoleKey) === 3) {
      if (yearRaw == null || String(yearRaw).trim() === '') {
        logger.info('register.validate.year_missing', { ...baseLog });
        return res.status(400).json({ message: 'yearOfJoining is required for students' });
      }
      const yr = Number(String(yearRaw).trim());
      if (!Number.isFinite(yr) || yr < 1900 || yr > 2100) {
        logger.info('register.validate.year_invalid', { ...baseLog, providedYear: yearRaw });
        return res.status(400).json({ message: 'Invalid yearOfJoining' });
      }
      yearOfJoining = yr;
      logger.info('register.step.year_resolved', { ...baseLog, yearOfJoining });

      if (!studentId) {
        logger.info('register.validate.studentid_missing', { ...baseLog });
        return res.status(400).json({ message: 'studentId is required for students' });
      }
      const sidExists = await User.findOne({ where: { studentId } });
      if (sidExists) {
        logger.info('register.validate.studentid_exists', { ...baseLog, studentIdLength: studentId.length });
        return res.status(409).json({ message: 'studentId already in use' });
      }
      const studentIdPreview = studentId.length > 4 ? studentId.slice(0, 2) + '***' + studentId.slice(-2) : studentId;
      logger.info('register.step.studentid_resolved', { ...baseLog, studentIdPreview });
    } else {
      yearOfJoining = null;
      studentId = null;
      logger.info('register.step.student_fields_skipped', { ...baseLog });
    }

    // Enforce OTP ticket: hash, validate, and consume atomically before creating user
    const ticketHashDecimal = sha256Decimal(String(otpTicket));
    const now = new Date();
    let user;
    logger.info('register.step.otp.consume_begin', { ...baseLog });
    await sequelize.transaction(async (t) => {
      const [updated] = await AccountOtp.update(
        { ticketConsumedAt: now },
        {
          where: {
            email: safeEmail,
            purpose: 'register',
            ticketHashDecimal,
            consumed: true,
            ticketConsumedAt: null,
            ticketExpiresAt: { [Op.gt]: now },
          },
          transaction: t,
        }
      );

      if (updated !== 1) {
        logger.info('register.ticket.consume_failed', { ...baseLog });
        const rec = await AccountOtp.findOne({ where: { email: safeEmail, purpose: 'register', ticketHashDecimal }, transaction: t });
        if (!rec) {
          logger.info('register.ticket.invalid', { ...baseLog });
          throw Object.assign(new Error('ticket_invalid'), { code: 'ticket_invalid', httpStatus: 400 });
        }
        if (rec.ticketConsumedAt) {
          logger.info('register.ticket.used', { ...baseLog });
          throw Object.assign(new Error('ticket_used'), { code: 'ticket_used', httpStatus: 400 });
        }
        if (!rec.consumed) {
          logger.info('register.ticket.unverified', { ...baseLog });
          throw Object.assign(new Error('ticket_invalid'), { code: 'ticket_invalid', httpStatus: 400 });
        }
        if (rec.ticketExpiresAt && new Date(rec.ticketExpiresAt).getTime() <= now.getTime()) {
          logger.info('register.ticket.expired', { ...baseLog });
          throw Object.assign(new Error('ticket_expired'), { code: 'ticket_expired', httpStatus: 400 });
        }
        logger.info('register.ticket.invalid_generic', { ...baseLog });
        throw Object.assign(new Error('ticket_invalid'), { code: 'ticket_invalid', httpStatus: 400 });
      }

      logger.info('register.ticket.consume_success', { ...baseLog });
      logger.info('register.step.user_create_begin', { ...baseLog, resolvedRoleKey });
      user = await User.create({ fullName: displayName, username: safeUsername, email: safeEmail, passwordHash: hash, roleId, degreeId, departmentId, staffDesignationId, empId, gender, yearOfJoining, studentId }, { transaction: t });
      logger.info('register.step.user_created', { ...baseLog, userId: user.id });
    });

    logger.info('register.success', { id: user.id, email: user.email, roleKey: Number(resolvedRoleKey), status: 200, durationMs: Date.now() - startedAt });
    return res.status(200).json({
      id: user.id,
      name: user.fullName,
      username: user.username,
      email: user.email,
      degreeId: reqDegreeId ?? null,
      departmentId: reqDepartmentId,
      designationId: reqDesignationBizId ?? null,
      empId: Number(resolvedRoleKey) === 2 ? empId : null,
      gender: user.gender,
      yearOfJoining: user.yearOfJoining,
      studentId: user.studentId,
    });
  } catch (err) {
    if (err && err.httpStatus === 400 && err.code) {
      logger.info('register.error.client', { ...baseLog, code: err.code });
      return res.status(400).json({ message: err.code });
    }
    const errorPayload = { ...baseLog, error: err instanceof Error ? err.message : String(err) };
    if (err instanceof Error && err.stack) {
      errorPayload.stack = err.stack;
    }
    logger.error('register.error', errorPayload);
    return res.status(500).json({ message: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    const identifier = typeof emailOrUsername === 'string' ? emailOrUsername.trim() : '';
    if (!identifier || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ message: 'emailOrUsername and password required' });
    }

    const normalizedEmail = identifier.includes('@') ? normalizeEmail(identifier) : undefined;
    const lookupClauses = [];
    if (normalizedEmail) lookupClauses.push({ email: normalizedEmail });
    lookupClauses.push({ username: identifier });

    const user = await User.findOne({
      where: { [Op.or]: lookupClauses }
    });
    if (!user) {
      logger.info('login: no user', { identifier });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.loginDisabled || user.accountStatus === 'deleted') {
      logger.info('login: disabled', { userId: user.id, accountStatus: user.accountStatus });
      return res.status(403).json({ message: 'Account disabled' });
    }

    // Rate limit: check if account is locked
    {
      const { locked, retryAfterSec } = loginIsLocked(user.id);
      if (locked) {
        logger.info('login: locked', { userId: user.id, retryAfterSec });
        if (retryAfterSec > 0) res.set('Retry-After', Math.max(1, retryAfterSec));
        return res.status(429).json({ message: 'Too many attempts. Try again later.' });
      }
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const { justLocked, retryAfterSec, count } = loginRecordFailure(user.id);
      logger.info('login: bad password', { userId: user.id, justLocked, retryAfterSec, failCount: count });
      if (justLocked) {
        if (retryAfterSec > 0) res.set('Retry-After', Math.max(1, retryAfterSec));
        return res.status(429).json({ message: 'Too many attempts. Try again later.' });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Success: clear failure counters
    loginClearFailures(user.id);

    const token = jwt.sign({ id: user.id, v: user.jwtVersion }, process.env.JWT_SECRET, { expiresIn: '7d' });
    logger.info('login: success', { userId: user.id });
    // Map degree/department to business identifiers in response
    let respDegreeId = null;
    let respDepartmentId = null;
    try {
      if (user.degreeId != null) {
        const deg = await Degree.findByPk(user.degreeId);
        if (deg) respDegreeId = deg.degreeId;
      }
      if (user.departmentId != null) {
        const dep = await Department.findByPk(user.departmentId);
        if (dep) respDepartmentId = dep.departmentId;
      }
    } catch {}
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.fullName,
        username: user.username,
        email: user.email,
        degreeId: respDegreeId,
        departmentId: respDepartmentId,
        accountStatus: user.accountStatus,
        loginDisabled: user.loginDisabled,
      },
    });
  } catch (err) {
    logger.error('login: error', { error: String(err) });
    return res.status(500).json({ message: 'Login failed' });
  }
};




