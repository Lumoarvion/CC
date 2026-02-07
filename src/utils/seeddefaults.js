import { Role } from '../models/Role.js';

export async function ensureDefaultRoles({ oneTime = false } = {}) {
  const defaults = [
    { roleName: 'Super Admin', roleKey: 0, description: 'Global system owner', isActive: true, createdBy: 'system', updatedBy: 'system' },
    { roleName: 'Admin', roleKey: 1, description: 'Full system access', isActive: true, createdBy: 'system', updatedBy: 'system' },
    { roleName: 'Staff', roleKey: 2, description: 'Staff access', isActive: true, createdBy: 'system', updatedBy: 'system' },
    { roleName: 'Student', roleKey: 3, description: 'Student access', isActive: true, createdBy: 'system', updatedBy: 'system' },
  ];

  if (oneTime) {
    const count = await Role.count();
    if (count > 0) return; // seed only on fresh DB
    await Role.bulkCreate(defaults);      // Role.id is auto-increment integer
    return;
  }

  // Idempotent every‑start version
  for (const d of defaults) {
    await Role.findOrCreate({ where: { roleName: d.roleName }, defaults: d });
  }
}
