import bcrypt from "bcryptjs";
import { User, Role } from "../models/index.js";
import { findDepartmentByBusinessId, listHiddenDepartments as listHiddenDepartmentsHelper } from "../utils/departments.js";
import { logger } from "../utils/logger.js";

function normalizeEmail(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

export async function createAdmin(req, res) {
  try {
    const { fullName, username, email, password, departmentId } = req.body || {};
    const safeName = typeof fullName === "string" ? fullName.trim() : "";
    const safeUsername = typeof username === "string" ? username.trim() : "";
    const safeEmail = normalizeEmail(email);

    if (!safeName) {
      return res.status(400).json({ message: "fullName is required" });
    }
    if (!safeUsername) {
      return res.status(400).json({ message: "username is required" });
    }
    if (!USERNAME_PATTERN.test(safeUsername)) {
      return res.status(400).json({ message: "Username must be 3-30 characters and can include letters, numbers, dot, underscore, or hyphen." });
    }
    if (!safeEmail) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }
    if (departmentId === undefined || departmentId === null) {
      return res.status(400).json({ message: "departmentId is required" });
    }

    const existingEmail = await User.findOne({ where: { email: safeEmail } });
    if (existingEmail) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const existingUsername = await User.findOne({ where: { username: safeUsername } });
    if (existingUsername) {
      return res.status(409).json({ message: "Username already in use" });
    }

    const role = await Role.findOne({ where: { roleKey: 1 } });
    if (!role) {
      logger.error("admin.create.missing_role");
      return res.status(500).json({ message: "Role configuration missing for Admin" });
    }

    const department = await findDepartmentByBusinessId(departmentId, { includeHidden: true });
    if (!department) {
      return res.status(400).json({ message: "Invalid departmentId" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await User.create({
      fullName: safeName,
      username: safeUsername,
      email: safeEmail,
      passwordHash,
      roleId: role.id,
      departmentId: department.id,
      degreeId: null,
      staffDesignationId: null,
      empId: null,
      gender: null,
      roleVerified: true,
      roleVerifiedBy: `superadmin:${req.user.id}`,
      emailVerified: true,
      emailVerifiedBy: `superadmin:${req.user.id}`,
      createdBy: `superadmin:${req.user.id}`,
    });

    logger.info("admin.create.success", { actorId: req.user.id, targetId: created.id });

    return res.status(200).json({
      id: created.id,
      fullName: created.fullName,
      username: created.username,
      email: created.email,
      roleKey: 1,
      department: {
        departmentId: department.departmentId,
        departmentName: department.departmentName,
        isVisible: department.isVisible,
      },
    });
  } catch (err) {
    logger.error("admin.create.error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: "Failed to create admin" });
  }
}

export async function listHiddenDepartments(req, res) {
  try {
    const departments = await listHiddenDepartmentsHelper();
    return res.json({
      count: departments.length,
      departments: departments.map((dept) => ({
        departmentId: dept.departmentId,
        departmentName: dept.departmentName,
      })),
    });
  } catch (err) {
    logger.error("admin.hidden_departments.error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: "Failed to retrieve hidden departments" });
  }
}
