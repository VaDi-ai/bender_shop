export function fmtPrice(n: number | string): string {
  return Number(n).toLocaleString('ru-RU')
}

export function fmtPriceWithCurrency(n: number | string): string {
  return fmtPrice(n) + ' ₽'
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`
  if (mod10 === 1) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}
