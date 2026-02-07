import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User, Role } from '../models/index.js';
dotenv.config();

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Missing token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const user = await User.findByPk(payload.id, {
      include: [{ model: Role, attributes: ['roleKey', 'roleName'] }],
    });
    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    if (payload.v !== undefined && payload.v !== user.jwtVersion) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    if (user.loginDisabled || user.accountStatus === 'deleted') {
      return res.status(403).json({ message: 'Account disabled' });
    }

    req.user = {
      id: user.id,
      accountStatus: user.accountStatus,
      roleId: user.roleId,
      roleKey: user.Role ? user.Role.roleKey : null,
      roleName: user.Role ? user.Role.roleName : null,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}
