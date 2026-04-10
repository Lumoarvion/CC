import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

export const REPORT_TARGET_TYPES = ['post'];
export const REPORT_REASON_CODES = ['spam', 'harassment', 'hate', 'nudity', 'violence', 'misinformation', 'other'];
export const REPORT_STATUSES = ['open', 'under_review', 'resolved', 'dismissed'];
export const REPORT_PRIORITIES = ['low', 'normal', 'high', 'critical'];
export const REPORT_RESOLUTION_ACTIONS = ['none', 'archive_post'];

class Report extends Model {}

Report.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reporterUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'reporter_user_id',
      validate: { isInt: true, min: 1 },
    },
    targetType: {
      type: DataTypes.ENUM(...REPORT_TARGET_TYPES),
      allowNull: false,
      field: 'target_type',
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'target_id',
      validate: { isInt: true, min: 1 },
    },
    reasonCode: {
      type: DataTypes.ENUM(...REPORT_REASON_CODES),
      allowNull: false,
      field: 'reason_code',
    },
    reasonText: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'reason_text',
    },
    status: {
      type: DataTypes.ENUM(...REPORT_STATUSES),
      allowNull: false,
      defaultValue: 'open',
    },
    priority: {
      type: DataTypes.ENUM(...REPORT_PRIORITIES),
      allowNull: false,
      defaultValue: 'normal',
    },
    assigneeUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'assignee_user_id',
      validate: { isInt: true, min: 1 },
    },
    resolutionNote: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'resolution_note',
    },
    resolutionAction: {
      type: DataTypes.ENUM(...REPORT_RESOLUTION_ACTIONS),
      allowNull: false,
      defaultValue: 'none',
      field: 'resolution_action',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    resolvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'resolved_by',
      validate: { isInt: true, min: 1 },
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'Report',
    indexes: [
      { name: 'reports_status_created_idx', fields: ['status', 'createdAt'] },
      { name: 'reports_target_idx', fields: ['target_type', 'target_id'] },
      { name: 'reports_reporter_created_idx', fields: ['reporter_user_id', 'createdAt'] },
      { name: 'reports_assignee_created_idx', fields: ['assignee_user_id', 'createdAt'] },
    ],
  }
);

export default Report;
