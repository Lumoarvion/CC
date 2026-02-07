const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

const missing = required.filter((key) => !process.env[key] || !process.env[key]?.trim());

export const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID?.trim() ?? '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? '',
  bucket: process.env.R2_BUCKET?.trim() ?? '',
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim() ?? '',
  region: process.env.R2_REGION?.trim() ?? 'auto',
};

export function assertR2Config() {
  if (missing.length > 0) {
    throw new Error(`Missing required R2 config keys: ${missing.join(', ')}`);
  }
}
