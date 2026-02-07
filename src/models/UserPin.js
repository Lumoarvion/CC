import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class UserPin extends Model {}

UserPin.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      validate: { isInt: true },
    },
    postId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'post_id',
      validate: { isInt: true },
    },
    pinnedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'pinned_at',
    },
  },
  {
    sequelize,
    modelName: 'UserPin',
    tableName: 'UserPins',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['user_id', 'post_id'] },
      { fields: ['user_id', 'pinned_at'] },
    ],
  }
);

export default UserPin;
