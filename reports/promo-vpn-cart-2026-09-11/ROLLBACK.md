# Шаг 4: подарок в корзине + экран после оплаты + «Интерактивные акции»

Снято 2026-09-11 на ветке `feat/promo-vpn-cart`. Прод: `5e8b904` (PR #140).

## Снимок

| файл | что |
|---|---|
| `products-before.json` | `GET /api/products` — эталон каталога |
| `cartlist-before.html` | `#cartList.outerHTML` с одним товаром — эталон корзины байт-в-байт |
| `ordersuccess-before.html` | `#orderSuccess.outerHTML` — эталон экрана успеха байт-в-байт |
| `snapshot-before.json` | какой товар добавлен, subtotal, что `#vpnCartRow===null` |

## Изменения

Аддитивно, миграции нет. Четыре независимые поверхности одного ключа
`setting_promo_vpn`; добавлены узлы `cart:{enabled,link}` и `order:{enabled,link}`.
`parsePromoVpnConfig`/`parsePromoVpnRecs` не тронуты — новые узлы разбирает
`parsePromoVpnSurface` (+ `parsePromoVpnCart`/`parsePromoVpnOrder`).

- Строка-подарок: DOM-only, клон из `<template id="vpnCartTpl">`, вставляется в
  `#cartList` ПОСЛЕ `cart.map` — в массив `cart` не пишется, поэтому вне
  `subtotal()` (cart.reduce) и вне `items` заказа (cart.map). Кликабельна →
  `openPromoLink(cart.link)`, `?ref=bs_cart`. `cart.length>0 && cart.enabled`.
- Экран после оплаты: блок из `<template id="vpnOrderTpl">` в `#orderSuccess`
  при `order.enabled`, CTA → `?ref=bs_order`. Оплату/заказ не трогает.
- Админка: раздел «VPN-промо» → «Интерактивные акции», четыре тумблера
  (кнопка/карточка/подарок/экран), одно «Сохранить», подтверждение на каждое
  включение, PUT ownerOnly, плитка «вкл: N из 4».

## Доказательство: подарок вне суммы и вне payload

Не фильтрация, а отсутствие в массиве: строка-подарок — DOM-узел, не элемент
`cart`. `subtotal()` и `items=cart.map` читают только `cart`. Прибито тестом
(`tests/promo-vpn-cart-order.test.ts`) и в стоп-гейте перехватом `fetch`:
тело POST /api/orders ассертится, реальный заказ НЕ создаётся.

## Откат

Миграции нет. Все четыре по умолчанию `enabled:false`.

- **Быстрый:** owner-PUT со старым значением (в стоп-гейте это делает секция
  restore); без деплоя.
- **Обычный:** вернуть предыдущий деплой — узлы cart/order перестанут читаться,
  кнопка/карточка живут на старом парсере.
- Дропать нечего.
