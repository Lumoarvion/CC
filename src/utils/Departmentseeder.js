import { Department } from '../models/Department.js';

export async function ensureDefaultDepartments({ oneTime = false } = {}) {
  const defaults = [
    // Engineering
    { departmentId: 1,  departmentName: 'Computer Science & Engineering',           isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 2,  departmentName: 'Electronics & Communication Engineering',  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 3,  departmentName: 'Electrical & Electronics Engineering',     isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 4,  departmentName: 'Mechanical Engineering',                   isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 5,  departmentName: 'Civil Engineering',                        isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 6,  departmentName: 'Information Technology',                   isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 7,  departmentName: 'Chemical Engineering',                     isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 8,  departmentName: 'Biotechnology',                            isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 9,  departmentName: 'Aeronautical Engineering',                 isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 10, departmentName: 'Automobile Engineering',                   isActive: true, createdBy: 'system', updatedBy: 'system' },

    // Non-engineering (Science/Arts/Commerce/Management)
    { departmentId: 11, departmentName: 'Mathematics',                              isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 12, departmentName: 'Physics',                                  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 13, departmentName: 'Chemistry',                                isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 14, departmentName: 'English',                                  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 15, departmentName: 'Economics',                                isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 16, departmentName: 'Commerce',                                 isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 17, departmentName: 'Business Administration',                  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 18, departmentName: 'Psychology',                               isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 19, departmentName: 'History',                                  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { departmentId: 20, departmentName: 'Political Science',                        isActive: true, createdBy: 'system', updatedBy: 'system' },
    // Hidden administrative bucket for super-admin managed accounts
    { departmentId: 900, departmentName: 'Administration',                        isActive: true, isVisible: false, createdBy: 'system', updatedBy: 'system' },
  ];

  // one-time (seed on truly fresh DB only)
  if (oneTime) {
    const count = await Department.count();
    if (count > 0) return; // table already has rows -> do nothing
    await Department.bulkCreate(defaults);
    return;
  }

  // Idempotent every-start version (safe to run on each boot)
  const t = await Department.sequelize.transaction();
  try {
    for (const d of defaults) {
      // rely on unique(departmentId) ??? inserts only if missing
      await Department.findOrCreate({
        where: { departmentId: d.departmentId },
        defaults: d,
        transaction: t,
      });
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}
