import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class Like extends Model {}

Like.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
  },
  { sequelize, modelName: 'Like' }
);

export default Like;