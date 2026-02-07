import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const Role = sequelize.define(
  "Role",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    roleName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: "Role name cannot be empty" },
        len: { args: [2, 100], msg: "Role name must be between 2 and 100 characters" },
      },
    },
    roleKey: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      validate: { isInt: true },
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.STRING(255), allowNull: true },
    updatedBy: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: "Roles",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["roleName"] },
      { unique: true, fields: ["roleKey"] },
      { fields: ["isActive"] },
    ],
  }
);

export default Role;

