import { Department } from '../models/index.js';

export async function findDepartmentByBusinessId(departmentBizId, { includeHidden = false } = {}) {
  const parsed = Number(departmentBizId);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const where = { departmentId: parsed, isActive: true };
  if (!includeHidden) where.isVisible = true;

  return Department.findOne({ where });
}

export async function listHiddenDepartments() {
  return Department.findAll({
    where: { isActive: true, isVisible: false },
    order: [["departmentName", "ASC"]],
    attributes: ["id", "departmentId", "departmentName", "isVisible"],
  });
}
