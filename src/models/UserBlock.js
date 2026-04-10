import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class UserBlock extends Model {}

UserBlock.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    blockerUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'blocker_user_id',
      validate: { isInt: true, min: 1 },
    },
    blockedUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'blocked_user_id',
      validate: { isInt: true, min: 1 },
    },
  },
  {
    sequelize,
    modelName: 'UserBlock',
    tableName: 'UserBlocks',
    underscored: true,
    timestamps: true,
    paranoid: true,
    indexes: [
      { name: 'user_blocks_unique_pair', unique: true, fields: ['blocker_user_id', 'blocked_user_id'] },
      { name: 'user_blocks_blocker_created_idx', fields: ['blocker_user_id', 'created_at'] },
      { name: 'user_blocks_blocked_created_idx', fields: ['blocked_user_id', 'created_at'] },
    ],
    validate: {
      noSelfBlock() {
        if (this.blockerUserId === this.blockedUserId) {
          throw new Error("You can't block yourself");
        }
      },
    },
  }
);

export default UserBlock;
