# Доработка: CTA в строке-подарке + фикс bs_order→bs_cart

Снято 2026-09-11 на ветке `feat/promo-vpn-cta-fix`. Прод: `7541a21` (PR #141).

## Снимок
| файл | что |
|---|---|
| `products-before.json` | каталог — эталон |
| `cartlist-before.html` | `#cartList.outerHTML` (off-состояние, товар в корзине) — эталон байт-в-байт |
| `ordersuccess-before.html` | `#orderSuccess.outerHTML` — эталон байт-в-байт |
| `snapshot-before.json` | какой товар, subtotal, `#vpnCartRow===null` |

off-состояние этот PR не меняет, поэтому эталон совпадает с #141.

## Изменения (аддитивно, миграции нет)
- Строка-подарок `#vpnCartRow`: добавлен видимый `<div class="vgift-cta">ЗАБРАТЬ →</div>`
  + CSS. Своего обработчика у CTA нет — клик всплывает к строке (`vpnCartClaim` →
  `openPromoLink(cart.link)`). Строка остаётся DOM-only, в `cart` не пишется →
  инвариант «вне subtotal()/payload» не тронут. Только вёрстка.
- `order.link` дефолт: `?ref=bs_order` → `?ref=bs_cart` (метки bs_order на портале
  нет). Заменено в 6 местах: `lib/promo-vpn.ts`, `webapp/admin.html`,
  `scripts/qa-promo-vpn-cart.cjs`, `tests/promo-vpn-admin.test.ts`,
  `tests/promo-vpn-cart-order.test.ts`, `reports/promo-vpn-cart-2026-09-11/ROLLBACK.md`.
  Валидатор `isAllowedPromoLink` не тронут; адрес редактируем в админке.
  Единственное оставшееся упоминание `bs_order` — детектор его отсутствия в
  `scripts/qa-promo-vpn-cta.cjs`.

## Прод
`order.link` в `setting_promo_vpn` = `bs_order` → перепишется owner-PUT на
`bs_cart` (всё остаётся `enabled:false`) на шаге раскатки после деплоя.

## Откат
owner-PUT со старым `order.link` (`bs_order`) — без деплоя; либо возврат деплоя.
Схему БД не трогаю.
