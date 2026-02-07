import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class PostStats extends Model {}

PostStats.init(
  {
    postId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      references: { model: 'Posts', key: 'id' },
      onDelete: 'CASCADE',
    },
    likeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    commentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    quoteCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Reserved for quote/repost aggregates; populated when quote endpoints ship.',
    },
    viewCount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Reserved for Kafka view stream + Redis cache backfill.',
    },
  },
  {
    sequelize,
    modelName: 'PostStats',
    tableName: 'PostStats',
    indexes: [{ unique: true, fields: ['postId'] }],
  }
);

export default PostStats;
