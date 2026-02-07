import { Router } from 'express';
import { register, login } from '../controllers/authController.js';
import { requestOtp, verifyOtp, referenceData } from '../controllers/Reg/Auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

function withReqResLog(name, handler) {
  return async (req, res, next) => {
    const start = Date.now();
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || null;
    let responsePayload;

    const capturePayload = (payload) => {
      if (payload === undefined) return;
      try {
        if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
          const cloned = JSON.parse(JSON.stringify(payload));
          if (cloned && typeof cloned === 'object' && !Array.isArray(cloned)) {
            if (Object.prototype.hasOwnProperty.call(cloned, 'token')) {
              cloned.token = '[redacted]';
            }
            if (Object.prototype.hasOwnProperty.call(cloned, 'password')) {
              delete cloned.password;
            }
          }
          responsePayload = cloned;
        } else if (Buffer.isBuffer(payload)) {
          responsePayload = payload.toString('utf8');
        } else if (typeof payload === 'string') {
          responsePayload = payload.length > 2048 ? `${payload.slice(0, 2048)}...` : payload;
        } else {
          responsePayload = payload;
        }
      } catch {
        responsePayload = payload;
      }
    };

    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
      capturePayload(body);
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = function patchedSend(body) {
      if (responsePayload === undefined) {
        capturePayload(body);
      }
      return originalSend(body);
    };

    try {
      const b = req.body || {};
      logger.info(`${name}.request`, {
        ip,
        ua,
        email: b.email ? String(b.email).trim().toLowerCase() : undefined,
        username: b.username,
        roleKey: b.roleKey,
        accountType: b.accountType,
        degreeId: b.degreeId,
        departmentId: b.departmentId,
        designationId: b.designationId,
        hasEmpId: b.empId != null,
        hasGender: b.gender != null,
        hasStudentId: b.studentId != null,
      });
    } catch {}

    res.on('finish', () => {
      try {
        const meta = {
          status: res.statusCode,
          durationMs: Date.now() - start,
        };
        if (responsePayload !== undefined) {
          meta.body = responsePayload;
        }
        logger.info(`${name}.response`, meta);
      } catch {}
    });

    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

router.post('/register', withReqResLog('register', register));
router.post('/login', login);

// OTP routes
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.get('/reference-data', referenceData);

export default router;
