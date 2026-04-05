import { env } from '../../config/env.js'
import { LocalStorageProvider } from './local.provider.js'
import { S3StorageProvider } from './s3.provider.js'
import type { StorageProvider } from './types.js'

let _instance: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (_instance) return _instance

  if (env.STORAGE_PROVIDER === 's3') {
    if (!env.S3_BUCKET || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('STORAGE_PROVIDER=s3 requiere S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY')
    }
    _instance = new S3StorageProvider({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    })
  } else {
    _instance = new LocalStorageProvider(env.STORAGE_LOCAL_DIR)
  }

  return _instance
}
