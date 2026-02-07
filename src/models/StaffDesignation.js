import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const StaffDesignation = sequelize.define(
  "StaffDesignation",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    designationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      validate: { min: 1 },
    },
    designationName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
      validate: { len: [2, 120] },
    },
    isTeaching: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    seniorityOrder: { type: DataTypes.SMALLINT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    createdBy: { type: DataTypes.STRING(255), allowNull: true },
    updatedBy: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: "StaffDesignations",
    indexes: [
      { unique: true, fields: ["designationId"] },
      { unique: true, fields: ["designationName"] },
      { fields: ["isTeaching"] },
      { fields: ["isActive"] },
    ],
  }
);

export default StaffDesignation;

