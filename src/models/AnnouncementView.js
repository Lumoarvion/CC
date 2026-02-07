import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

class AnnouncementView extends Model {}

AnnouncementView.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    announcementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'announcement_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id'
    },
    seenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'seen_at'
    }
  },
  {
    sequelize,
    modelName: 'AnnouncementView',
    tableName: 'AnnouncementViews',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['announcement_id', 'user_id'] }
    ]
  }
);

export default AnnouncementView;
