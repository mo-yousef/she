/**
 * Cloudinary signed direct upload helpers (task 6.7 part 2). Server-only: the API secret never
 * leaves this process. No SDK; the signature is the documented SHA-1 scheme
 * (https://cloudinary.com/documentation/authentication_signatures).
 */
import { createHash } from 'node:crypto';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Null when any of the three env vars is missing: uploads are then "not configured". */
export function cloudinaryConfig(env: Record<string, string | undefined> = process.env): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/**
 * SHA-1 hex of the `key=value` pairs sorted by key and joined with `&`, with the secret appended
 * directly. Pass every field the browser will send except file, api_key, cloud_name, resource_type.
 */
export function signCloudinaryParams(params: Record<string, string | number>, secret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(payload + secret).digest('hex');
}
