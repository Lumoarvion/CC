import { StaffDesignation } from '../models/StaffDesignation.js';

export async function ensureDefaultStaffDesignations({ oneTime = false } = {}) {
  const defaults = [
    // Teaching (seniority high to low)
    { designationId: 1,  designationName: 'Principal',                isTeaching: true,  seniorityOrder: 1,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 2,  designationName: 'Vice Principal',           isTeaching: true,  seniorityOrder: 2,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 3,  designationName: 'Dean',                     isTeaching: true,  seniorityOrder: 3,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 4,  designationName: 'Head of Department (HOD)', isTeaching: true,  seniorityOrder: 4,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 5,  designationName: 'Professor',                isTeaching: true,  seniorityOrder: 5,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 6,  designationName: 'Associate Professor',      isTeaching: true,  seniorityOrder: 6,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 7,  designationName: 'Assistant Professor',      isTeaching: true,  seniorityOrder: 7,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 8,  designationName: 'Lecturer',                 isTeaching: true,  seniorityOrder: 8,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 9,  designationName: 'Visiting Faculty',         isTeaching: true,  seniorityOrder: 9,  isActive: true, createdBy: 'system', updatedBy: 'system' },

    // Non-teaching
    { designationId: 101, designationName: 'Registrar',               isTeaching: false, seniorityOrder: 1,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 102, designationName: 'Controller of Examinations', isTeaching: false, seniorityOrder: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 103, designationName: 'Librarian',               isTeaching: false, seniorityOrder: 3,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 104, designationName: 'Assistant Librarian',     isTeaching: false, seniorityOrder: 4,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 105, designationName: 'Lab Assistant',           isTeaching: false, seniorityOrder: 5,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 106, designationName: 'Technical Assistant',     isTeaching: false, seniorityOrder: 6,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 107, designationName: 'System Administrator',    isTeaching: false, seniorityOrder: 7,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 108, designationName: 'Placement Officer',       isTeaching: false, seniorityOrder: 8,  isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 109, designationName: 'Training & Placement Coordinator', isTeaching: false, seniorityOrder: 9, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 110, designationName: 'Administrative Officer',  isTeaching: false, seniorityOrder: 10, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 111, designationName: 'Accountant',              isTeaching: false, seniorityOrder: 11, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 112, designationName: 'Office Assistant',        isTeaching: false, seniorityOrder: 12, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 113, designationName: 'Clerk',                   isTeaching: false, seniorityOrder: 13, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 114, designationName: 'Support Staff',           isTeaching: false, seniorityOrder: 14, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { designationId: 115, designationName: 'Counselor',               isTeaching: false, seniorityOrder: 15, isActive: true, createdBy: 'system', updatedBy: 'system' },
  ];

  if (oneTime) {
    const count = await StaffDesignation.count();
    if (count > 0) return; // seed once on fresh DB
    await StaffDesignation.bulkCreate(defaults);
    return;
  }

  const t = await StaffDesignation.sequelize.transaction();
  try {
    for (const d of defaults) {
      await StaffDesignation.findOrCreate({
        where: { designationId: d.designationId },
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

