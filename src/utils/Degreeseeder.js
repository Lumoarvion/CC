import { Degree } from '../models/Degree.js';

export async function ensureDefaultDegrees({ oneTime = false } = {}) {
  const defaults = [
    // UG degrees
    { degreeId: 1,  degreeAbbr: 'BA',    degreeName: 'Bachelor of Arts',                         level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 2,  degreeAbbr: 'BSc',   degreeName: 'Bachelor of Science',                      level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 3,  degreeAbbr: 'BCom',  degreeName: 'Bachelor of Commerce',                     level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 4,  degreeAbbr: 'BBA',   degreeName: 'Bachelor of Business Administration',      level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 5,  degreeAbbr: 'BCA',   degreeName: 'Bachelor of Computer Applications',        level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 6,  degreeAbbr: 'BE',    degreeName: 'Bachelor of Engineering',                  level: 'UG', durationYears: 4, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 7,  degreeAbbr: 'BTech', degreeName: 'Bachelor of Technology',                   level: 'UG', durationYears: 4, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 8,  degreeAbbr: 'B.Ed',  degreeName: 'Bachelor of Education',                    level: 'UG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId: 9,  degreeAbbr: 'B.Arch',degreeName: 'Bachelor of Architecture',                 level: 'UG', durationYears: 5, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:10,  degreeAbbr: 'B.Pharm',degreeName: 'Bachelor of Pharmacy',                    level: 'UG', durationYears: 4, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:11,  degreeAbbr: 'BSW',   degreeName: 'Bachelor of Social Work',                  level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:12,  degreeAbbr: 'BFA',   degreeName: 'Bachelor of Fine Arts',                    level: 'UG', durationYears: 4, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:13,  degreeAbbr: 'LLB',   degreeName: 'Bachelor of Laws',                         level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:14,  degreeAbbr: 'MBBS',  degreeName: 'Bachelor of Medicine and Surgery',         level: 'Professional', durationYears: 5.5, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:15,  degreeAbbr: 'BCS',   degreeName: 'Bachelor of Computer Science',             level: 'UG', durationYears: 3, isActive: true, createdBy: 'system', updatedBy: 'system' },

    // PG degrees
    { degreeId:101, degreeAbbr: 'MA',    degreeName: 'Master of Arts',                           level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:102, degreeAbbr: 'MSc',   degreeName: 'Master of Science',                        level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:103, degreeAbbr: 'MCom',  degreeName: 'Master of Commerce',                       level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:104, degreeAbbr: 'MBA',   degreeName: 'Master of Business Administration',        level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:105, degreeAbbr: 'MCA',   degreeName: 'Master of Computer Applications',          level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:106, degreeAbbr: 'ME',    degreeName: 'Master of Engineering',                    level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:107, degreeAbbr: 'MTech', degreeName: 'Master of Technology',                     level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:108, degreeAbbr: 'M.Ed',  degreeName: 'Master of Education',                      level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:109, degreeAbbr: 'M.Arch',degreeName: 'Master of Architecture',                   level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:110, degreeAbbr: 'M.Pharm',degreeName: 'Master of Pharmacy',                      level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
    { degreeId:111, degreeAbbr: 'LLM',   degreeName: 'Master of Laws',                           level: 'PG', durationYears: 2, isActive: true, createdBy: 'system', updatedBy: 'system' },
  ];

  if (oneTime) {
    const count = await Degree.count();
    if (count > 0) return;
    await Degree.bulkCreate(defaults);
    return;
  }

  const t = await Degree.sequelize.transaction();
  try {
    for (const d of defaults) {
      await Degree.findOrCreate({ where: { degreeId: d.degreeId }, defaults: d, transaction: t });
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

