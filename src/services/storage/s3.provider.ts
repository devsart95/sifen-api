import type { StorageProvider } from './types.js'

/**
 * Almacenamiento en S3/MinIO/R2.
 * Carga el SDK de AWS de forma lazy para no requerirlo si no se usa.
 *
 * Compatible con cualquier proveedor S3-compatible:
 *  - AWS S3: no configurar endpoint
 *  - MinIO: S3_ENDPOINT=http://minio:9000
 *  - Cloudflare R2: S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 */
export class S3StorageProvider implements StorageProvider {
  private readonly bucket: string
  private client: unknown = null

  constructor(private readonly config: {
    bucket: string
    region: string
    endpoint?: string
    accessKeyId: string
    secretAccessKey: string
  }) {
    this.bucket = config.bucket
  }

  private async getClient() {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3')
      this.client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        forcePathStyle: !!this.config.endpoint, // requerido para MinIO
      })
    }
    return this.client as InstanceType<typeof import('@aws-sdk/client-s3').S3Client>
  }

  async upload(key: string, data: Buffer, mimeType: string): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: mimeType,
    }))
  }

  async download(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    const response = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    // Body es un ReadableStream en S3 SDK v3
    const stream = response.Body as AsyncIterable<Uint8Array>
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async getUrl(key: string): Promise<string> {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 3600, // 1 hora
    })
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (err) {
      // S3 retorna 404 como S3ServiceException — verificar por httpStatusCode
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (status === 404) return false
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
