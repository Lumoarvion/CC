import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const AllowedDomain = sequelize.define(
  "AllowedDomain",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // e.g., "example.com", "gmail.com"
    domain: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/ // basic domain check
      }
    },
    // Only active rules are considered
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // If true and domain="example.com", then "team.example.com" is allowed too
    allowSubdomains: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Optional governance fields
    verifiedBy: { type: DataTypes.STRING, allowNull: true },   // admin username/email
    verifiedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },      // optional sunset
  },
  {
    tableName: "Allowed_domains",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["domain"] },
      { fields: ["isActive"] },
      { fields: ["expiresAt"] },
    ],
  }
);

export default AllowedDomain;
