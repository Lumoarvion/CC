import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class Notification extends Model {}

Notification.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      validate: { isInt: true },
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'actor_id',
      validate: { isInt: true },
    },
    type: {
      type: DataTypes.ENUM('follow', 'like', 'comment', 'quote', 'mention'),
      allowNull: false,
    },
    entityType: {
      type: DataTypes.ENUM('user', 'post', 'comment'),
      allowNull: false,
      field: 'entity_type',
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'entity_id',
      validate: { isInt: true },
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    status: {
      type: DataTypes.ENUM('unread', 'read'),
      allowNull: false,
      defaultValue: 'unread',
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'read_at',
    },
  },
  {
    sequelize,
    modelName: 'Notification',
    tableName: 'Notifications',
    underscored: true,
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['user_id', 'status', 'created_at'] },
      { fields: ['actor_id', 'type', 'entity_id'] },
    ],
    defaultScope: {
      order: [['createdAt', 'DESC']],
    },
  }
);

export default Notification;
