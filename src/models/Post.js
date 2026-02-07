import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';
import { normalizeAudienceScope } from '../utils/audienceScope.js';

class Post extends Model {}

Post.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    postType: {
      type: DataTypes.ENUM('standard', 'announcement'),
      allowNull: false,
      defaultValue: 'standard',
      field: 'post_type'
    },
    pinnedUntil: { type: DataTypes.DATE, allowNull: true, field: 'pinned_until' },
    audienceScope: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { target: { scope: 'global' }, interests: ['interest:general'] },
      field: 'audience_scope'
    },
    announcementTypeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'announcement_type_id'
    },
    mentions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    hashtags: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    urls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    quotedPostId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'quoted_post_id',
    },
    parentPostId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_post_id',
    },
    isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_archived' },
    archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    archivedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'archived_by' },
    archiveReason: { type: DataTypes.STRING(255), allowNull: true, field: 'archive_reason' }
  },
  {
    sequelize,
    modelName: 'Post',
    indexes: [
      {
        name: 'posts_feed_lookup_idx',
        fields: ['userId', 'is_archived', 'pinned_until', 'createdAt'],
      },
      {
        name: 'posts_archive_filter_idx',
        fields: ['is_archived', 'createdAt'],
      },
    ],
    validate: {
      announcementTypeConsistency() {
        this.audienceScope = normalizeAudienceScope(this.audienceScope);
        if (this.postType === 'announcement') {
          if (!this.announcementTypeId) {
            throw new Error('announcementTypeId is required for announcement posts');
          }
          if (!this.pinnedUntil) {
            throw new Error('pinnedUntil is required for announcement posts');
          }
        }
        if (this.postType !== 'announcement' && this.announcementTypeId) {
          throw new Error('announcementTypeId can only be set for announcement posts');
        }
        if (!this.isArchived && (this.archivedAt || this.archivedBy || this.archiveReason)) {
          this.archivedAt = null;
          this.archivedBy = null;
          this.archiveReason = null;
        }
      }
    }
  }
);

export default Post;
