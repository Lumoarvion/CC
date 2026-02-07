import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const Department = sequelize.define("Department", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  departmentId: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: { min: 1 }
  },
  departmentName: {
    type: DataTypes.STRING(120),
    allowNull: false,
    validate: { len: [2, 120] }
  },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  isVisible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { type: DataTypes.STRING(255), allowNull: true },
  updatedBy: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: "Departments",
  // Rely on unique departmentId; avoid function-based indexes for portability
  indexes: []
});


export default Department

