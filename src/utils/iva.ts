import { AFEC_IVA, TASA_IVA } from '../config/constants.js'

export interface ItemIva {
  precioUnitario: number
  cantidad: number
  descuento?: number
  afecIva: (typeof AFEC_IVA)[keyof typeof AFEC_IVA]
  tasaIva?: 10 | 5
}

export interface TotalesIva {
  subtotal10: number
  subtotal5: number
  subtotalExento: number
  subtotalExonerado: number
  iva10: number
  iva5: number
  totalIva: number
  totalBruto: number
  totalNeto: number
}

/**
 * Calcula IVA de un ítem individual.
 * En Paraguay el precio es IVA incluido, por lo que:
 * - IVA 10% = precio / 11
 * - IVA 5%  = precio / 21
 */
export function calcularIvaItem(item: ItemIva): {
  montoItem: number
  ivaItem: number
  baseImponible: number
} {
  const descuento = item.descuento ?? 0
  const montoItem = roundGs(item.precioUnitario * item.cantidad - descuento)

  if (item.afecIva === AFEC_IVA.EXENTO || item.afecIva === AFEC_IVA.EXONERADO) {
    return { montoItem, ivaItem: 0, baseImponible: montoItem }
  }

  const tasa = item.tasaIva ?? TASA_IVA.DIEZ
  const divisor = tasa === TASA_IVA.DIEZ ? 11 : 21
  const ivaItem = roundGs(montoItem / divisor)
  const baseImponible = montoItem - ivaItem

  return { montoItem, ivaItem, baseImponible }
}

/**
 * Calcula los totales consolidados de IVA para todos los ítems del DE.
 */
export function calcularTotalesIva(items: ItemIva[]): TotalesIva {
  let subtotal10 = 0
  let subtotal5 = 0
  let subtotalExento = 0
  let subtotalExonerado = 0
  let iva10 = 0
  let iva5 = 0

  for (const item of items) {
    const { montoItem, ivaItem } = calcularIvaItem(item)

    switch (item.afecIva) {
      case AFEC_IVA.GRAVADO:
        if ((item.tasaIva ?? TASA_IVA.DIEZ) === TASA_IVA.DIEZ) {
          subtotal10 += montoItem
          iva10 += ivaItem
        } else {
          subtotal5 += montoItem
          iva5 += ivaItem
        }
        break
      case AFEC_IVA.EXENTO:
        subtotalExento += montoItem
        break
      case AFEC_IVA.EXONERADO:
        subtotalExonerado += montoItem
        break
      case AFEC_IVA.GRAVADO_PARCIAL:
        // Caso especial: se distribuye entre gravado y exento
        subtotal10 += montoItem
        iva10 += ivaItem
        break
    }
  }

  const totalIva = iva10 + iva5
  const totalBruto = subtotal10 + subtotal5 + subtotalExento + subtotalExonerado
  const totalNeto = totalBruto

  return {
    subtotal10: roundGs(subtotal10),
    subtotal5: roundGs(subtotal5),
    subtotalExento: roundGs(subtotalExento),
    subtotalExonerado: roundGs(subtotalExonerado),
    iva10: roundGs(iva10),
    iva5: roundGs(iva5),
    totalIva: roundGs(totalIva),
    totalBruto: roundGs(totalBruto),
    totalNeto: roundGs(totalNeto),
  }
}

/** Redondea a enteros (Guaraníes no tienen decimales) */
function roundGs(value: number): number {
  return Math.round(value)
}
