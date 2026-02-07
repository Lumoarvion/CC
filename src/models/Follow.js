import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class Follow extends Model {}

Follow.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    followerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'follower_id',
      validate: { isInt: true },
    },
    followingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'following_id',
      validate: { isInt: true },
    },
  },
  {
    sequelize,
    modelName: 'Follow',
    tableName: 'Follows',
    underscored: true,
    timestamps: true,
    paranoid: true, // enable deletedAt for soft deletes (unfollow)
    indexes: [
      { unique: true, fields: ['follower_id', 'following_id'] },
      { fields: ['follower_id'] },
      { fields: ['following_id'] },
    ],
    validate: {
      noSelfFollow() {
        if (this.followerId === this.followingId) {
          throw new Error("You can't follow yourself");
        }
      },
    },
  }
);

export default Follow;
