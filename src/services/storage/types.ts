export interface StorageProvider {
  /** Sube un archivo y retorna su clave/path de acceso. */
  upload(key: string, data: Buffer, mimeType: string): Promise<void>
  /** Descarga el contenido de un archivo como Buffer. */
  download(key: string): Promise<Buffer>
  /** Retorna una URL firmada para descarga directa (S3) o la ruta local. */
  getUrl(key: string): Promise<string>
  /** Verifica si existe el archivo. */
  exists(key: string): Promise<boolean>
  /** Elimina el archivo. */
  delete(key: string): Promise<void>
}
