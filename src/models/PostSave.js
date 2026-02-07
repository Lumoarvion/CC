import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class PostSave extends Model {}

PostSave.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
  },
  {
    sequelize,
    modelName: 'PostSave',
    indexes: [
      {
        name: 'post_saves_user_post_unique',
        unique: true,
        fields: ['userId', 'postId'],
      },
    ],
  }
);

export default PostSave;
