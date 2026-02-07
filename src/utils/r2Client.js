import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { r2Config, assertR2Config } from '../config/r2.js';

function ensureConfig() {
  assertR2Config();
  if (!r2Config.accountId) {
    throw new Error('R2 accountId missing');
  }
}

function createClient() {
  ensureConfig();
  return new S3Client({
    region: r2Config.region || 'auto',
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });
}

const client = createClient();

export function buildObjectKey({ userId, extension = '', prefix = 'uploads' }) {
  const safeExt = extension?.startsWith('.') ? extension : extension ? `.${extension}` : '';
  const random = crypto.randomUUID();
  const timestamp = Date.now();
  return `${prefix}/${userId || 'anonymous'}/${timestamp}-${random}${safeExt}`;
}

export function buildPublicUrl(key) {
  if (!key) return '';
  const base = r2Config.publicBaseUrl?.replace(/\/+$/, '');
  if (base) {
    return `${base}/${encodeURI(key)}`;
  }
  return `https://${r2Config.accountId}.r2.cloudflarestorage.com/${r2Config.bucket}/${encodeURI(key)}`;
}

export async function uploadObject({ key, body, contentType, metadata }) {
  ensureConfig();
  if (!key) throw new Error('R2 upload requires object key');
  const command = new PutObjectCommand({
    Bucket: r2Config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  });
  return client.send(command);
}

export async function deleteObject(key) {
  ensureConfig();
  if (!key) return;
  const command = new DeleteObjectCommand({
    Bucket: r2Config.bucket,
    Key: key,
  });
  await client.send(command);
}

export async function createPresignedPutUrl({ key, contentType, expiresIn = 300 }) {
  ensureConfig();
  if (!key) throw new Error('Missing key for presign');
  const command = new PutObjectCommand({
    Bucket: r2Config.bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return {
    uploadUrl,
    expiresIn,
    requiredHeaders: contentType ? { 'Content-Type': contentType } : {},
  };
}
