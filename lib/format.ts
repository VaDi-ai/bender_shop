export function fmtPrice(n: number | string): string {
  return Number(n).toLocaleString('ru-RU')
}

export function fmtPriceWithCurrency(n: number | string): string {
  return fmtPrice(n) + ' ₽'
}
