import User from './User.js';
import Post from './Post.js';
import Comment from './Comment.js';
import Like from './Like.js';
import Follow from './Follow.js';
import AllowedDomain from './AllowedDomain.js';
import Role from './Role.js';
import Department from './Department.js';
import AccountOtp from './AccountOtp.js';
import StaffDesignation from './StaffDesignation.js';
import Degree from './Degree.js';
import UserDeleteArchive from './UserDeleteArchive.js';
import AnnouncementView from './AnnouncementView.js';
import AnnouncementType from './AnnouncementType.js';
import PostMedia from './PostMedia.js';
import PostStats from './PostStats.js';
import PostSave from './PostSave.js';
import Notification from './Notification.js';
import UserPin from './UserPin.js';

User.hasMany(Post, { foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
Post.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false } });

User.hasMany(Comment, { foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
Comment.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false } });

Post.hasMany(Comment, { foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });
Comment.belongsTo(Post, { foreignKey: { name: 'postId', allowNull: false } });

User.belongsToMany(Post, { through: Like, as: 'LikedPosts', foreignKey: 'userId' });
Post.belongsToMany(User, { through: Like, as: 'Likers', foreignKey: 'postId' });

User.belongsToMany(Post, { through: PostSave, as: 'SavedPosts', foreignKey: 'userId' });
Post.belongsToMany(User, { through: PostSave, as: 'Savers', foreignKey: 'postId' });
User.hasMany(PostSave, { as: 'postSaves', foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
PostSave.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
Post.hasMany(PostSave, { as: 'saves', foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });
PostSave.belongsTo(Post, { foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });

User.hasMany(UserPin, { as: 'pins', foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
UserPin.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
Post.hasMany(UserPin, { as: 'postPins', foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });
UserPin.belongsTo(Post, { foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });

User.belongsToMany(User, {
  through: Follow,
  as: 'Following',
  foreignKey: 'followerId',
  otherKey: 'followingId'
});
User.belongsToMany(User, {
  through: Follow,
  as: 'Followers',
  foreignKey: 'followingId',
  otherKey: 'followerId'
});
Follow.belongsTo(User, { as: 'Follower', foreignKey: 'followerId' });
Follow.belongsTo(User, { as: 'FollowingUser', foreignKey: 'followingId' });

Post.hasMany(AnnouncementView, {
  as: 'announcementViews',
  foreignKey: { name: 'announcementId', allowNull: false },
  onDelete: 'CASCADE'
});
AnnouncementView.belongsTo(Post, {
  as: 'announcement',
  foreignKey: { name: 'announcementId', allowNull: false },
  onDelete: 'CASCADE'
});

User.hasMany(AnnouncementView, {
  as: 'announcementViews',
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE'
});
AnnouncementView.belongsTo(User, {
  as: 'viewer',
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE'
});

AnnouncementType.hasMany(Post, { as: 'announcements', foreignKey: { name: 'announcementTypeId', allowNull: true }, onDelete: 'SET NULL' });
Post.belongsTo(AnnouncementType, { as: 'announcementType', foreignKey: { name: 'announcementTypeId', allowNull: true }, onDelete: 'SET NULL' });

Post.belongsTo(Post, { as: 'quotedPost', foreignKey: { name: 'quotedPostId', allowNull: true }, onDelete: 'SET NULL' });
Post.hasMany(Post, { as: 'quotes', foreignKey: { name: 'quotedPostId', allowNull: true }, onDelete: 'SET NULL' });
Post.belongsTo(Post, { as: 'parentPost', foreignKey: { name: 'parentPostId', allowNull: true }, onDelete: 'SET NULL' });
Post.hasMany(Post, { as: 'replies', foreignKey: { name: 'parentPostId', allowNull: true }, onDelete: 'SET NULL' });

Post.hasMany(PostMedia, { as: 'media', foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });
PostMedia.belongsTo(Post, { foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });

Post.hasOne(PostStats, { as: 'stats', foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });
PostStats.belongsTo(Post, { foreignKey: { name: 'postId', allowNull: false }, onDelete: 'CASCADE' });

Notification.belongsTo(User, { as: 'recipient', foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
Notification.belongsTo(User, { as: 'actor', foreignKey: { name: 'actorId', allowNull: false }, onDelete: 'CASCADE' });

// Role relations (required FK on User)
Role.hasMany(User, { foreignKey: { name: 'roleId', allowNull: false }, onDelete: 'RESTRICT' });
User.belongsTo(Role, { foreignKey: { name: 'roleId', allowNull: false } });
// (Staff model removed; using single User table)

// Degree relations (optional FK on User)
Degree.hasMany(User, { foreignKey: { name: 'degreeId', allowNull: true }, onDelete: 'RESTRICT' });
User.belongsTo(Degree, { foreignKey: { name: 'degreeId', allowNull: true } });

// Department relations (required FK on User)
Department.hasMany(User, { foreignKey: { name: 'departmentId', allowNull: false }, onDelete: 'RESTRICT' });
User.belongsTo(Department, { foreignKey: { name: 'departmentId', allowNull: false } });
// StaffDesignation relations (optional FK on User; required only for staff by controller)
StaffDesignation.hasMany(User, { foreignKey: { name: 'staffDesignationId', allowNull: true }, onDelete: 'RESTRICT' });
User.belongsTo(StaffDesignation, { foreignKey: { name: 'staffDesignationId', allowNull: true } });

User.hasMany(UserDeleteArchive, { foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });
UserDeleteArchive.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, onDelete: 'CASCADE' });

export {
  User,
  Post,
  Comment,
  Like,
  Follow,
  AllowedDomain,
  Role,
  Department,
  AccountOtp,
  Degree,
  StaffDesignation,
  UserDeleteArchive,
  AnnouncementView,
  AnnouncementType,
  PostMedia,
  PostStats,
  PostSave,
  Notification,
  UserPin
};
