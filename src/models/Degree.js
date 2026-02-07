import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const Degree = sequelize.define("Degree", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  degreeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: { min: 1 },
  },
  degreeAbbr: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    validate: { len: [2, 20] },
  },
  degreeName: {
    type: DataTypes.STRING(150),
    allowNull: false,
    validate: { len: [2, 150] },
  },
  level: {
    type: DataTypes.ENUM("UG", "PG", "Diploma", "Doctorate", "Professional"),
    allowNull: false,
    defaultValue: "UG",
  },
  durationYears: { type: DataTypes.DECIMAL(3,1), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { type: DataTypes.STRING(255), allowNull: true },
  updatedBy: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: "Degrees",
  indexes: [
    { unique: true, fields: ["degreeAbbr"] },
    { unique: true, fields: ["degreeId"] },
    { fields: ["level"] },
    { fields: ["isActive"] },
  ],
});

export default Degree;

