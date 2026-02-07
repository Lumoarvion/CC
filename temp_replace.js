import dotenv from 'dotenv'; dotenv.config();

const run = async () => {
  const { connectDB } = await import('./src/db.js');
  const { replacePostMedia } = await import('./src/utils/postMedia.js');
  await connectDB();
  const r2Key = 'demo/random/admin/1769795867644-681a299d-812e-4924-aa60-12963c6d7874.png';
  const url = 'https://pub-dff809791c904ef6a024ec52315caabb.r2.dev/' + encodeURI(r2Key);
  await replacePostMedia(104, [ { type: 'image', url, metadata: { r2Key } } ]);
  console.log('Post 104 media replaced with random image');
};
run().catch((e)=>{console.error(e); process.exit(1);});
