import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class Comment extends Model {}

Comment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    content: { type: DataTypes.TEXT, allowNull: false }
  },
  { sequelize, modelName: 'Comment' }
);

export default Comment;