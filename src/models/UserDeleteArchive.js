import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

const UserDeleteArchive = sequelize.define(
  'UserDeleteArchive',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      validate: { isInt: true },
    },
    snapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    reason: { type: DataTypes.TEXT, allowNull: true },
    requestedAt: { type: DataTypes.DATE, allowNull: true, field: 'requested_at' },
    confirmedAt: { type: DataTypes.DATE, allowNull: true, field: 'confirmed_at' },
  },
  {
    tableName: 'UserDeleteArchive',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['user_id'] }],
  }
);

export default UserDeleteArchive;
