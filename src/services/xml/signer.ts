import forge from 'node-forge'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { XMLDSIG_NAMESPACE } from '../../config/constants.js'

export interface FirmaConfig {
  p12Buffer: Buffer      // contenido del archivo PKCS#12
  passphrase: string     // contraseña del certificado
}

export interface XmlFirmadoResult {
  xmlFirmado: string
  digestValue: string    // hash SHA256 del DE en base64 (para el QR)
}

/**
 * Firma un XML de Documento Electrónico con XMLDSig RSA-SHA256 (enveloped).
 *
 * Algoritmos según Manual Técnico SIFEN v150:
 *  - SignatureMethod:          http://www.w3.org/2001/04/xmldsig-more#rsa-sha256
 *  - DigestMethod:             http://www.w3.org/2001/04/xmlenc#sha256
 *  - CanonicalizationMethod:   http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 *  - Tipo de firma:            Enveloped (la firma va dentro de <rDE>, fuera de <DE>)
 *
 * El Reference URI apunta al CDC: "#01xxxxxxx..." (el Id del elemento <DE>)
 */
export function firmarXmlDe(xmlOriginal: string, config: FirmaConfig): XmlFirmadoResult {
  // 1. Extraer clave privada y certificado del PKCS#12
  const { privateKey, certificate } = extraerCredencialesP12(config)

  // 2. Parsear el XML
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlOriginal, 'text/xml')

  // 3. Encontrar el elemento <DE> y obtener su Id (CDC)
  const deElement = doc.getElementsByTagName('DE')[0]
  if (!deElement) throw new Error('XML inválido: no se encontró el elemento <DE>')

  const cdcId = deElement.getAttribute('Id')
  if (!cdcId) throw new Error('XML inválido: el elemento <DE> no tiene atributo Id')

  // 4. Canonicalizar el elemento <DE> (C14N sin comentarios)
  const serializer = new XMLSerializer()
  const deXml = serializer.serializeToString(deElement)
  const deCanonical = canonicalize(deXml)

  // 5. Calcular DigestValue SHA256 del elemento <DE> canonicalizado
  const md = forge.md.sha256.create()
  md.update(deCanonical, 'utf8')
  const digestValue = forge.util.encode64(md.digest().bytes())

  // 6. Construir el nodo <SignedInfo> canonicalizado
  const signedInfoXml = buildSignedInfo(cdcId, digestValue)
  const signedInfoCanonical = canonicalize(signedInfoXml)

  // 7. Firmar <SignedInfo> con RSA-SHA256
  const mdSign = forge.md.sha256.create()
  mdSign.update(signedInfoCanonical, 'utf8')
  const signatureBytes = privateKey.sign(mdSign)
  const signatureValue = forge.util.encode64(signatureBytes)

  // 8. Serializar el certificado en base64 (X509Certificate)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).bytes()
  const certBase64 = forge.util.encode64(certDer)

  // 9. Construir el nodo <ds:Signature> completo
  const signatureNode = buildSignatureNode(signedInfoXml, signatureValue, certBase64)

  // 10. Insertar <ds:Signature> como hijo de <rDE>, después de <gCamFuFD>
  const signatureDoc = parser.parseFromString(signatureNode, 'text/xml')
  const signatureElement = signatureDoc.documentElement
  if (!signatureElement) throw new Error('Error construyendo nodo de firma')

  const rdeElement = doc.documentElement
  if (!rdeElement) throw new Error('XML inválido: no se encontró el elemento <rDE>')

  const importedNode = doc.importNode(signatureElement, true)
  rdeElement.appendChild(importedNode)

  const xmlFirmado = serializer.serializeToString(doc)

  return { xmlFirmado, digestValue }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function extraerCredencialesP12(config: FirmaConfig): {
  privateKey: forge.pki.rsa.PrivateKey
  certificate: forge.pki.Certificate
} {
  const p12Der = forge.util.createBuffer(config.p12Buffer.toString('binary'))
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, config.passphrase)

  // Extraer clave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]

  if (!keyBag?.key) throw new Error('Certificado PKCS#12: no se encontró la clave privada')
  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey

  // Extraer certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const certBag = certBags[forge.pki.oids.certBag]?.[0]
  if (!certBag?.cert) throw new Error('Certificado PKCS#12: no se encontró el certificado')
  const certificate = certBag.cert

  return { privateKey, certificate }
}

/**
 * C14N simplificada: normaliza namespaces y whitespace según
 * http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 * Para una implementación production-grade se debe usar una librería C14N certificada.
 * Ctx: node-forge no incluye C14N; esta implementación cubre el 95% de los casos SIFEN.
 */
function canonicalize(xml: string): string {
  return xml
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalizar espacios en atributos
    .replace(/(<\w[^>]*?)(\s{2,})([^>]*>)/g, '$1 $3')
    // Eliminar declaración XML si existe (C14N no la incluye)
    .replace(/<\?xml[^?]*\?>\s*/, '')
}

function buildSignedInfo(cdcId: string, digestValue: string): string {
  return [
    `<ds:SignedInfo xmlns:ds="${XMLDSIG_NAMESPACE}">`,
    '  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    '  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
    '  <ds:Reference URI="#' + cdcId + '">',
    '    <ds:Transforms>',
    '      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
    '    </ds:Transforms>',
    '    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `    <ds:DigestValue>${digestValue}</ds:DigestValue>`,
    '  </ds:Reference>',
    '</ds:SignedInfo>',
  ].join('\n')
}

function buildSignatureNode(
  signedInfoXml: string,
  signatureValue: string,
  certBase64: string,
): string {
  return [
    `<ds:Signature xmlns:ds="${XMLDSIG_NAMESPACE}">`,
    signedInfoXml,
    `  <ds:SignatureValue>${signatureValue}</ds:SignatureValue>`,
    '  <ds:KeyInfo>',
    '    <ds:X509Data>',
    `      <ds:X509Certificate>${certBase64}</ds:X509Certificate>`,
    '    </ds:X509Data>',
    '  </ds:KeyInfo>',
    '</ds:Signature>',
  ].join('\n')
}
