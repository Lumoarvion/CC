import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import path from 'path';
import { setupSwagger } from './docs/swagger.js';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
// Serve user-uploaded files
app.use('/uploads', express.static(path.resolve('uploads')));

// Swagger UI and OpenAPI JSON (auto-generated from JSDoc)
// Mount only if explicitly enabled
if (String(process.env.ENABLE_API_DOCS || '').toLowerCase() === 'true') {
  setupSwagger(app);
}

app.use('/api', routes);

export default app;
