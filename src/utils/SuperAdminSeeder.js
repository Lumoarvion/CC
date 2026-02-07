import bcrypt from "bcryptjs";
import { Role, Department, User } from "../models/index.js";
import { logger } from "./logger.js";

const log = logger || console;

export async function ensureSuperAdminFromEnv() {
  const email = String(process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || "";
  const fullName = String(process.env.SUPERADMIN_NAME || "Super Admin").trim() || "Super Admin";

  if (!email || !password) {
    return false;
  }

  if (password.length < 8) {
    log.warn("startup.superadmin.skip", { reason: "weak_password" });
    return false;
  }

  const role = await Role.findOne({ where: { roleKey: 0 } });
  if (!role) {
    log.error("startup.superadmin.missing_role");
    return false;
  }

  let department = await Department.findOne({ where: { departmentId: 900 } });
  if (!department) {
    department = await Department.create({
      departmentId: 900,
      departmentName: "Administration",
      isActive: true,
      isVisible: false,
      createdBy: "system",
      updatedBy: "system",
    });
    log.info("startup.superadmin.department_created", { departmentId: department.departmentId });
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    if (existing.roleId === role.id) {
      log.info("startup.superadmin.exists", { userId: existing.id, email });
    } else {
      log.warn("startup.superadmin.skip_existing_user", { userId: existing.id, email });
    }
    return false;
  }

  const username = email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 30) || "superadmin";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    fullName,
    username,
    email,
    passwordHash,
    roleId: role.id,
    departmentId: department.id,
    degreeId: null,
    staffDesignationId: null,
    empId: null,
    gender: null,
    roleVerified: true,
    roleVerifiedBy: "system",
    emailVerified: true,
    emailVerifiedBy: "system",
    createdBy: "system",
  });

  log.info("startup.superadmin.created", { userId: user.id, email });
  return true;
}
