export function requireRoleKeys(roleKeys) {
  const asArray = Array.isArray(roleKeys) ? roleKeys : [roleKeys];
  const allowed = new Set(asArray.map((rk) => Number(rk)).filter((rk) => Number.isFinite(rk)));
  return (req, res, next) => {
    const raw = req.user?.roleKey;
    const roleKey = raw === undefined || raw === null ? NaN : Number(raw);
    if (!Number.isFinite(roleKey)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!allowed.has(roleKey)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

export const requireSuperAdmin = requireRoleKeys(0);
