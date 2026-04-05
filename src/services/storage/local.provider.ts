import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { StorageProvider } from './types.js'

/**
 * Almacenamiento local en disco.
 * Usado en desarrollo y deployments sin S3.
 * En producción con múltiples instancias, usar S3Provider.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private resolvePath(key: string): string {
    return path.join(this.baseDir, key)
  }

  async upload(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolvePath(key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, data)
  }

  async download(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key))
  }

  async getUrl(key: string): Promise<string> {
    // En local retorna la ruta del sistema de archivos
    return this.resolvePath(key)
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(key))
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolvePath(key))
    } catch {
      // Ignorar si no existe
    }
  }
}
