import { Role, Department, Degree, StaffDesignation, AllowedDomain, User, AnnouncementType } from '../models/index.js';
import { ensureDefaultRoles } from '../utils/seeddefaults.js';
import { ensureDefaultDepartments } from '../utils/Departmentseeder.js';
import { ensureDefaultDegrees } from '../utils/Degreeseeder.js';
import { ensureDefaultStaffDesignations } from '../utils/StaffDesignationseeder.js';
import { ensureAllowedDomains } from '../utils/AllowedDomainSeeder.js';
import { ensureSuperAdminFromEnv } from '../utils/SuperAdminSeeder.js';
import { ensureAnnouncementTypes } from '../utils/AnnouncementTypeSeeder.js';

export const initializeFirstRun = async () => {
  const [
    rolesCnt,
    deptsCnt,
    degreesCnt,
    designationsCnt,
    domainsCnt,
    usersCnt,
    announcementTypesCnt,
  ] = await Promise.all([
    Role.count(),
    Department.count(),
    Degree.count(),
    StaffDesignation.count(),
    AllowedDomain.count(),
    User.count(),
    AnnouncementType.count(),
  ]);

  let seeded = false;
  if (rolesCnt === 0) { await ensureDefaultRoles({ oneTime: true }); seeded = true; }
  if (deptsCnt === 0) { await ensureDefaultDepartments({ oneTime: true }); seeded = true; }
  if (degreesCnt === 0) { await ensureDefaultDegrees({ oneTime: true }); seeded = true; }
  if (designationsCnt === 0) { await ensureDefaultStaffDesignations({ oneTime: true }); seeded = true; }
  if (domainsCnt === 0) { await ensureAllowedDomains({ oneTime: true }); seeded = true; }
  if (announcementTypesCnt === 0) { await ensureAnnouncementTypes({ oneTime: true }); seeded = true; }
  if (usersCnt === 0 && await ensureSuperAdminFromEnv()) { seeded = true; }

  return seeded;
};
