import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';

function readSpecFromDisk() {
  const generated = path.resolve('docs', 'openapi.json');
  if (!fs.existsSync(generated)) return null;
  try {
    const raw = fs.readFileSync(generated, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setupSwagger(app) {
  // Serve Swagger UI that fetches the spec dynamically on load
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: { url: '/api/openapi.json' },
      customSiteTitle: 'Social Sync API Docs',
    })
  );

  // Serve the generated OpenAPI JSON; read from disk on each request
  app.get('/api/openapi.json', (req, res) => {
    const spec = readSpecFromDisk();
    if (!spec) {
      return res
        .status(404)
        .json({ error: 'Spec not generated. Run npm run docs:gen' });
    }
    return res.json(spec);
  });
}

export default { setupSwagger };
