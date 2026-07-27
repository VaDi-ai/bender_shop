/**
 * Обратная запись профиля клиента из заказа (витрина A4).
 *
 * ЖЁСТКИЙ ГЕЙТ ПДн: без согласия (галочка чекаута ИЛИ уже проставленный
 * pdnConsentAt) в профиль не пишем ВООБЩЕ — данные покупателя живут только
 * в самом заказе (Order.customerName/customerPhone) и используются для него.
 *
 * Профиль молча не перетираем: заполняются только ПУСТЫЕ поля клиента.
 * Телефон шифруется (lib/client-crypto), fullName — открытым текстом,
 * как в PUT /api/profile (существующая конвенция).
 */
import { encryptClientField } from './client-crypto'

export interface ClientProfileSnapshot {
  fullName: string | null
  phone: string | null
  pdnConsentAt: Date | null
}

export interface OrderProfileInput {
  fullName?: string
  phone?: string
}

export interface ProfileWriteback {
  /** null → писать нечего (нет согласия или нет новых данных) */
  data: Record<string, unknown> | null
  /** согласие проставляется впервые → нужен SecurityLog('pdn_consent') */
  consentIsNew: boolean
}

/**
 * Чистая функция: что можно записать в Client по данным заказа.
 * Сама ничего не пишет — решение отделено от записи ради тестируемости.
 */
export function buildProfileWriteback(
  existing: ClientProfileSnapshot,
  input: OrderProfileInput,
  checkoutConsent: boolean,
): ProfileWriteback {
  const consented = checkoutConsent || !!existing.pdnConsentAt
  if (!consented) return { data: null, consentIsNew: false }

  const data: Record<string, unknown> = {}
  const fullName = (input.fullName ?? '').trim().slice(0, 120)
  const phone = (input.phone ?? '').trim().slice(0, 32)
  if (fullName && !existing.fullName) data.fullName = fullName
  if (phone && !existing.phone) data.phone = encryptClientField(phone)

  // Согласие — самостоятельный юр-факт (ревью владельца к #26): фиксируется
  // независимо от того, есть ли что писать в поля. Иначе клиент с уже
  // заполненным профилем (в т.ч. популяция старого plaintext-бага),
  // поставивший галочку, оставался бы с pdnConsentAt = null.
  if (checkoutConsent && !existing.pdnConsentAt) data.pdnConsentAt = new Date()
  const consentIsNew = 'pdnConsentAt' in data

  return { data: Object.keys(data).length ? data : null, consentIsNew }
}
