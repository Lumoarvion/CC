import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';

const run = async () => {
  const { buildObjectKey, buildPublicUrl, uploadObject } = await import('./src/utils/r2Client.js');
  const { connectDB } = await import('./src/db.js');
  await connectDB();
  const filePath = path.resolve('random-banner.png');
  const body = fs.readFileSync(filePath);
  const key = buildObjectKey({ userId: 'admin', extension: 'png', prefix: 'demo/random' });
  await uploadObject({ key, body, contentType: 'image/png', metadata: { source: 'random-generated' } });
  const url = buildPublicUrl(key);
  console.log(JSON.stringify({ key, url }, null, 2));
};
run().catch((e) => { console.error(e); process.exit(1); });
