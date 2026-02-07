import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const AnnouncementType = sequelize.define(
  "AnnouncementType",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    typeKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: "typeKey cannot be empty" },
        len: { args: [2, 50], msg: "typeKey must be between 2 and 50 characters" },
        is: {
          args: /^[a-z0-9_-]+$/,
          msg: "typeKey can only include lowercase letters, numbers, hyphen, or underscore",
        },
      },
    },
    displayName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: "displayName cannot be empty" },
        len: { args: [2, 120], msg: "displayName must be between 2 and 120 characters" },
      },
    },
    description: { type: DataTypes.STRING(255), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.STRING(255), allowNull: true },
    updatedBy: { type: DataTypes.STRING(255), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: "AnnouncementTypes",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["typeKey"] },
      { unique: true, fields: ["displayName"] },
      { fields: ["isActive"] },
    ],
  }
);

export default AnnouncementType;
