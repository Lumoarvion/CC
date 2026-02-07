import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    username: { type: DataTypes.STRING(60), allowNull: true, unique: true },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
      set(val) {
        this.setDataValue("email", String(val).trim().toLowerCase());
        // also set domain automatically on email set
        const parts = String(val).trim().toLowerCase().split("@");
        if (parts.length === 2) this.setDataValue("domain", parts[1]);
      },
    },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "email_verified" },
    emailVerifiedBy: { type: DataTypes.STRING(255), allowNull: true, field: "email_verified_by" },

    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "role_id",
      validate: { isInt: true },
    },
    roleVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "role_verified" },
    roleVerifiedBy: { type: DataTypes.STRING(255), allowNull: true, field: "role_verified_by" },

    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: "password_hash" },

    domain: { type: DataTypes.STRING(255), allowNull: false },

    // Optional linkage to degree (required for students only)
    degreeId: { type: DataTypes.INTEGER, allowNull: true, field: "degree_id", validate: { isInt: true } },

    // Department linkage (required; references Departments table)
    departmentId: { type: DataTypes.INTEGER, allowNull: false, field: "department_id", validate: { isInt: true } },

    // Staff-only: linkage to StaffDesignation (FK). Optional for students; required for staff via controller validation.
    staffDesignationId: { type: DataTypes.INTEGER, allowNull: true, field: "staff_designation_id", validate: { isInt: true } },

    // Staff employee identifier (unique). Optional for students; required for staff via controller.
    empId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: "emp_id" },

    // Public URL to the user's avatar image
    avatarUrl: { type: DataTypes.STRING(2048), allowNull: true, field: "avatar_url" },
    // Public URL to the user's high-res avatar image
    avatarUrlFull: { type: DataTypes.STRING(2048), allowNull: true, field: "avatar_url_full" },
    bannerUrl: { type: DataTypes.STRING(2048), allowNull: true, field: "banner_url" },

    fullName: { type: DataTypes.STRING(150), allowNull: true, field: "full_name" },
    website: { type: DataTypes.STRING(512), allowNull: true },
    location: { type: DataTypes.STRING(255), allowNull: true },
    joinDate: { type: DataTypes.DATEONLY, allowNull: true, field: "join_date" },
    isVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "is_verified" },
    isPrivate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "is_private" },
    isLimited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "is_limited" },
    gender: {
      type: DataTypes.ENUM("male", "female", "other", "prefer_not_to_say"),
      allowNull: true,
    },
    yearOfJoining: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      field: "year_of_joining",
      validate: {
        min: 1900,
        max: 2100,
      },
    },
    studentId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: "student_id" },
    bio: { type: DataTypes.TEXT, allowNull: true },

    followersCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "followers_count",
      validate: { min: 0 },
    },
    followingCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "following_count",
      validate: { min: 0 },
    },

    accountStatus: {
      type: DataTypes.ENUM("active", "delete_requested", "pending_delete", "deleted"),
      allowNull: false,
      defaultValue: "active",
      field: "account_status",
    },
    loginDisabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "login_disabled",
    },
    jwtVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "jwt_version",
    },

    deleteRequestedAt: { type: DataTypes.DATE, allowNull: true, field: "delete_requested_at" },
    deleteConfirmedAt: { type: DataTypes.DATE, allowNull: true, field: "delete_confirmed_at" },
    deleteCancelledAt: { type: DataTypes.DATE, allowNull: true, field: "delete_cancelled_at" },
    deleteCompletedAt: { type: DataTypes.DATE, allowNull: true, field: "delete_completed_at" },
    deleteScheduledAt: { type: DataTypes.DATE, allowNull: true, field: "delete_scheduled_at" },
    deleteReason: { type: DataTypes.TEXT, allowNull: true, field: "delete_reason" },
    deleteRequestId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: "delete_request_id" },
    deleteRequestIp: { type: DataTypes.STRING(64), allowNull: true, field: "delete_request_ip" },
    deleteRequestUserAgent: { type: DataTypes.STRING(512), allowNull: true, field: "delete_request_user_agent" },
    deleteOtpHash: { type: DataTypes.STRING(255), allowNull: true, field: "delete_otp_hash" },
    deleteOtpExpiresAt: { type: DataTypes.DATE, allowNull: true, field: "delete_otp_expires_at" },

    anonymizedSlug: { type: DataTypes.STRING(120), allowNull: true, unique: true, field: "anonymized_slug" },
    sanitizedAt: { type: DataTypes.DATE, allowNull: true, field: "sanitized_at" },

    meta: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }, // JSONB

    createdBy: { type: DataTypes.STRING(255), allowNull: true, field: "created_by" },
  },
  {
    tableName: "Users",
    underscored: true,
    timestamps: true, // created_at, updated_at
    indexes: [
      { fields: ["staff_designation_id"] },
      { unique: true, fields: ["emp_id"] },
      { fields: ["account_status"] },
      { fields: ["delete_scheduled_at"] },
      { fields: ["followers_count"] },
      { fields: ["following_count"] },
    ],
  }
);

export default User;
