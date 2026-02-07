import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './db.js';
import './models/index.js';
import { verifyMailer } from './utils/mailer.js';
import { initializeFirstRun } from './startup/initializeFirstRun.js';

const PORT = Number(process.env.PORT || 4000);

(async () => {
  try {
    await connectDB();
    await initializeFirstRun();
    await verifyMailer();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
})();
