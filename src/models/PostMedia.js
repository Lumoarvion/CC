import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class PostMedia extends Model {}

PostMedia.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    postId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'post_id',
    },
    type: {
      type: DataTypes.ENUM('image', 'gif', 'video'),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(2048),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'PostMedia',
    tableName: 'PostMedia',
    indexes: [
      { fields: ['post_id'] },
      { fields: ['type'] },
    ],
  }
);

export default PostMedia;
