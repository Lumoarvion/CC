import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireRoleKeys, requireSuperAdmin } from "../middleware/roles.js";
import { createAdmin, listHiddenDepartments } from "../controllers/adminController.js";
import { adminDeleteUser } from "../controllers/userDeleteController.js";
import {
  createAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  archiveAnnouncement,
  restoreAnnouncement,
  deleteAnnouncement
} from "../controllers/announcementController.js";
import {
  adminAssignReport,
  adminGetReport,
  adminListReports,
  adminUpdateReportStatus,
} from '../controllers/reportController.js';

const router = Router();
const requireAdminOrSuper = requireRoleKeys([0, 1]);

router.post("/admins", authRequired, requireSuperAdmin, createAdmin);
router.get("/departments/internal", authRequired, requireSuperAdmin, listHiddenDepartments);
router.delete("/users/:id", 
  // authRequired, 
  // requireSuperAdmin, 
  adminDeleteUser);

router.post("/announcements", authRequired, requireAdminOrSuper, createAnnouncement);
router.get("/announcements", authRequired, requireAdminOrSuper, listAnnouncements);
router.patch("/announcements/:id", authRequired, requireAdminOrSuper, updateAnnouncement);
router.post("/announcements/:id/archive", authRequired, requireAdminOrSuper, archiveAnnouncement);
router.post("/announcements/:id/restore", authRequired, requireAdminOrSuper, restoreAnnouncement);
router.delete("/announcements/:id", authRequired, requireAdminOrSuper, deleteAnnouncement);
router.get('/reports', authRequired, requireAdminOrSuper, adminListReports);
router.get('/reports/:id', authRequired, requireAdminOrSuper, adminGetReport);
router.patch('/reports/:id/status', authRequired, requireAdminOrSuper, adminUpdateReportStatus);
router.post('/reports/:id/assign', authRequired, requireAdminOrSuper, adminAssignReport);

export default router;
