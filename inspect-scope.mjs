import './src/models/index.js';
import { Post } from './src/models/index.js';
import { sequelize } from './src/db.js';

try {
  await sequelize.authenticate();
  const post = await Post.findByPk(8);
  console.log(post.audienceScope);
} finally {
  await sequelize.close();
}
