import multer from 'multer';
import fs from 'fs';
import path from 'path';

const baseDir = path.resolve('uploads');
const avatarsDir = path.join(baseDir, 'avatars');

// Ensure directories exist at runtime
for (const dir of [baseDir, avatarsDir]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    const name = `${req.user?.id || 'anon'}-${Date.now()}${safeExt}`;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const ok = /^(image\/(jpeg|png|webp|gif))$/i.test(file.mimetype);
  if (!ok) return cb(new Error('Only image files are allowed'));
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB

export default upload;

