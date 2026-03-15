import 'dotenv/config'
import { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed scripts disabled in production')
}



// ─── HELPERS ────────────────────────────────────────────────────────────────

function sku(parts: string[]): string {
  return parts
    .join('-')
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
}

// ─── PRICES ─────────────────────────────────────────────────────────────────
// Средние рыночные цены в рублях (РФ, март 2025)

const PRICES: Record<string, number> = {
  // iPhone 13
  'iphone-13-128': 42000, 'iphone-13-512': 55000,
  // iPhone 14
  'iphone-14-128': 52000, 'iphone-14-512': 65000,
  'iphone-14-pro-max-512': 82000, 'iphone-14-pro-max-1tb': 95000,
  // iPhone 15
  'iphone-15-128': 62000, 'iphone-15-256': 70000, 'iphone-15-512': 82000,
  'iphone-15-pro-max-512': 105000, 'iphone-15-pro-max-1tb': 120000,
  // iPhone 16
  'iphone-16-128': 72000, 'iphone-16-256': 82000, 'iphone-16-512': 95000,
  'iphone-16-plus-128': 82000, 'iphone-16-plus-256': 92000, 'iphone-16-plus-512': 105000,
  'iphone-16-pro-128': 95000, 'iphone-16-pro-256': 108000, 'iphone-16-pro-512': 122000, 'iphone-16-pro-1tb': 138000,
  'iphone-16-pro-max-256': 115000, 'iphone-16-pro-max-512': 130000, 'iphone-16-pro-max-1tb': 148000,
  // iPhone 17
  'iphone-17-256': 90000, 'iphone-17-512': 105000,
  'iphone-17-air-256': 95000, 'iphone-17-air-512': 110000, 'iphone-17-air-1tb': 128000,
  'iphone-17-pro-256': 115000, 'iphone-17-pro-512': 130000, 'iphone-17-pro-1tb': 148000,
  'iphone-17-pro-max-256': 130000, 'iphone-17-pro-max-512': 148000, 'iphone-17-pro-max-1tb': 168000, 'iphone-17-pro-max-2tb': 190000,
  // MacBook Air
  'macbook-air-m1-8-256': 72000, 'macbook-air-m2-8-256': 82000, 'macbook-air-m2-8-512': 95000,
  'macbook-air-m3-8-256': 95000, 'macbook-air-m3-8-512': 110000,
  'macbook-air-m4-16-256': 110000, 'macbook-air-m4-16-512': 125000,
  'macbook-air-m4-32-1tb': 150000, 'macbook-air-m4-32-2tb': 175000,
  // MacBook Pro
  'macbook-pro-14': 175000, 'macbook-pro-16': 215000,
  // Mac Mini
  'mac-mini-m4': 62000, 'mac-mini-m4-pro': 95000,
  // Mac Studio
  'mac-studio-m4-max': 280000, 'mac-studio-m3-ultra': 420000,
  // iMac
  'imac-m4': 135000,
  // iPad 11
  'ipad-11-128': 42000, 'ipad-11-256': 52000, 'ipad-11-512': 65000,
  // iPad Air 11
  'ipad-air-11-128': 65000, 'ipad-air-11-256': 75000, 'ipad-air-11-512': 90000, 'ipad-air-11-1tb': 110000,
  // iPad Air 13
  'ipad-air-13-128': 80000, 'ipad-air-13-256': 92000, 'ipad-air-13-512': 108000, 'ipad-air-13-1tb': 128000,
  // iPad Pro 11
  'ipad-pro-11-256': 95000, 'ipad-pro-11-512': 112000, 'ipad-pro-11-1tb': 135000, 'ipad-pro-11-2tb': 158000,
  // iPad Pro 13
  'ipad-pro-13-256': 115000, 'ipad-pro-13-512': 135000, 'ipad-pro-13-1tb': 158000, 'ipad-pro-13-2tb': 185000,
  // Apple Watch
  'watch-se2': 22000, 'watch-se3': 24000,
  'watch-s10': 42000, 'watch-s11': 48000,
  'watch-ultra2': 72000, 'watch-ultra3': 82000,
  // AirPods
  'airpods-max': 42000, 'airpods-pro2': 18000, 'airpods-pro3': 22000,
  'airpods-4': 14000, 'airpods-4-anc': 17000,
  // Samsung S24
  'galaxy-s24-128': 52000, 'galaxy-s24-256': 62000, 'galaxy-s24-512': 75000,
  'galaxy-s24-plus-256': 72000, 'galaxy-s24-plus-512': 85000,
  'galaxy-s24-ultra-256': 92000, 'galaxy-s24-ultra-512': 108000, 'galaxy-s24-ultra-1tb': 128000,
  // Samsung S25
  'galaxy-s25-128': 72000, 'galaxy-s25-256': 82000, 'galaxy-s25-512': 95000,
  'galaxy-s25-plus-256': 92000, 'galaxy-s25-plus-512': 108000,
  'galaxy-s25-edge-256': 105000, 'galaxy-s25-edge-512': 122000,
  'galaxy-s25-ultra-256': 120000, 'galaxy-s25-ultra-512': 138000, 'galaxy-s25-ultra-1tb': 158000,
  // Huawei
  'huawei-pura-80': 62000, 'huawei-pura-80-pro': 82000,
  // Honor
  'honor-200-8-256': 28000, 'honor-200-12-512': 36000,
  'honor-400-8-256': 32000, 'honor-400-12-256': 38000, 'honor-400-12-512': 45000,
  'honor-x7d': 18000, 'honor-x8c': 22000, 'honor-x9c': 28000, 'honor-x9d': 34000,
  // Google Pixel
  'pixel-6': 32000, 'pixel-6a': 25000, 'pixel-7-pro': 45000,
  'pixel-8a': 42000, 'pixel-9a': 52000,
  'pixel-9-pro': 72000, 'pixel-9-pro-xl': 85000,
  'pixel-10-pro': 82000, 'pixel-10-pro-xl': 95000,
  // Dyson стайлеры
  'dyson-hs05': 28000, 'dyson-hs07': 35000, 'dyson-hs08': 42000, 'dyson-hs09': 52000,
  // Dyson фены
  'dyson-hd18-pro': 48000, 'dyson-hd16': 42000, 'dyson-hd15': 38000,
  'dyson-hd08': 28000, 'dyson-hd07': 25000, 'dyson-hd03': 22000,
  'dyson-supersonic-pro': 55000,
  // Dyson выпрямители
  'dyson-ht01': 28000,
  // Dyson пылесосы
  'dyson-v15s': 62000, 'dyson-v15-gm': 55000, 'dyson-v15': 52000,
  'dyson-g5gr': 65000, 'dyson-v15-handstick': 48000,
  'dyson-wash': 72000, 'dyson-360-vis-nav': 82000,
  'dyson-v11': 38000, 'dyson-v10': 28000, 'dyson-pencilvac': 22000,
  // Dreame
  'dreame-robot': 35000, 'dreame-vertical': 28000, 'dreame-vertical-wash': 38000,
  // Roborock
  'roborock-saros-z70': 85000, 'roborock-qrevo-maxv': 72000,
  'roborock-qrevo-c': 52000, 'roborock-qrevo-curv': 62000, 'roborock-qrevo-edge': 58000,
  'roborock-f25-lt': 35000, 'roborock-h60': 42000,
  // Xiaomi пылесосы
  'xiaomi-g20': 25000, 'xiaomi-g20-lite': 20000, 'xiaomi-g20-max': 32000,
  // PlayStation
  'ps5': 52000, 'ps5-slim': 45000, 'ps5-pro': 75000,
  'ps5-drive': 12000, 'ps5-gamepad': 8500,
  // Xbox
  'xbox-series-x': 45000, 'xbox-series-s': 28000, 'xbox-gamepad': 6500,
  // Steam Deck
  'steam-deck-512': 52000, 'steam-deck-1tb': 65000,
  // Nintendo
  'switch-2': 45000, 'switch-1': 28000, 'switch-lite': 22000,
  // VR
  'oculus-quest-3s': 38000, 'oculus-quest-3': 52000,
  // Фото/Видео
  'canon-gx7-mark3': 65000, 'nikon-zf': 120000, 'nikon-z6iii': 185000,
  'dji-osmo-pocket3': 38000, 'dji-osmo-action3': 28000,
  'insta360-x3': 35000, 'insta360-x4': 45000, 'insta360-x5': 58000,
  'ray-ban-meta-headliner': 32000, 'ray-ban-meta-skyler': 32000,
  // Колонки Яндекс
  'yandex-mini3': 8000, 'yandex-light': 5500, 'yandex-street': 12000,
  'yandex-max': 22000, 'yandex-duo-max': 35000, 'yandex-midi': 14000,
  // JBL
  'jbl-charge6': 15000, 'jbl-xtreme4': 28000, 'jbl-go4': 5000,
  'jbl-flip7': 12000, 'jbl-partybox520': 55000, 'jbl-partybox-encore2': 38000,
  // HomePod
  'homepod2': 32000, 'homepod-mini': 12000,
  // Garmin
  'garmin-fr55': 18000, 'garmin-fr165': 28000, 'garmin-fr275': 38000,
  'garmin-fr275s': 38000, 'garmin-fr265-plus': 42000,
  'garmin-fenix8': 72000, 'garmin-fenix7': 55000,
  'garmin-vivoactive6': 28000, 'garmin-instinct3': 42000,
  'garmin-fr1055': 52000, 'garmin-enduro3': 85000,
  // Аксессуары
  'acc-case-basic': 2500, 'acc-case-original': 5500, 'acc-case-pitaka': 8500,
  'acc-charger-block': 3500, 'acc-glass-remax': 1500, 'acc-film-circle': 800,
  'acc-cable-original': 2500, 'acc-glass-camera': 1200, 'acc-dock-3in1': 5500,
  'acc-case-airpods4': 1500, 'acc-case-airpods-pro2': 1500,
  'acc-magic-keyboard': 18000, 'acc-pencil2': 9500, 'acc-pencil-usbc': 8500,
  'acc-pencil-pro': 12000, 'acc-folio': 8500, 'acc-case-book': 4500,
  'acc-charger-block-ipad': 3500, 'acc-glass-ipad': 2500,
  'acc-magic-mouse': 8500, 'acc-sleeve': 4500, 'acc-bag': 5500,
  'acc-bumper': 3500, 'acc-adapter-original': 2500, 'acc-apple-adapter': 1800,
  'acc-cable-2m': 2500, 'acc-plug-adapter': 800,
  'acc-watch-band': 3500, 'acc-watch-glass': 1200, 'acc-watch-cable': 2000,
  'acc-charger-block-watch': 2500,
  'acc-dock-3in1-watch': 5500,
  // Услуги
  'service-engraving': 2500, 'service-gift-wrap': 500,
}

function price(key: string, fallback = 15000): number {
  return PRICES[key] ?? fallback
}

// ─── SPECS DATABASE ──────────────────────────────────────────────────────────

const SPECS: Record<string, Record<string, string>> = {
  'iPhone 13': { Экран: '6.1" Super Retina XDR OLED', Процессор: 'Apple A15 Bionic', Камера: '12 МП + 12 МП', Аккумулятор: '3227 мАч', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 15+' },
  'iPhone 14': { Экран: '6.1" Super Retina XDR OLED', Процессор: 'Apple A15 Bionic', Камера: '12 МП + 12 МП', Аккумулятор: '3279 мАч', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 16+' },
  'iPhone 14 Pro Max': { Экран: '6.7" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A16 Bionic', Камера: '48 МП + 12 МП + 12 МП', Аккумулятор: '4323 мАч', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 16+' },
  'iPhone 15': { Экран: '6.1" Super Retina XDR OLED', Процессор: 'Apple A16 Bionic', Камера: '48 МП + 12 МП', Аккумулятор: '3349 мАч', Порт: 'USB-C', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 17+' },
  'iPhone 15 Pro Max': { Экран: '6.7" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A17 Pro', Камера: '48 МП + 12 МП + 12 МП', Аккумулятор: '4422 мАч', Порт: 'USB-C 3.0', SIM: 'eSIM', Защита: 'IP68', Корпус: 'Титан', ОС: 'iOS 17+' },
  'iPhone 16': { Экран: '6.1" Super Retina XDR OLED', Процессор: 'Apple A18', Камера: '48 МП + 12 МП', Аккумулятор: '3561 мАч', Порт: 'USB-C', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 18+' },
  'iPhone 16 Plus': { Экран: '6.7" Super Retina XDR OLED', Процессор: 'Apple A18', Камера: '48 МП + 12 МП', Аккумулятор: '4674 мАч', Порт: 'USB-C', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 18+' },
  'iPhone 16 Pro': { Экран: '6.3" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A18 Pro', Камера: '48 МП + 48 МП + 12 МП', Аккумулятор: '3582 мАч', Порт: 'USB-C 3.0', SIM: 'nano-SIM + eSIM', Защита: 'IP68', Корпус: 'Титан', ОС: 'iOS 18+' },
  'iPhone 16 Pro Max': { Экран: '6.9" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A18 Pro', Камера: '48 МП + 48 МП + 12 МП', Аккумулятор: '4685 мАч', Порт: 'USB-C 3.0', SIM: 'nano-SIM + eSIM', Защита: 'IP68', Корпус: 'Титан', ОС: 'iOS 18+' },
  'iPhone 17': { Экран: '6.1" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A19', Камера: '48 МП + 12 МП', Аккумулятор: '3600 мАч', Порт: 'USB-C', SIM: 'nano-SIM + eSIM', Защита: 'IP68', ОС: 'iOS 19+' },
  'iPhone 17 Air': { Экран: '6.6" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A19', Камера: '48 МП + 12 МП', Толщина: '5.5 мм', Вес: '145 г', Порт: 'USB-C', SIM: 'eSIM', Защита: 'IP68', ОС: 'iOS 19+' },
  'iPhone 17 Pro': { Экран: '6.3" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A19 Pro', Камера: '48 МП + 48 МП + 12 МП', Аккумулятор: '3700 мАч', Порт: 'USB-C 3.0', SIM: 'nano-SIM + eSIM', Защита: 'IP68', Корпус: 'Титан', ОС: 'iOS 19+' },
  'iPhone 17 Pro Max': { Экран: '6.9" Super Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple A19 Pro', Камера: '48 МП + 48 МП + 12 МП', Аккумулятор: '4900 мАч', Порт: 'USB-C 3.0', SIM: 'nano-SIM + eSIM', Защита: 'IP68', Корпус: 'Титан', ОС: 'iOS 19+' },
  'MacBook Air M1': { Процессор: 'Apple M1 (8 ядер)', Видеокарта: 'GPU 7 ядер', ОЗУ: '8 ГБ', Экран: '13.3" Retina IPS 2560×1600', Порты: '2× USB-C / Thunderbolt', Батарея: 'до 18 часов', ОС: 'macOS', Вес: '1.29 кг' },
  'MacBook Air M2': { Процессор: 'Apple M2 (8 ядер)', Видеокарта: 'GPU 8/10 ядер', ОЗУ: '8–24 ГБ', Экран: '13.6" Liquid Retina 2560×1664', Порты: '2× USB-C / Thunderbolt, MagSafe 3', Батарея: 'до 18 часов', ОС: 'macOS', Вес: '1.24 кг' },
  'MacBook Air M3': { Процессор: 'Apple M3 (8 ядер)', Видеокарта: 'GPU 10 ядер', ОЗУ: '8–24 ГБ', Экран: '13.6" Liquid Retina 2560×1664', Порты: '2× USB-C / Thunderbolt, MagSafe 3', Батарея: 'до 18 часов', ОС: 'macOS', Вес: '1.24 кг' },
  'MacBook Air M4': { Процессор: 'Apple M4 (10 ядер)', Видеокарта: 'GPU 10 ядер', ОЗУ: '16–32 ГБ', Экран: '13.6" Liquid Retina 2560×1664', Порты: '2× USB-C / Thunderbolt 4, MagSafe 3', Батарея: 'до 18 часов', ОС: 'macOS', Вес: '1.24 кг' },
  'MacBook Pro 14': { Процессор: 'Apple M4 Pro (14 ядер)', Видеокарта: 'GPU 20 ядер', ОЗУ: '24–48 ГБ', Экран: '14.2" Liquid Retina XDR ProMotion 120Hz', Порты: '3× Thunderbolt 4, HDMI, SD, MagSafe 3', Батарея: 'до 22 часов', ОС: 'macOS', Вес: '1.61 кг' },
  'MacBook Pro 16': { Процессор: 'Apple M4 Pro / Max (14-16 ядер)', Видеокарта: 'GPU 20-40 ядер', ОЗУ: '24–128 ГБ', Экран: '16.2" Liquid Retina XDR ProMotion 120Hz', Порты: '3× Thunderbolt 4, HDMI, SD, MagSafe 3', Батарея: 'до 24 часов', ОС: 'macOS', Вес: '2.14 кг' },
  'Mac Mini M4': { Процессор: 'Apple M4 (10 ядер)', Видеокарта: 'GPU 10 ядер', ОЗУ: '16–32 ГБ', Порты: '3× Thunderbolt 4, 2× USB-A, HDMI, Ethernet', ОС: 'macOS', Габариты: '12.7 × 12.7 × 5 см' },
  'Mac Mini M4 Pro': { Процессор: 'Apple M4 Pro (14 ядер)', Видеокарта: 'GPU 20 ядер', ОЗУ: '24–64 ГБ', Порты: '3× Thunderbolt 5, 2× USB-A, HDMI, Ethernet', ОС: 'macOS', Габариты: '12.7 × 12.7 × 5 см' },
  'Mac Studio M4 Max': { Процессор: 'Apple M4 Max (16 ядер)', Видеокарта: 'GPU 40 ядер', ОЗУ: '36–128 ГБ', Порты: '6× Thunderbolt 5, 2× USB-A, HDMI, SD', ОС: 'macOS' },
  'Mac Studio M3 Ultra': { Процессор: 'Apple M3 Ultra (32 ядра)', Видеокарта: 'GPU 80 ядер', ОЗУ: '192 ГБ', Порты: '6× Thunderbolt 4, 2× USB-A, HDMI, SD', ОС: 'macOS' },
  'iMac M4': { Процессор: 'Apple M4 (10 ядер)', Видеокарта: 'GPU 10 ядер', ОЗУ: '16–32 ГБ', Экран: '24" Retina 4.5K 4480×2520', Порты: '2× Thunderbolt 4, 2× USB-3, Ethernet', ОС: 'macOS', Вес: '4.46 кг' },
  'iPad 11': { Экран: '10.9" Liquid Retina IPS', Процессор: 'Apple A16 Bionic', Камера: '12 МП', Порт: 'USB-C', ОС: 'iPadOS', Вес: '477 г' },
  'iPad Air 11': { Экран: '11" Liquid Retina IPS', Процессор: 'Apple M3', Камера: '12 МП', Порт: 'USB-C (Thunderbolt)', ОС: 'iPadOS', Вес: '462 г' },
  'iPad Air 13': { Экран: '13" Liquid Retina IPS', Процессор: 'Apple M3', Камера: '12 МП', Порт: 'USB-C (Thunderbolt)', ОС: 'iPadOS', Вес: '617 г' },
  'iPad Pro 11 M4': { Экран: '11" Ultra Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple M4', Камера: '12 МП + 10 МП LiDAR', Толщина: '5.3 мм', Порт: 'USB-C (Thunderbolt 4)', ОС: 'iPadOS', Вес: '444 г' },
  'iPad Pro 13 M4': { Экран: '13" Ultra Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple M4', Камера: '12 МП + 10 МП LiDAR', Толщина: '5.1 мм', Порт: 'USB-C (Thunderbolt 4)', ОС: 'iPadOS', Вес: '579 г' },
  'iPad Pro 11 M5': { Экран: '11" Ultra Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple M5', Камера: '12 МП + 10 МП LiDAR', Порт: 'USB-C (Thunderbolt 5)', ОС: 'iPadOS' },
  'iPad Pro 13 M5': { Экран: '13" Ultra Retina XDR OLED ProMotion 120Hz', Процессор: 'Apple M5', Камера: '12 МП + 10 МП LiDAR', Порт: 'USB-C (Thunderbolt 5)', ОС: 'iPadOS' },
  'Apple Watch SE 2': { Экран: '40/44 мм LTPO OLED', Процессор: 'Apple S8', Защита: 'WR50', Датчики: 'ЧСС, акселерометр, гироскоп', Связь: 'GPS', ОС: 'watchOS' },
  'Apple Watch SE 3': { Экран: '40/44 мм LTPO OLED', Процессор: 'Apple S9', Защита: 'WR50', Датчики: 'ЧСС, температура, акселерометр', Связь: 'GPS', ОС: 'watchOS' },
  'Apple Watch Series 10': { Экран: '42/46 мм LTPO OLED Always-On', Процессор: 'Apple S10', Защита: 'IP6X, WR50', Датчики: 'ЧСС, ЭКГ, SpO2, температура', Связь: 'GPS + LTE', ОС: 'watchOS' },
  'Apple Watch Series 11': { Экран: '42/46 мм LTPO OLED Always-On', Процессор: 'Apple S11', Защита: 'IP6X, WR50', Датчики: 'ЧСС, ЭКГ, SpO2, температура, глюкоза', Связь: 'GPS + LTE', ОС: 'watchOS' },
  'Apple Watch Ultra 2': { Экран: '49 мм LTPO OLED Always-On', Процессор: 'Apple S9', Защита: 'IP6X, WR100, MIL-STD', Датчики: 'ЧСС, ЭКГ, SpO2, глубиномер', Корпус: 'Титан', Батарея: 'до 60 часов', ОС: 'watchOS' },
  'Apple Watch Ultra 3': { Экран: '49 мм LTPO OLED Always-On', Процессор: 'Apple S10', Защита: 'IP6X, WR100, MIL-STD', Датчики: 'ЧСС, ЭКГ, SpO2, глубиномер', Корпус: 'Титан', Батарея: 'до 72 часов', ОС: 'watchOS' },
  'AirPods Max': { Тип: 'Накладные наушники', Чип: 'Apple H1 × 2', ANC: 'Активное шумоподавление', Батарея: 'до 20 часов', Подключение: 'Bluetooth 5.0 + Lightning/USB-C', Вес: '385 г' },
  'AirPods Pro 2': { Тип: 'Вкладыши TWS', Чип: 'Apple H2', ANC: 'Активное шумоподавление', Батарея: 'до 6 ч (30 ч с кейсом)', Подключение: 'Bluetooth 5.3', Защита: 'IPX4' },
  'AirPods Pro 3': { Тип: 'Вкладыши TWS', Чип: 'Apple H3', ANC: 'Активное шумоподавление нового поколения', Батарея: 'до 7 ч (36 ч с кейсом)', Подключение: 'Bluetooth 5.4', Защита: 'IPX4' },
  'AirPods 4': { Тип: 'Вкладыши TWS', Чип: 'Apple H2', Батарея: 'до 5 ч (30 ч с кейсом)', Подключение: 'Bluetooth 5.3', Защита: 'IPX4' },
  'AirPods 4 ANC': { Тип: 'Вкладыши TWS с ANC', Чип: 'Apple H2', ANC: 'Активное шумоподавление', Батарея: 'до 5 ч (30 ч с кейсом)', Подключение: 'Bluetooth 5.3', Защита: 'IPX4' },
  'Galaxy S24': { Экран: '6.2" Dynamic AMOLED 2X 120Hz', Процессор: 'Exynos 2400 / Snapdragon 8 Gen 3', Камера: '50 МП + 12 МП + 10 МП', Аккумулятор: '4000 мАч', Защита: 'IP68', ОС: 'Android 14 / One UI 6.1' },
  'Galaxy S24+': { Экран: '6.7" Dynamic AMOLED 2X 120Hz', Процессор: 'Snapdragon 8 Gen 3', Камера: '50 МП + 12 МП + 10 МП', Аккумулятор: '4900 мАч', Защита: 'IP68', ОС: 'Android 14 / One UI 6.1' },
  'Galaxy S24 Ultra': { Экран: '6.8" Dynamic AMOLED 2X 120Hz', Процессор: 'Snapdragon 8 Gen 3', Камера: '200 МП + 12 МП + 50 МП + 10 МП', Аккумулятор: '5000 мАч', Защита: 'IP68', Стилус: 'S Pen', ОС: 'Android 14 / One UI 6.1' },
  'Galaxy S25': { Экран: '6.2" Dynamic AMOLED 2X 120Hz', Процессор: 'Snapdragon 8 Elite', Камера: '50 МП + 12 МП + 10 МП', Аккумулятор: '4000 мАч', Защита: 'IP68', ОС: 'Android 15 / One UI 7' },
  'Galaxy S25+': { Экран: '6.7" Dynamic AMOLED 2X 120Hz', Процессор: 'Snapdragon 8 Elite', Камера: '50 МП + 12 МП + 10 МП', Аккумулятор: '4900 мАч', Защита: 'IP68', ОС: 'Android 15 / One UI 7' },
  'Galaxy S25 Edge': { Экран: '6.7" Dynamic AMOLED 2X 120Hz', Процессор: 'Snapdragon 8 Elite', Камера: '200 МП + 12 МП', Толщина: '5.8 мм', Аккумулятор: '3900 мАч', Защита: 'IP68', ОС: 'Android 15 / One UI 7' },
  'Galaxy S25 Ultra': { Экран: '6.9" Dynamic AMOLED 2X 120Hz', Процессор: 'Snapdragon 8 Elite', Камера: '200 МП + 50 МП + 50 МП + 10 МП', Аккумулятор: '5000 мАч', Защита: 'IP68', Стилус: 'S Pen', ОС: 'Android 15 / One UI 7' },
  'Huawei Pura 80': { Экран: '6.7" LTPO OLED 120Hz', Процессор: 'Kirin 9020', Камера: '50 МП + 13 МП + 12 МП (Leica)', Аккумулятор: '5000 мАч', Защита: 'IP68', ОС: 'HarmonyOS 5' },
  'Huawei Pura 80 Pro': { Экран: '6.8" LTPO OLED 120Hz', Процессор: 'Kirin 9020', Камера: '50 МП + 50 МП + 12 МП (Leica Variable Aperture)', Аккумулятор: '5100 мАч', Защита: 'IP68', ОС: 'HarmonyOS 5' },
  'Honor 200': { Экран: '6.7" AMOLED 120Hz', Процессор: 'Snapdragon 7s Gen 3', Камера: '50 МП + 50 МП + 2 МП (Portrait by Harcourt)', Аккумулятор: '5200 мАч', Защита: 'IP65', ОС: 'Android / MagicOS' },
  'Honor 400': { Экран: '6.7" AMOLED 120Hz', Процессор: 'Snapdragon 7 Gen 4', Камера: '200 МП + 50 МП + 5 МП', Аккумулятор: '5300 мАч', Защита: 'IP65', ОС: 'Android / MagicOS' },
  'Honor X7d': { Экран: '6.8" IPS LCD 90Hz', Процессор: 'Snapdragon 685', Камера: '108 МП + 5 МП + 2 МП', Аккумулятор: '6000 мАч', ОС: 'Android / MagicOS' },
  'Honor X8C': { Экран: '6.8" AMOLED 90Hz', Процессор: 'Snapdragon 6s Gen 3', Камера: '108 МП + 5 МП + 2 МП', Аккумулятор: '5830 мАч', ОС: 'Android / MagicOS' },
  'Honor X9C': { Экран: '6.8" AMOLED 120Hz', Процессор: 'Snapdragon 6 Gen 1', Камера: '108 МП + 5 МП + 2 МП', Аккумулятор: '5600 мАч', Защита: 'IP65', ОС: 'Android / MagicOS' },
  'Honor X9D': { Экран: '6.8" AMOLED 120Hz', Процессор: 'Snapdragon 7s Gen 3', Камера: '200 МП + 5 МП + 2 МП', Аккумулятор: '6600 мАч', Защита: 'IP65', ОС: 'Android / MagicOS' },
  'Google Pixel 6': { Экран: '6.4" AMOLED 90Hz', Процессор: 'Google Tensor G1', Камера: '50 МП + 12 МП', Аккумулятор: '4614 мАч', Защита: 'IP68', ОС: 'Android' },
  'Google Pixel 6A': { Экран: '6.1" OLED 60Hz', Процессор: 'Google Tensor G1', Камера: '12.2 МП + 12 МП', Аккумулятор: '4306 мАч', Защита: 'IP67', ОС: 'Android' },
  'Google Pixel 7 Pro': { Экран: '6.7" LTPO OLED 120Hz', Процессор: 'Google Tensor G2', Камера: '50 МП + 48 МП + 12 МП', Аккумулятор: '5000 мАч', Защита: 'IP68', ОС: 'Android' },
  'Google Pixel 8A': { Экран: '6.1" OLED 120Hz', Процессор: 'Google Tensor G3', Камера: '64 МП + 13 МП', Аккумулятор: '4492 мАч', Защита: 'IP67', ОС: 'Android' },
  'Google Pixel 9A': { Экран: '6.3" OLED 120Hz', Процессор: 'Google Tensor G4', Камера: '48 МП + 13 МП', Аккумулятор: '5100 мАч', Защита: 'IP68', ОС: 'Android' },
  'Google Pixel 9 Pro': { Экран: '6.3" LTPO OLED 120Hz', Процессор: 'Google Tensor G4', Камера: '50 МП + 48 МП + 48 МП', Аккумулятор: '4700 мАч', Защита: 'IP68', ОС: 'Android' },
  'Google Pixel 9 Pro XL': { Экран: '6.8" LTPO OLED 120Hz', Процессор: 'Google Tensor G4', Камера: '50 МП + 48 МП + 48 МП', Аккумулятор: '5060 мАч', Защита: 'IP68', ОС: 'Android' },
  'Google Pixel 10 Pro': { Экран: '6.3" LTPO OLED 120Hz', Процессор: 'Google Tensor G5', Камера: '50 МП + 48 МП + 48 МП', Аккумулятор: '4800 мАч', Защита: 'IP68', ОС: 'Android' },
  'Google Pixel 10 Pro XL': { Экран: '6.8" LTPO OLED 120Hz', Процессор: 'Google Tensor G5', Камера: '50 МП + 48 МП + 48 МП', Аккумулятор: '5200 мАч', Защита: 'IP68', ОС: 'Android' },
}

const DESCRIPTIONS: Record<string, string> = {
  'iPhone 13': 'Классический iPhone с двойной камерой 12 МП, процессором A15 Bionic и Super Retina XDR дисплеем. Надёжный выбор с поддержкой iOS и длительной поддержкой обновлений.',
  'iPhone 14': 'iPhone 14 с улучшенной камерой, режимом экшн-кадра и функцией аварийного SOS через спутник. Процессор A15 Bionic обеспечивает высокую производительность.',
  'iPhone 14 Pro Max': 'Топовый iPhone с Dynamic Island, камерой 48 МП и дисплеем ProMotion 120Hz. Процессор A16 Bionic — мощь в каждом пикселе.',
  'iPhone 15': 'Первый iPhone с портом USB-C, камерой 48 МП и процессором A16 Bionic. Dynamic Island и улучшенный дисплей Super Retina XDR.',
  'iPhone 15 Pro Max': 'Профессиональный смартфон с титановым корпусом, системой камер 48+12+12 МП и кнопкой Action Button. USB-C 3.0 для быстрой передачи данных.',
  'iPhone 16': 'iPhone 16 с процессором A18, камерой с поддержкой Apple Intelligence и кнопкой управления камерой. ProMotion 120Hz в стандартной модели.',
  'iPhone 16 Plus': 'Большой iPhone 16 Plus с экраном 6.7" и аккумулятором на 4674 мАч — лучшая автономность в линейке. Процессор A18 и полный набор Apple Intelligence.',
  'iPhone 16 Pro': 'iPhone 16 Pro с камерой 48+48+12 МП, 4K 120fps видео и процессором A18 Pro. Титановый корпус и экран 6.3" с ProMotion 120Hz.',
  'iPhone 16 Pro Max': 'Флагман с экраном 6.9" ProMotion, тройной камерой 48 МП, A18 Pro и максимальной автономностью до 33 часов видео.',
  'iPhone 17': 'iPhone 17 на процессоре A19 — первый iPhone с ProMotion 120Hz в базовой модели. Улучшенные камеры и поддержка Apple Intelligence нового поколения.',
  'iPhone 17 Air': 'Самый тонкий iPhone в истории — 5.5 мм. Лёгкий (145 г), с экраном 6.6" ProMotion и процессором A19. Инженерный шедевр для тех, кто ценит элегантность.',
  'iPhone 17 Pro': 'iPhone 17 Pro с процессором A19 Pro, тройной камерой нового поколения и титановым корпусом. Максимальная производительность для профессионалов.',
  'iPhone 17 Pro Max': 'Лучший iPhone. Экран 6.9" ProMotion, A19 Pro, тройная камера 48 МП, аккумулятор 4900 мАч и опция 2 ТБ памяти для самых требовательных.',
  'MacBook Air M1': 'Революционный MacBook Air на чипе M1 — тихий, лёгкий, невероятно быстрый. Без вентилятора, до 18 часов автономной работы.',
  'MacBook Air M2': 'MacBook Air M2 с новым дизайном без клина, экраном Liquid Retina 13.6" и MagSafe. Быстрее, ярче, тоньше.',
  'MacBook Air M3': 'MacBook Air M3 поддерживает два внешних монитора одновременно. Процессор M3 на 35% быстрее M1. Идеальный ноутбук для работы и творчества.',
  'MacBook Air M4': 'MacBook Air M4 с 16 ГБ ОЗУ в базовой конфигурации, процессором M4 и поддержкой Apple Intelligence. Самый популярный ноутбук в мире стал ещё лучше.',
  'MacBook Pro 14': 'MacBook Pro 14 на M4 Pro — профессиональный ноутбук с дисплеем Liquid Retina XDR ProMotion, до 22 часов автономности и тремя портами Thunderbolt 4.',
  'MacBook Pro 16': 'Самый мощный MacBook Pro с экраном 16.2" Liquid Retina XDR, M4 Pro/Max и до 128 ГБ ОЗУ. Для студий, разработчиков и профессионалов.',
  'Mac Mini M4': 'Компактный настольный компьютер с Apple M4. Три порта Thunderbolt 4 и поддержка до трёх мониторов. Мощность без лишнего пространства.',
  'Mac Mini M4 Pro': 'Mac Mini на M4 Pro с портами Thunderbolt 5 — впервые в Mac Mini. Для профессиональных задач: видеомонтаж, 3D, разработка.',
  'Mac Studio M4 Max': 'Mac Studio на M4 Max — рабочая станция для студий. До 128 ГБ ОЗУ, шесть портов Thunderbolt 5 и GPU 40 ядер.',
  'Mac Studio M3 Ultra': 'Mac Studio на M3 Ultra с 192 ГБ унифицированной памяти и GPU 80 ядер. Для самых требовательных творческих задач.',
  'iMac M4': 'Тонкий всё-в-одном iMac на M4 с дисплеем 4.5K Retina. Семь ярких цветов, веб-камера 12 МП Center Stage и потрясающие динамики.',
  'iPad 11': 'Доступный iPad с процессором A16, экраном Liquid Retina 10.9" и поддержкой Apple Pencil. Отличный выбор для учёбы и повседневных задач.',
  'iPad Air 11': 'iPad Air 11 на чипе M3 — лёгкий (462 г) планшет с дисплеем Liquid Retina и поддержкой Apple Pencil Pro. Для работы и творчества.',
  'iPad Air 13': 'iPad Air 13 — большой планшет на M3 для тех, кому нужно больше пространства. 13" Liquid Retina и вся мощь Apple M3.',
  'iPad Pro 11 M4': 'iPad Pro 11 на M4 с революционным OLED дисплеем Ultra Retina XDR. Толщина 5.3 мм — тоньше любого iPhone. Thunderbolt 4.',
  'iPad Pro 13 M4': 'Самый тонкий Apple продукт — 5.1 мм. iPad Pro 13 на M4 с OLED дисплеем Ultra Retina XDR и Thunderbolt 4.',
  'iPad Pro 11 M5': 'iPad Pro 11 на M5 — новейшее поколение с процессором M5 и Thunderbolt 5. Профессиональные возможности в компактном корпусе.',
  'iPad Pro 13 M5': 'iPad Pro 13 на M5 — флагманский планшет Apple нового поколения. Thunderbolt 5 и возможности M5 для самых сложных задач.',
  'Apple Watch SE 2': 'Доступные умные часы Apple Watch SE 2 с процессором S8, датчиком ЧСС и GPS. Crashdetection и экстренный вызов SOS.',
  'Apple Watch SE 3': 'Apple Watch SE 3 — обновлённая бюджетная модель с процессором S9 и датчиком температуры. Лучший способ войти в экосистему Apple Watch.',
  'Apple Watch Series 10': 'Apple Watch Series 10 с самым большим и тонким дисплеем. ЭКГ, SpO2, датчик температуры и быстрая зарядка.',
  'Apple Watch Series 11': 'Apple Watch Series 11 — новейшие умные часы с датчиком уровня глюкозы без прокола. Революция в персональном здоровье.',
  'Apple Watch Ultra 2': 'Apple Watch Ultra 2 для экстремального спорта: титановый корпус, 49 мм дисплей, до 60 часов GPS и глубиномер до 100 м.',
  'Apple Watch Ultra 3': 'Apple Watch Ultra 3 — новое поколение спортивных часов Apple с процессором S10 и автономностью до 72 часов.',
  'AirPods Max': 'Накладные наушники AirPods Max с активным шумоподавлением, пространственным звуком и до 20 часов автономности. Алюминиевые амбушюры и стальной оголовник.',
  'AirPods Pro 2': 'AirPods Pro 2 с чипом H2, адаптивным шумоподавлением и поддержкой Lossless Audio через USB-C. Отличный звук в компактном корпусе.',
  'AirPods Pro 3': 'AirPods Pro 3 нового поколения с чипом H3 и улучшенным ANC. Расширенное время работы и более точное отслеживание здоровья.',
  'AirPods 4': 'AirPods 4 с открытым дизайном — без силиконовых насадок. Новый чип H2, пространственный звук и до 30 часов с кейсом.',
  'AirPods 4 ANC': 'AirPods 4 с активным шумоподавлением — впервые в открытой модели. Чип H2 и пространственный звук.',
  'Galaxy S24': 'Samsung Galaxy S24 с процессором Snapdragon 8 Gen 3, 7 лет обновлений Android и Galaxy AI. Яркий дисплей AMOLED и тройная камера.',
  'Galaxy S24+': 'Galaxy S24+ с большим дисплеем 6.7" и аккумулятором 4900 мАч. Snapdragon 8 Gen 3 и полный набор Galaxy AI.',
  'Galaxy S24 Ultra': 'Флагман Samsung с камерой 200 МП, встроенным S Pen и Snapdragon 8 Gen 3. Титановый корпус и 7 лет гарантии обновлений.',
  'Galaxy S25': 'Galaxy S25 на Snapdragon 8 Elite с Galaxy AI нового поколения. Улучшенные камеры и 7-летняя поддержка.',
  'Galaxy S25+': 'Galaxy S25+ с большим дисплеем и Snapdragon 8 Elite. Расширенные возможности Galaxy AI для продуктивности.',
  'Galaxy S25 Edge': 'Самый тонкий Samsung Galaxy — 5.8 мм. S25 Edge с камерой 200 МП и мощным Snapdragon 8 Elite.',
  'Galaxy S25 Ultra': 'Galaxy S25 Ultra — абсолютный флагман Samsung с камерой 200 МП, S Pen и Snapdragon 8 Elite. До 1 ТБ памяти.',
  'Huawei Pura 80': 'Huawei Pura 80 с камерой Leica и процессором Kirin. Элегантный дизайн и передовые технологии фотографии.',
  'Huawei Pura 80 Pro': 'Huawei Pura 80 Pro с переменной апертурой камеры Leica и LTPO дисплеем 120Hz. Профессиональная фотография в кармане.',
  'Honor 200': 'Honor 200 с портретными камерами по технологии Harcourt — лучшая портретная съёмка в своём сегменте. Snapdragon 7s Gen 3.',
  'Honor 400': 'Honor 400 с камерой 200 МП и Snapdragon 7 Gen 4. Флагманские камеры по доступной цене.',
  'Honor X7d': 'Honor X7d с аккумулятором 6000 мАч — рекордная автономность. Камера 108 МП и большой экран 6.8".',
  'Honor X8C': 'Honor X8C с AMOLED дисплеем и процессором Snapdragon 6s Gen 3. Хороший баланс цены и возможностей.',
  'Honor X9C': 'Honor X9C с защитой IP65 и Snapdragon 6 Gen 1. Надёжный смартфон с камерой 108 МП.',
  'Honor X9D': 'Honor X9D с камерой 200 МП и аккумулятором 6600 мАч. Лучший Honor X для тех, кто хочет максимум.',
  'Google Pixel 6': 'Google Pixel 6 — первый смартфон на чипе Google Tensor с продвинутой камерой и 5 лет обновлений Android.',
  'Google Pixel 6A': 'Доступный Google Pixel с чипом Tensor, камерой 12 МП и чистым Android. Лучший смартфон в своей ценовой категории.',
  'Google Pixel 7 Pro': 'Google Pixel 7 Pro с тройной камерой, телескопом 5× и чипом Tensor G2. Лучшая камера среди Android-смартфонов.',
  'Google Pixel 8A': 'Google Pixel 8A на Tensor G3 — доступный смартфон с возможностями Pixel 8. Продвинутый ИИ и 7 лет обновлений.',
  'Google Pixel 9A': 'Google Pixel 9A на Tensor G4 — новейший доступный Pixel с улучшенной камерой и Google AI.',
  'Google Pixel 9 Pro': 'Google Pixel 9 Pro с тройной камерой и Tensor G4. Передовые возможности Google AI прямо в телефоне.',
  'Google Pixel 9 Pro XL': 'Google Pixel 9 Pro XL — большой флагман с дисплеем 6.8" и аккумулятором 5060 мАч. Вся мощь Pixel в максимальном размере.',
  'Google Pixel 10 Pro': 'Google Pixel 10 Pro на Tensor G5 — следующее поколение Google AI. Лучшие камеры и самый умный Android.',
  'Google Pixel 10 Pro XL': 'Google Pixel 10 Pro XL — флагман Google с экраном 6.8" и Tensor G5. Максимальные возможности для фото и ИИ.',
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🗑️  Очищаем старые данные...')
  await prisma.stockMovement.deleteMany()
  await prisma.promotionPrice.deleteMany()
  await prisma.promotion.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.order.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  console.log('✅ Данные очищены\n')

  // ─── CATEGORIES ───────────────────────────────────────────────────────────
  console.log('📁 Создаём категории...')

  const cats = await Promise.all([
    prisma.category.create({ data: { name: 'Телефоны', textSide: 'left' } }),
    prisma.category.create({ data: { name: 'Ноутбуки и компьютеры', textSide: 'right' } }),
    prisma.category.create({ data: { name: 'Планшеты', textSide: 'left' } }),
    prisma.category.create({ data: { name: 'Часы', textSide: 'right' } }),
    prisma.category.create({ data: { name: 'Аудио', textSide: 'left' } }),
    prisma.category.create({ data: { name: 'Игровые консоли', textSide: 'right' } }),
    prisma.category.create({ data: { name: 'Бытовая техника', textSide: 'left' } }),
    prisma.category.create({ data: { name: 'Уход за волосами', textSide: 'right' } }),
    prisma.category.create({ data: { name: 'Фото и видео', textSide: 'left' } }),
    prisma.category.create({ data: { name: 'Аксессуары', textSide: 'right' } }),
    prisma.category.create({ data: { name: 'Услуги', textSide: 'left' } }),
  ])

  const [PHONES, LAPTOPS, TABLETS, WATCHES, AUDIO, CONSOLES, VACUUM, HAIR, PHOTO, ACCESSORIES, SERVICES] = cats
  console.log(`✅ Создано ${cats.length} категорий\n`)

    let productCount = 0
  let variantCount = 0
  let skuCounter = 0

  async function createProduct(data: {
    name: string
    description: string
    brand: string
    categoryId: number
    badge?: string
    specs?: Record<string, string>
    variants: Array<{
      skuParts: string[]
      price: number
      attributes: Record<string, string>
      quantity?: number
    }>
  }) {
    // SKU продукта = первый вариант, цена = минимальная среди вариантов
    const firstVariantSku = sku([data.name.replace(/\s+/g, '-'), 'BASE'])
    const basePrice = Math.min(...data.variants.map(v => v.price))

    const product = await prisma.product.create({
      data: {
        sku: firstVariantSku + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        name: data.name,
        description: data.description,
        brand: data.brand,
        categoryId: data.categoryId,
        badge: data.badge ?? null,
        specs: data.specs ?? {},
        attributes: {},
        photos: [],
        price: new Prisma.Decimal(basePrice),
        stock: 0,
        quantity: 0,
      }
    })

    for (const v of data.variants) {
      skuCounter++
      const variantSku = sku(v.skuParts).slice(0, 44) + '-' + String(skuCounter).padStart(4, '0')
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: variantSku,
          price: new Prisma.Decimal(v.price),
          quantity: v.quantity ?? 0,
          inStock: true,
          attributes: v.attributes,
          photos: [],
        }
      })
      variantCount++
    }
    productCount++
    return product
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ТЕЛЕФОНЫ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📱 iPhone...')

  // iPhone 13
  await createProduct({
    name: 'iPhone 13', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 13'], specs: SPECS['iPhone 13'],
    variants: [
      { skuParts: ['IP13', '128', 'MIDNIGHT'], price: price('iphone-13-128'), attributes: { Память: '128 ГБ', Цвет: 'Midnight' } },
      { skuParts: ['IP13', '128', 'BLUE'], price: price('iphone-13-128'), attributes: { Память: '128 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP13', '128', 'STARLIGHT'], price: price('iphone-13-128'), attributes: { Память: '128 ГБ', Цвет: 'Starlight' } },
      { skuParts: ['IP13', '128', 'PINK'], price: price('iphone-13-128'), attributes: { Память: '128 ГБ', Цвет: 'Pink' } },
      { skuParts: ['IP13', '128', 'GREEN'], price: price('iphone-13-128'), attributes: { Память: '128 ГБ', Цвет: 'Green' } },
      { skuParts: ['IP13', '512', 'MIDNIGHT'], price: price('iphone-13-512'), attributes: { Память: '512 ГБ', Цвет: 'Midnight' } },
      { skuParts: ['IP13', '512', 'BLUE'], price: price('iphone-13-512'), attributes: { Память: '512 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP13', '512', 'STARLIGHT'], price: price('iphone-13-512'), attributes: { Память: '512 ГБ', Цвет: 'Starlight' } },
      { skuParts: ['IP13', '512', 'PINK'], price: price('iphone-13-512'), attributes: { Память: '512 ГБ', Цвет: 'Pink' } },
      { skuParts: ['IP13', '512', 'GREEN'], price: price('iphone-13-512'), attributes: { Память: '512 ГБ', Цвет: 'Green' } },
    ]
  })

  // iPhone 14
  await createProduct({
    name: 'iPhone 14', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 14'], specs: SPECS['iPhone 14'],
    variants: [
      { skuParts: ['IP14', '128', 'MIDNIGHT'], price: price('iphone-14-128'), attributes: { Память: '128 ГБ', Цвет: 'Midnight' } },
      { skuParts: ['IP14', '128', 'BLUE'], price: price('iphone-14-128'), attributes: { Память: '128 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP14', '128', 'STARLIGHT'], price: price('iphone-14-128'), attributes: { Память: '128 ГБ', Цвет: 'Starlight' } },
      { skuParts: ['IP14', '128', 'RED'], price: price('iphone-14-128'), attributes: { Память: '128 ГБ', Цвет: 'Red' } },
      { skuParts: ['IP14', '128', 'PURPLE'], price: price('iphone-14-128'), attributes: { Память: '128 ГБ', Цвет: 'Purple' } },
      { skuParts: ['IP14', '512', 'MIDNIGHT'], price: price('iphone-14-512'), attributes: { Память: '512 ГБ', Цвет: 'Midnight' } },
      { skuParts: ['IP14', '512', 'BLUE'], price: price('iphone-14-512'), attributes: { Память: '512 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP14', '512', 'STARLIGHT'], price: price('iphone-14-512'), attributes: { Память: '512 ГБ', Цвет: 'Starlight' } },
      { skuParts: ['IP14', '512', 'RED'], price: price('iphone-14-512'), attributes: { Память: '512 ГБ', Цвет: 'Red' } },
      { skuParts: ['IP14', '512', 'PURPLE'], price: price('iphone-14-512'), attributes: { Память: '512 ГБ', Цвет: 'Purple' } },
    ]
  })

  // iPhone 14 Pro Max
  await createProduct({
    name: 'iPhone 14 Pro Max', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 14 Pro Max'], specs: SPECS['iPhone 14 Pro Max'],
    variants: [
      { skuParts: ['IP14PM', '512'], price: price('iphone-14-pro-max-512'), attributes: { Память: '512 ГБ' } },
      { skuParts: ['IP14PM', '1TB'], price: price('iphone-14-pro-max-1tb'), attributes: { Память: '1 ТБ' } },
    ]
  })

  // iPhone 15
  await createProduct({
    name: 'iPhone 15', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 15'], specs: SPECS['iPhone 15'],
    variants: [
      { skuParts: ['IP15', '128', 'BLACK'], price: price('iphone-15-128'), attributes: { Память: '128 ГБ', Цвет: 'Black' } },
      { skuParts: ['IP15', '128', 'BLUE'], price: price('iphone-15-128'), attributes: { Память: '128 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP15', '128', 'YELLOW'], price: price('iphone-15-128'), attributes: { Память: '128 ГБ', Цвет: 'Yellow' } },
      { skuParts: ['IP15', '128', 'GREEN'], price: price('iphone-15-128'), attributes: { Память: '128 ГБ', Цвет: 'Green' } },
      { skuParts: ['IP15', '128', 'PINK'], price: price('iphone-15-128'), attributes: { Память: '128 ГБ', Цвет: 'Pink' } },
      { skuParts: ['IP15', '256', 'BLACK'], price: price('iphone-15-256'), attributes: { Память: '256 ГБ', Цвет: 'Black' } },
      { skuParts: ['IP15', '256', 'BLUE'], price: price('iphone-15-256'), attributes: { Память: '256 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP15', '256', 'YELLOW'], price: price('iphone-15-256'), attributes: { Память: '256 ГБ', Цвет: 'Yellow' } },
      { skuParts: ['IP15', '256', 'GREEN'], price: price('iphone-15-256'), attributes: { Память: '256 ГБ', Цвет: 'Green' } },
      { skuParts: ['IP15', '256', 'PINK'], price: price('iphone-15-256'), attributes: { Память: '256 ГБ', Цвет: 'Pink' } },
      { skuParts: ['IP15', '512', 'BLACK'], price: price('iphone-15-512'), attributes: { Память: '512 ГБ', Цвет: 'Black' } },
      { skuParts: ['IP15', '512', 'BLUE'], price: price('iphone-15-512'), attributes: { Память: '512 ГБ', Цвет: 'Blue' } },
      { skuParts: ['IP15', '512', 'YELLOW'], price: price('iphone-15-512'), attributes: { Память: '512 ГБ', Цвет: 'Yellow' } },
      { skuParts: ['IP15', '512', 'GREEN'], price: price('iphone-15-512'), attributes: { Память: '512 ГБ', Цвет: 'Green' } },
      { skuParts: ['IP15', '512', 'PINK'], price: price('iphone-15-512'), attributes: { Память: '512 ГБ', Цвет: 'Pink' } },
    ]
  })

  // iPhone 15 Pro Max
  await createProduct({
    name: 'iPhone 15 Pro Max', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 15 Pro Max'], specs: SPECS['iPhone 15 Pro Max'],
    variants: [
      { skuParts: ['IP15PM', '512'], price: price('iphone-15-pro-max-512'), attributes: { Память: '512 ГБ' } },
      { skuParts: ['IP15PM', '1TB'], price: price('iphone-15-pro-max-1tb'), attributes: { Память: '1 ТБ' } },
    ]
  })

  // iPhone 16
  await createProduct({
    name: 'iPhone 16', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 16'], specs: SPECS['iPhone 16'],
    variants: [
      ...['Black','Teal','White','Ultramarine','Pink'].flatMap(c => [
        { skuParts: ['IP16', '128', c.toUpperCase()], price: price('iphone-16-128'), attributes: { Память: '128 ГБ', Цвет: c } },
        { skuParts: ['IP16', '256', c.toUpperCase()], price: price('iphone-16-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IP16', '512', c.toUpperCase()], price: price('iphone-16-512'), attributes: { Память: '512 ГБ', Цвет: c } },
      ])
    ]
  })

  // iPhone 16 Plus
  await createProduct({
    name: 'iPhone 16 Plus', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 16 Plus'], specs: SPECS['iPhone 16 Plus'],
    variants: [
      ...['Black','Teal','White','Ultramarine','Pink'].flatMap(c => [
        { skuParts: ['IP16P', '128', c.toUpperCase()], price: price('iphone-16-plus-128'), attributes: { Память: '128 ГБ', Цвет: c } },
        { skuParts: ['IP16P', '256', c.toUpperCase()], price: price('iphone-16-plus-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IP16P', '512', c.toUpperCase()], price: price('iphone-16-plus-512'), attributes: { Память: '512 ГБ', Цвет: c } },
      ])
    ]
  })

  // iPhone 16 Pro
  await createProduct({
    name: 'iPhone 16 Pro', brand: 'Apple', categoryId: PHONES.id,
    description: DESCRIPTIONS['iPhone 16 Pro'], specs: SPECS['iPhone 16 Pro'],
    variants: [
      ...['Desert','Natural','Black','White'].flatMap(c => [
        { skuParts: ['IP16PRO', '128', c.toUpperCase()], price: price('iphone-16-pro-128'), attributes: { Память: '128 ГБ', Цвет: c } },
        { skuParts: ['IP16PRO', '256', c.toUpperCase()], price: price('iphone-16-pro-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IP16PRO', '512', c.toUpperCase()], price: price('iphone-16-pro-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IP16PRO', '1TB', c.toUpperCase()], price: price('iphone-16-pro-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPhone 16 Pro Max
  await createProduct({
    name: 'iPhone 16 Pro Max', brand: 'Apple', categoryId: PHONES.id, badge: 'ХИТ',
    description: DESCRIPTIONS['iPhone 16 Pro Max'], specs: SPECS['iPhone 16 Pro Max'],
    variants: [
      ...['Desert','Natural','Black','White'].flatMap(c => [
        { skuParts: ['IP16PM', '256', c.toUpperCase()], price: price('iphone-16-pro-max-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IP16PM', '512', c.toUpperCase()], price: price('iphone-16-pro-max-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IP16PM', '1TB', c.toUpperCase()], price: price('iphone-16-pro-max-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPhone 17
  await createProduct({
    name: 'iPhone 17', brand: 'Apple', categoryId: PHONES.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['iPhone 17'], specs: SPECS['iPhone 17'],
    variants: [
      ...['Black','White','Mist Blue','Sage','Lavender'].flatMap(c => [
        { skuParts: ['IP17', '256', c.replace(' ','-').toUpperCase()], price: price('iphone-17-256'), attributes: { Память: '256 ГБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17', '256', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-256'), attributes: { Память: '256 ГБ', Цвет: c, SIM: 'eSim' } },
        { skuParts: ['IP17', '512', c.replace(' ','-').toUpperCase()], price: price('iphone-17-512'), attributes: { Память: '512 ГБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17', '512', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-512'), attributes: { Память: '512 ГБ', Цвет: c, SIM: 'eSim' } },
      ])
    ]
  })

  // iPhone 17 Air
  await createProduct({
    name: 'iPhone 17 Air', brand: 'Apple', categoryId: PHONES.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['iPhone 17 Air'], specs: SPECS['iPhone 17 Air'],
    variants: [
      ...['Space Black','Cloud White','Light Gold','Sky Blue'].flatMap(c => [
        { skuParts: ['IP17AIR', '256', c.replace(' ','-').toUpperCase()], price: price('iphone-17-air-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IP17AIR', '512', c.replace(' ','-').toUpperCase()], price: price('iphone-17-air-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IP17AIR', '1TB', c.replace(' ','-').toUpperCase()], price: price('iphone-17-air-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPhone 17 Pro
  await createProduct({
    name: 'iPhone 17 Pro', brand: 'Apple', categoryId: PHONES.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['iPhone 17 Pro'], specs: SPECS['iPhone 17 Pro'],
    variants: [
      ...['Silver','Cosmic Orange','Deep Blue'].flatMap(c => [
        { skuParts: ['IP17PRO', '256', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-256'), attributes: { Память: '256 ГБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PRO', '256', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-256'), attributes: { Память: '256 ГБ', Цвет: c, SIM: 'eSim' } },
        { skuParts: ['IP17PRO', '512', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-512'), attributes: { Память: '512 ГБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PRO', '512', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-512'), attributes: { Память: '512 ГБ', Цвет: c, SIM: 'eSim' } },
        { skuParts: ['IP17PRO', '1TB', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-1tb'), attributes: { Память: '1 ТБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PRO', '1TB', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-1tb'), attributes: { Память: '1 ТБ', Цвет: c, SIM: 'eSim' } },
      ])
    ]
  })

  // iPhone 17 Pro Max
  await createProduct({
    name: 'iPhone 17 Pro Max', brand: 'Apple', categoryId: PHONES.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['iPhone 17 Pro Max'], specs: SPECS['iPhone 17 Pro Max'],
    variants: [
      ...['Silver','Cosmic Orange','Deep Blue'].flatMap(c => [
        { skuParts: ['IP17PM', '256', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-256'), attributes: { Память: '256 ГБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PM', '256', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-256'), attributes: { Память: '256 ГБ', Цвет: c, SIM: 'eSim' } },
        { skuParts: ['IP17PM', '512', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-512'), attributes: { Память: '512 ГБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PM', '512', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-512'), attributes: { Память: '512 ГБ', Цвет: c, SIM: 'eSim' } },
        { skuParts: ['IP17PM', '1TB', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-1tb'), attributes: { Память: '1 ТБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PM', '1TB', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-1tb'), attributes: { Память: '1 ТБ', Цвет: c, SIM: 'eSim' } },
        { skuParts: ['IP17PM', '2TB', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-2tb'), attributes: { Память: '2 ТБ', Цвет: c, SIM: '1 Sim+eSim' } },
        { skuParts: ['IP17PM', '2TB', 'ESIM', c.replace(' ','-').toUpperCase()], price: price('iphone-17-pro-max-2tb'), attributes: { Память: '2 ТБ', Цвет: c, SIM: 'eSim' } },
      ])
    ]
  })

  // Samsung Galaxy S24
  for (const [model, priceKey, colors, mems] of [
    ['Galaxy S24', 'galaxy-s24', ['Black','Grey','Violet','Yellow'], ['128','256','512']],
    ['Galaxy S24+', 'galaxy-s24-plus', ['Onyx Black','Marble Gray','Cobalt Violet','Amber Yellow','Jade Green','Sapphire Blue'], ['256','512']],
    ['Galaxy S24 Ultra', 'galaxy-s24-ultra', ['Titanium Black','Titanium Gray','Titanium Violet','Titanium Yellow'], ['256','512','1TB']],
  ] as any[]) {
    const memPrices: Record<string, number> = {}
    for (const m of mems) {
      const k = `${priceKey}-${m.toLowerCase().replace(' ','')}`
      memPrices[m] = price(k)
    }
    await createProduct({
      name: model, brand: 'Samsung', categoryId: PHONES.id,
      description: DESCRIPTIONS[model] ?? '', specs: SPECS[model] ?? {},
      variants: colors.flatMap((c: string) => mems.map((m: string) => ({
        skuParts: [model.replace(/\s+/g,'-').replace(/[^A-Za-z0-9\-]/g,''), m, c.replace(/\s+/g,'-').toUpperCase()],
        price: memPrices[m],
        attributes: { Память: m === '1TB' ? '1 ТБ' : `${m} ГБ`, Цвет: c }
      })))
    })
  }

  // Samsung Galaxy S25
  for (const [model, priceKey, colors, mems] of [
    ['Galaxy S25', 'galaxy-s25', ['Icy Blue','Mint','Navy','Silver Shadow','Blue Black','Pink Gold'], ['128','256','512']],
    ['Galaxy S25+', 'galaxy-s25-plus', ['Icy Blue','Mint','Navy','Silver Shadow'], ['256','512']],
    ['Galaxy S25 Edge', 'galaxy-s25-edge', ['Jet Black','Silver','Ice Blue'], ['256','512']],
    ['Galaxy S25 Ultra', 'galaxy-s25-ultra', ['Black','Grey','Silver Blue','White Silver'], ['256','512','1TB']],
  ] as any[]) {
    const memPrices: Record<string, number> = {}
    for (const m of mems) {
      const k = `${priceKey}-${m.toLowerCase().replace(' ','')}`
      memPrices[m] = price(k)
    }
    await createProduct({
      name: model, brand: 'Samsung', categoryId: PHONES.id, badge: 'НОВИНКА',
      description: DESCRIPTIONS[model] ?? '', specs: SPECS[model] ?? {},
      variants: colors.flatMap((c: string) => mems.map((m: string) => ({
        skuParts: [model.replace(/\s+/g,'-').replace(/[^A-Za-z0-9\-]/g,''), m, c.replace(/\s+/g,'-').toUpperCase()],
        price: memPrices[m],
        attributes: { Память: m === '1TB' ? '1 ТБ' : `${m} ГБ`, Цвет: c }
      })))
    })
  }

  // Huawei (без вариантов)
  await createProduct({
    name: 'Huawei Pura 80', brand: 'Huawei', categoryId: PHONES.id,
    description: DESCRIPTIONS['Huawei Pura 80'], specs: SPECS['Huawei Pura 80'],
    variants: [{ skuParts: ['HUAWEI-PURA80'], price: price('huawei-pura-80'), attributes: {} }]
  })
  await createProduct({
    name: 'Huawei Pura 80 Pro', brand: 'Huawei', categoryId: PHONES.id,
    description: DESCRIPTIONS['Huawei Pura 80 Pro'], specs: SPECS['Huawei Pura 80 Pro'],
    variants: [{ skuParts: ['HUAWEI-PURA80PRO'], price: price('huawei-pura-80-pro'), attributes: {} }]
  })

  // Honor
  await createProduct({
    name: 'Honor 200', brand: 'Honor', categoryId: PHONES.id,
    description: DESCRIPTIONS['Honor 200'], specs: SPECS['Honor 200'],
    variants: [
      { skuParts: ['HONOR200', '8-256'], price: price('honor-200-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ' } },
      { skuParts: ['HONOR200', '12-512'], price: price('honor-200-12-512'), attributes: { ОЗУ: '12 ГБ', Память: '512 ГБ' } },
    ]
  })
  await createProduct({
    name: 'Honor 400', brand: 'Honor', categoryId: PHONES.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['Honor 400'], specs: SPECS['Honor 400'],
    variants: [
      { skuParts: ['HONOR400', '8-256'], price: price('honor-400-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ' } },
      { skuParts: ['HONOR400', '12-256'], price: price('honor-400-12-256'), attributes: { ОЗУ: '12 ГБ', Память: '256 ГБ' } },
      { skuParts: ['HONOR400', '12-512'], price: price('honor-400-12-512'), attributes: { ОЗУ: '12 ГБ', Память: '512 ГБ' } },
    ]
  })
  for (const [model, priceKey] of [['Honor X7d','honor-x7d'],['Honor X8C','honor-x8c'],['Honor X9C','honor-x9c'],['Honor X9D','honor-x9d']]) {
    await createProduct({
      name: model, brand: 'Honor', categoryId: PHONES.id,
      description: DESCRIPTIONS[`Honor ${model.split(' ')[1]}`] ?? '', specs: SPECS[`Honor ${model.split(' ')[1]}`] ?? {},
      variants: [{ skuParts: [model.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  // Google Pixel
  const pixelModels = [
    ['Google Pixel 6', 'pixel-6', 'Google Pixel 6'],
    ['Google Pixel 6A', 'pixel-6a', 'Google Pixel 6A'],
    ['Google Pixel 7 Pro', 'pixel-7-pro', 'Google Pixel 7 Pro'],
    ['Google Pixel 8A', 'pixel-8a', 'Google Pixel 8A'],
    ['Google Pixel 9A', 'pixel-9a', 'Google Pixel 9A'],
    ['Google Pixel 9 Pro', 'pixel-9-pro', 'Google Pixel 9 Pro'],
    ['Google Pixel 9 Pro XL', 'pixel-9-pro-xl', 'Google Pixel 9 Pro XL'],
    ['Google Pixel 10 Pro', 'pixel-10-pro', 'Google Pixel 10 Pro'],
    ['Google Pixel 10 Pro XL', 'pixel-10-pro-xl', 'Google Pixel 10 Pro XL'],
  ]
  for (const [name, priceKey, descKey] of pixelModels) {
    const isNew = name.includes('10') || name.includes('9A')
    await createProduct({
      name, brand: 'Google', categoryId: PHONES.id, badge: isNew ? 'НОВИНКА' : undefined,
      description: DESCRIPTIONS[descKey] ?? '', specs: SPECS[descKey] ?? {},
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  console.log('✅ Телефоны готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // НОУТБУКИ И КОМПЬЮТЕРЫ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('💻 MacBook...')

  // MacBook Air M1
  await createProduct({
    name: 'MacBook Air (M1)', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['MacBook Air M1'], specs: SPECS['MacBook Air M1'],
    variants: [
      { skuParts: ['MBA-M1', '8-256', 'SILVER'], price: price('macbook-air-m1-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ', Цвет: 'Silver' } },
      { skuParts: ['MBA-M1', '8-256', 'GOLD'], price: price('macbook-air-m1-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ', Цвет: 'Gold' } },
      { skuParts: ['MBA-M1', '8-256', 'SPACE-GRAY'], price: price('macbook-air-m1-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ', Цвет: 'Space Gray' } },
    ]
  })

  // MacBook Air M2
  await createProduct({
    name: 'MacBook Air (M2)', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['MacBook Air M2'], specs: SPECS['MacBook Air M2'],
    variants: [
      ...['Silver','Midnight','Starlight','Space Gray'].flatMap(c => [
        { skuParts: ['MBA-M2', '8-256', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m2-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ', Цвет: c } },
        { skuParts: ['MBA-M2', '8-512', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m2-8-512'), attributes: { ОЗУ: '8 ГБ', Память: '512 ГБ', Цвет: c } },
      ])
    ]
  })

  // MacBook Air M3
  await createProduct({
    name: 'MacBook Air (M3)', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['MacBook Air M3'], specs: SPECS['MacBook Air M3'],
    variants: [
      ...['Silver','Midnight','Starlight','Space Gray'].flatMap(c => [
        { skuParts: ['MBA-M3', '8-256', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m3-8-256'), attributes: { ОЗУ: '8 ГБ', Память: '256 ГБ', Цвет: c } },
        { skuParts: ['MBA-M3', '8-512', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m3-8-512'), attributes: { ОЗУ: '8 ГБ', Память: '512 ГБ', Цвет: c } },
      ])
    ]
  })

  // MacBook Air M4
  await createProduct({
    name: 'MacBook Air (M4)', brand: 'Apple', categoryId: LAPTOPS.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['MacBook Air M4'], specs: SPECS['MacBook Air M4'],
    variants: [
      ...['Silver','Midnight','Starlight','Sky Blue'].flatMap(c => [
        { skuParts: ['MBA-M4', '16-256', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m4-16-256'), attributes: { ОЗУ: '16 ГБ', Память: '256 ГБ', Цвет: c } },
        { skuParts: ['MBA-M4', '16-512', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m4-16-512'), attributes: { ОЗУ: '16 ГБ', Память: '512 ГБ', Цвет: c } },
        { skuParts: ['MBA-M4', '32-1TB', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m4-32-1tb'), attributes: { ОЗУ: '32 ГБ', Память: '1 ТБ', Цвет: c } },
        { skuParts: ['MBA-M4', '32-2TB', c.replace(' ','-').toUpperCase()], price: price('macbook-air-m4-32-2tb'), attributes: { ОЗУ: '32 ГБ', Память: '2 ТБ', Цвет: c } },
      ])
    ]
  })

  // MacBook Pro
  await createProduct({
    name: 'MacBook Pro 14"', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['MacBook Pro 14'], specs: SPECS['MacBook Pro 14'],
    variants: [
      { skuParts: ['MBP14', 'SPACE-BLACK'], price: price('macbook-pro-14'), attributes: { Цвет: 'Space Black' } },
      { skuParts: ['MBP14', 'SILVER'], price: price('macbook-pro-14'), attributes: { Цвет: 'Silver' } },
    ]
  })
  await createProduct({
    name: 'MacBook Pro 16"', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['MacBook Pro 16'], specs: SPECS['MacBook Pro 16'],
    variants: [
      { skuParts: ['MBP16', 'SPACE-BLACK'], price: price('macbook-pro-16'), attributes: { Цвет: 'Space Black' } },
      { skuParts: ['MBP16', 'SILVER'], price: price('macbook-pro-16'), attributes: { Цвет: 'Silver' } },
    ]
  })

  // Mac Mini
  await createProduct({
    name: 'Mac Mini M4', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['Mac Mini M4'], specs: SPECS['Mac Mini M4'],
    variants: [{ skuParts: ['MAC-MINI-M4'], price: price('mac-mini-m4'), attributes: {} }]
  })
  await createProduct({
    name: 'Mac Mini M4 Pro', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['Mac Mini M4 Pro'], specs: SPECS['Mac Mini M4 Pro'],
    variants: [{ skuParts: ['MAC-MINI-M4PRO'], price: price('mac-mini-m4-pro'), attributes: {} }]
  })

  // Mac Studio
  await createProduct({
    name: 'Mac Studio M4 Max', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['Mac Studio M4 Max'], specs: SPECS['Mac Studio M4 Max'],
    variants: [{ skuParts: ['MAC-STUDIO-M4MAX'], price: price('mac-studio-m4-max'), attributes: {} }]
  })
  await createProduct({
    name: 'Mac Studio M3 Ultra', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['Mac Studio M3 Ultra'], specs: SPECS['Mac Studio M3 Ultra'],
    variants: [{ skuParts: ['MAC-STUDIO-M3ULTRA'], price: price('mac-studio-m3-ultra'), attributes: {} }]
  })

  // iMac
  await createProduct({
    name: 'iMac 24" M4', brand: 'Apple', categoryId: LAPTOPS.id,
    description: DESCRIPTIONS['iMac M4'], specs: SPECS['iMac M4'],
    variants: [{ skuParts: ['IMAC-M4'], price: price('imac-m4'), attributes: {} }]
  })

  console.log('✅ Ноутбуки готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // ПЛАНШЕТЫ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📲 iPad...')

  // iPad 11
  await createProduct({
    name: 'iPad 11', brand: 'Apple', categoryId: TABLETS.id,
    description: DESCRIPTIONS['iPad 11'], specs: SPECS['iPad 11'],
    variants: [
      ...['Pink','Yellow','Blue','Silver'].flatMap(c => [
        { skuParts: ['IPAD11', '128', c.toUpperCase()], price: price('ipad-11-128'), attributes: { Память: '128 ГБ', Цвет: c } },
        { skuParts: ['IPAD11', '256', c.toUpperCase()], price: price('ipad-11-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD11', '512', c.toUpperCase()], price: price('ipad-11-512'), attributes: { Память: '512 ГБ', Цвет: c } },
      ])
    ]
  })

  // iPad Air 11
  await createProduct({
    name: 'iPad Air 11"', brand: 'Apple', categoryId: TABLETS.id,
    description: DESCRIPTIONS['iPad Air 11'], specs: SPECS['iPad Air 11'],
    variants: [
      ...['Purple','Starlight','Space Gray','Blue'].flatMap(c => [
        { skuParts: ['IPAD-AIR11', '128', c.toUpperCase()], price: price('ipad-air-11-128'), attributes: { Память: '128 ГБ', Цвет: c } },
        { skuParts: ['IPAD-AIR11', '256', c.toUpperCase()], price: price('ipad-air-11-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD-AIR11', '512', c.toUpperCase()], price: price('ipad-air-11-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IPAD-AIR11', '1TB', c.toUpperCase()], price: price('ipad-air-11-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPad Air 13
  await createProduct({
    name: 'iPad Air 13"', brand: 'Apple', categoryId: TABLETS.id,
    description: DESCRIPTIONS['iPad Air 13'], specs: SPECS['iPad Air 13'],
    variants: [
      ...['Blue','Purple','Starlight','Space Gray'].flatMap(c => [
        { skuParts: ['IPAD-AIR13', '128', c.toUpperCase()], price: price('ipad-air-13-128'), attributes: { Память: '128 ГБ', Цвет: c } },
        { skuParts: ['IPAD-AIR13', '256', c.toUpperCase()], price: price('ipad-air-13-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD-AIR13', '512', c.toUpperCase()], price: price('ipad-air-13-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IPAD-AIR13', '1TB', c.toUpperCase()], price: price('ipad-air-13-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPad Pro 11 M4
  await createProduct({
    name: 'iPad Pro 11" M4', brand: 'Apple', categoryId: TABLETS.id,
    description: DESCRIPTIONS['iPad Pro 11 M4'], specs: SPECS['iPad Pro 11 M4'],
    variants: [
      ...['Silver','Space Black'].flatMap(c => [
        { skuParts: ['IPAD-PRO11-M4', '256', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO11-M4', '512', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO11-M4', '1TB', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
        { skuParts: ['IPAD-PRO11-M4', '2TB', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-2tb'), attributes: { Память: '2 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPad Pro 13 M4
  await createProduct({
    name: 'iPad Pro 13" M4', brand: 'Apple', categoryId: TABLETS.id,
    description: DESCRIPTIONS['iPad Pro 13 M4'], specs: SPECS['iPad Pro 13 M4'],
    variants: [
      ...['Silver','Space Black'].flatMap(c => [
        { skuParts: ['IPAD-PRO13-M4', '256', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-256'), attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO13-M4', '512', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-512'), attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO13-M4', '1TB', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-1tb'), attributes: { Память: '1 ТБ', Цвет: c } },
        { skuParts: ['IPAD-PRO13-M4', '2TB', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-2tb'), attributes: { Память: '2 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPad Pro 11 M5
  await createProduct({
    name: 'iPad Pro 11" M5', brand: 'Apple', categoryId: TABLETS.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['iPad Pro 11 M5'], specs: SPECS['iPad Pro 11 M5'],
    variants: [
      ...['Silver','Space Black'].flatMap(c => [
        { skuParts: ['IPAD-PRO11-M5', '256', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-256') + 10000, attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO11-M5', '512', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-512') + 10000, attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO11-M5', '1TB', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-11-1tb') + 10000, attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  // iPad Pro 13 M5
  await createProduct({
    name: 'iPad Pro 13" M5', brand: 'Apple', categoryId: TABLETS.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['iPad Pro 13 M5'], specs: SPECS['iPad Pro 13 M5'],
    variants: [
      ...['Silver','Space Black'].flatMap(c => [
        { skuParts: ['IPAD-PRO13-M5', '256', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-256') + 10000, attributes: { Память: '256 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO13-M5', '512', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-512') + 10000, attributes: { Память: '512 ГБ', Цвет: c } },
        { skuParts: ['IPAD-PRO13-M5', '1TB', c.replace(' ','-').toUpperCase()], price: price('ipad-pro-13-1tb') + 10000, attributes: { Память: '1 ТБ', Цвет: c } },
      ])
    ]
  })

  console.log('✅ Планшеты готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // ЧАСЫ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('⌚ Часы...')

  const watchModels = [
    ['Apple Watch SE 2', 'watch-se2', ['Starlight','Silver','Midnight'], 'Apple Watch SE 2'],
    ['Apple Watch SE 3', 'watch-se3', ['Midnight','Starlight','Silver'], 'Apple Watch SE 3'],
    ['Apple Watch Series 10', 'watch-s10', ['Jet Black','Rose Gold','Silver'], 'Apple Watch Series 10'],
    ['Apple Watch Series 11', 'watch-s11', ['Jet Black','Rose Gold','Silver'], 'Apple Watch Series 11'],
    ['Apple Watch Ultra 2', 'watch-ultra2', ['Natural Titanium','Black Titanium'], 'Apple Watch Ultra 2'],
    ['Apple Watch Ultra 3', 'watch-ultra3', ['Natural Titanium','Black Titanium'], 'Apple Watch Ultra 3'],
  ]
  for (const [name, priceKey, colors, descKey] of watchModels as any[]) {
    const isNew = name.includes('11') || name.includes('Ultra 3')
    await createProduct({
      name, brand: 'Apple', categoryId: WATCHES.id, badge: isNew ? 'НОВИНКА' : undefined,
      description: DESCRIPTIONS[descKey] ?? '', specs: SPECS[descKey] ?? {},
      variants: colors.map((c: string) => ({
        skuParts: [name.replace(/\s/g,'-').toUpperCase(), c.replace(/\s/g,'-').toUpperCase()],
        price: price(priceKey),
        attributes: { Цвет: c }
      }))
    })
  }

  // Garmin
  const garminModels = [
    ['Garmin Forerunner 55', 'garmin-fr55'],
    ['Garmin Forerunner 165', 'garmin-fr165'],
    ['Garmin Forerunner 275', 'garmin-fr275'],
    ['Garmin Forerunner 275S', 'garmin-fr275s'],
    ['Garmin Forerunner 265 Plus', 'garmin-fr265-plus'],
    ['Garmin Fenix 8', 'garmin-fenix8'],
    ['Garmin Fenix 7', 'garmin-fenix7'],
    ['Garmin Vivoactive 6', 'garmin-vivoactive6'],
    ['Garmin Instinct 3 Solar', 'garmin-instinct3'],
    ['Garmin Forerunner 1055', 'garmin-fr1055'],
    ['Garmin Enduro 3', 'garmin-enduro3'],
  ]
  const garminSpecs: Record<string, Record<string, string>> = {
    'Garmin Forerunner 55': { GPS: 'Встроенный', Датчики: 'ЧСС, шаги, стресс', Батарея: 'до 20 часов', Защита: '5 ATM', ОС: 'Garmin OS' },
    'Garmin Forerunner 165': { GPS: 'Многополосный', Датчики: 'ЧСС, SpO2, шаги', Батарея: 'до 19 часов', Дисплей: 'AMOLED', Защита: '5 ATM' },
    'Garmin Forerunner 275': { GPS: 'Многополосный', Датчики: 'ЧСС, SpO2, температура', Батарея: 'до 20 часов', Дисплей: 'AMOLED', Защита: '5 ATM' },
    'Garmin Fenix 8': { GPS: 'Многополосный', Датчики: 'ЧСС, SpO2, альтиметр, компас', Батарея: 'до 90 часов', Корпус: 'Титан/нержавейка', Защита: '10 ATM, MIL-STD' },
    'Garmin Fenix 7': { GPS: 'Многополосный', Датчики: 'ЧСС, SpO2, альтиметр, компас', Батарея: 'до 57 часов', Корпус: 'Нержавейка', Защита: '10 ATM, MIL-STD' },
    'Garmin Vivoactive 6': { GPS: 'Встроенный', Датчики: 'ЧСС, SpO2, стресс', Батарея: 'до 11 суток', Дисплей: 'AMOLED', Защита: '5 ATM' },
    'Garmin Instinct 3 Solar': { GPS: 'Многополосный', Датчики: 'ЧСС, альтиметр, компас', Батарея: 'до 70 часов (до ∞ с солнечной)', Корпус: 'Стекловолокно', Защита: 'MIL-STD-810' },
    'Garmin Enduro 3': { GPS: 'Многополосный', Датчики: 'ЧСС, SpO2, альтиметр', Батарея: 'до 330 часов с солнечной', Корпус: 'Карбон', Защита: '10 ATM, MIL-STD' },
  }
  for (const [name, priceKey] of garminModels) {
    await createProduct({
      name, brand: 'Garmin', categoryId: WATCHES.id,
      description: `${name} — спортивные часы Garmin с GPS и продвинутым мониторингом здоровья. Долгое время работы и высокая надёжность для тренировок.`,
      specs: garminSpecs[name] ?? {},
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  console.log('✅ Часы готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // АУДИО
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🎧 Аудио...')

  // AirPods Max
  await createProduct({
    name: 'AirPods Max', brand: 'Apple', categoryId: AUDIO.id,
    description: DESCRIPTIONS['AirPods Max'], specs: SPECS['AirPods Max'],
    variants: ['Midnight','Starlight','Blue','Purple','Orange'].map(c => ({
      skuParts: ['AIRPODS-MAX', c.toUpperCase()],
      price: price('airpods-max'),
      attributes: { Цвет: c }
    }))
  })

  // AirPods Pro 2 & 3
  await createProduct({
    name: 'AirPods Pro 2', brand: 'Apple', categoryId: AUDIO.id,
    description: DESCRIPTIONS['AirPods Pro 2'], specs: SPECS['AirPods Pro 2'],
    variants: [{ skuParts: ['AIRPODS-PRO2'], price: price('airpods-pro2'), attributes: {} }]
  })
  await createProduct({
    name: 'AirPods Pro 3', brand: 'Apple', categoryId: AUDIO.id, badge: 'НОВИНКА',
    description: DESCRIPTIONS['AirPods Pro 3'], specs: SPECS['AirPods Pro 3'],
    variants: [{ skuParts: ['AIRPODS-PRO3'], price: price('airpods-pro3'), attributes: {} }]
  })

  // AirPods 4
  await createProduct({
    name: 'AirPods 4', brand: 'Apple', categoryId: AUDIO.id,
    description: DESCRIPTIONS['AirPods 4'], specs: SPECS['AirPods 4'],
    variants: [{ skuParts: ['AIRPODS4'], price: price('airpods-4'), attributes: {} }]
  })
  await createProduct({
    name: 'AirPods 4 ANC', brand: 'Apple', categoryId: AUDIO.id,
    description: DESCRIPTIONS['AirPods 4 ANC'], specs: SPECS['AirPods 4 ANC'],
    variants: [{ skuParts: ['AIRPODS4-ANC'], price: price('airpods-4-anc'), attributes: {} }]
  })

  // HomePod
  await createProduct({
    name: 'HomePod 2', brand: 'Apple', categoryId: AUDIO.id,
    description: 'Apple HomePod 2 — умная колонка с Dolby Atmos, пространственным звуком и датчиком температуры/влажности. Идеальная интеграция с HomeKit.',
    specs: { Звук: 'High-excursion woofer + 5 тонких твитеров', Микрофоны: '4 микрофона', "Умный дом": 'Thread, HomeKit', Датчики: 'Температура, влажность', Цвет: 'White/Midnight' },
    variants: [{ skuParts: ['HOMEPOD2'], price: price('homepod2'), attributes: {} }]
  })
  await createProduct({
    name: 'HomePod Mini', brand: 'Apple', categoryId: AUDIO.id,
    description: 'HomePod Mini — компактная умная колонка Apple с отличным звуком, Siri и поддержкой всей экосистемы Apple.',
    specs: { Звук: 'Full-range driver + двойные пассивные радиаторы', "Умный дом": 'Thread, HomeKit', Чип: 'Apple S5' },
    variants: [{ skuParts: ['HOMEPOD-MINI'], price: price('homepod-mini'), attributes: {} }]
  })

  // Яндекс станции
  const yandexStations = [
    ['Яндекс Станция Мини 3', 'yandex-mini3', 'Яндекс Станция Мини 3 с Алисой — компактная умная колонка с отличным звуком и умным домом.', { Звук: 'Fullrange 5 Вт', Связь: 'Wi-Fi, Bluetooth 5.1', Микрофоны: '3 микрофона', Экран: 'Часы-дисплей' }],
    ['Яндекс Станция Лайт', 'yandex-light', 'Яндекс Станция Лайт — доступная умная колонка с Алисой. Лучший способ начать использовать умный дом.', { Звук: 'Fullrange 3 Вт', Связь: 'Wi-Fi, Bluetooth 4.2' }],
    ['Яндекс Станция Стрит', 'yandex-street', 'Яндекс Станция Стрит — влагозащищённая умная колонка для улицы. IP65, встроенный аккумулятор.', { Звук: '17 Вт', Защита: 'IP65', Батарея: 'до 8 часов', Связь: 'Wi-Fi, Bluetooth' }],
    ['Яндекс Станция Макс', 'yandex-max', 'Яндекс Станция Макс — флагманская умная колонка с HDMI и звуком 65 Вт. Полноценный медиацентр.', { Звук: '65 Вт (2.1)', Видео: 'HDMI 4K HDR', Микрофоны: '7 микрофонов', Связь: 'Wi-Fi, Bluetooth, HDMI, оптика' }],
    ['Яндекс Станция Дуо Макс', 'yandex-duo-max', 'Яндекс Станция Дуо Макс — колонка с экраном 10" и видеозвонками. Умный дом и стриминг в одном устройстве.', { Звук: '30 Вт', Экран: '10" IPS 1280×800', Камера: '5 МП', Микрофоны: '8 микрофонов' }],
    ['Яндекс Станция Миди', 'yandex-midi', 'Яндекс Станция Миди с Zigbee-хабом — умная колонка и центр умного дома в одном устройстве.', { Звук: '24 Вт', "Умный дом": 'Zigbee-хаб встроен', Микрофоны: '6 микрофонов', Связь: 'Wi-Fi, Bluetooth, Zigbee' }],
  ]
  for (const [name, priceKey, desc, specs] of yandexStations as any[]) {
    await createProduct({
      name, brand: 'Яндекс', categoryId: AUDIO.id,
      description: desc, specs,
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  // JBL
  const jblModels = [
    ['JBL Charge 6', 'jbl-charge6', 'JBL Charge 6 — портативная колонка с водонепроницаемостью IP67 и 20 часами автономной работы. Заряжает устройства через USB.', { Звук: '40 Вт', Батарея: 'до 20 часов', Защита: 'IP67', Bluetooth: '5.3' }],
    ['JBL Xtreme 4', 'jbl-xtreme4', 'JBL Xtreme 4 — мощная портативная колонка 40 Вт с IP67 и плечевым ремнём. Для вечеринок на природе.', { Звук: '40 Вт', Батарея: 'до 24 часов', Защита: 'IP67', Bluetooth: '5.3' }],
    ['JBL GO 4', 'jbl-go4', 'JBL GO 4 — самая маленькая JBL колонка с IP67. Берите куда угодно — весит всего 184 г.', { Звук: '3 Вт', Батарея: 'до 7 часов', Защита: 'IP67', Вес: '184 г' }],
    ['JBL Flip 7', 'jbl-flip7', 'JBL Flip 7 с IP67, 12 часами работы и ярким звуком. Новый процессор для чистого звучания.', { Звук: '20 Вт', Батарея: 'до 12 часов', Защита: 'IP67', Bluetooth: '5.3' }],
    ['JBL PartyBox 520', 'jbl-partybox520', 'JBL PartyBox 520 — большая колонка для вечеринок с RGB подсветкой и звуком 480 Вт. Беспроводной микрофон в комплекте.', { Звук: '480 Вт', Батарея: 'до 18 часов', Подсветка: 'RGB', Bluetooth: '5.1' }],
    ['JBL PartyBox Encore 2', 'jbl-partybox-encore2', 'JBL PartyBox Encore 2 с двумя беспроводными микрофонами. Для домашних вечеринок и корпоративов.', { Звук: '100 Вт', Батарея: 'до 6 часов', Микрофоны: '2 беспроводных', Bluetooth: '5.1' }],
  ]
  for (const [name, priceKey, desc, specs] of jblModels as any[]) {
    await createProduct({
      name, brand: 'JBL', categoryId: AUDIO.id,
      description: desc, specs,
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  console.log('✅ Аудио готово\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // ИГРОВЫЕ КОНСОЛИ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🎮 Консоли...')

  const consoleItems = [
    ['PlayStation 5', 'ps5', 'Sony', 'Игровые консоли', 'PlayStation 5 с дисководом — консоль нового поколения от Sony с SSD 825 ГБ, 4K 120fps и DualSense контроллером.', { CPU: 'AMD Zen 2 8 ядер 3.5 ГГц', GPU: 'AMD RDNA 2 10.28 ТFLOPS', ОЗУ: '16 ГБ GDDR6', SSD: '825 ГБ', Разрешение: '8K поддержка' }],
    ['PlayStation 5 Slim', 'ps5-slim', 'Sony', 'Игровые консоли', 'PS5 Slim — обновлённая PlayStation 5 в уменьшенном корпусе, на 24% легче оригинала.', { CPU: 'AMD Zen 2 8 ядер', GPU: 'AMD RDNA 2 10.28 ТFLOPS', SSD: '1 ТБ', Вес: '3.2 кг' }],
    ['PlayStation 5 Pro', 'ps5-pro', 'Sony', 'Игровые консоли', 'PS5 Pro — усиленная версия PS5 с GPU в 3 раза мощнее, трассировкой лучей и 4K 120fps в большинстве игр.', { CPU: 'AMD Zen 2 8 ядер', GPU: 'AMD RDNA 2 33.5 ТFLOPS', ОЗУ: '16 ГБ GDDR6', SSD: '2 ТБ' }],
    ['Дисковод PlayStation 5', 'ps5-drive', 'Sony', 'Игровые консоли', 'Внешний дисковод для PlayStation 5 Slim Digital Edition. Добавляет поддержку дисков Blu-ray.', {}],
    ['Геймпад DualSense', 'ps5-gamepad', 'Sony', 'Игровые консоли', 'Геймпад DualSense с тактильной отдачей, адаптивными триггерами и встроенным микрофоном для PS5.', { Батарея: 'до 12 часов', Подключение: 'USB-C / Bluetooth 5.1', Вибрация: 'Тактильная + адаптивные триггеры' }],
    ['Xbox Series X', 'xbox-series-x', 'Microsoft', 'Игровые консоли', 'Xbox Series X — самая мощная консоль Microsoft с 12 ТFLOPS, SSD 1 ТБ и поддержкой 4K 120fps.', { CPU: 'AMD Zen 2 8 ядер 3.8 ГГц', GPU: 'AMD RDNA 2 12 ТFLOPS', ОЗУ: '16 ГБ GDDR6', SSD: '1 ТБ' }],
    ['Xbox Series S', 'xbox-series-s', 'Microsoft', 'Игровые консоли', 'Xbox Series S — доступная консоль нового поколения от Microsoft. Только цифровые игры, 1440p.', { CPU: 'AMD Zen 2 8 ядер 3.6 ГГц', GPU: 'AMD RDNA 2 4 ТFLOPS', ОЗУ: '10 ГБ GDDR6', SSD: '512 ГБ' }],
    ['Геймпад Xbox', 'xbox-gamepad', 'Microsoft', 'Игровые консоли', 'Оригинальный геймпад Xbox с текстурированными рукоятками и кнопкой Share. Совместим с Xbox и PC.', { Батарея: 'до 40 часов (АА)', Подключение: 'USB-C / Bluetooth' }],
    ['Steam Deck OLED 512 ГБ', 'steam-deck-512', 'Valve', 'Игровые консоли', 'Steam Deck OLED 512 ГБ — портативная игровая консоль с ярким HDR дисплеем и полным доступом к Steam.', { Экран: '7.4" OLED HDR 90Hz', CPU: 'AMD Zen 2 4 ядра', GPU: 'AMD RDNA 2 8 CU', ОЗУ: '16 ГБ', Батарея: 'до 12 часов' }],
    ['Steam Deck OLED 1 ТБ', 'steam-deck-1tb', 'Valve', 'Игровые консоли', 'Steam Deck OLED 1 ТБ — максимальная конфигурация с быстрым NVMe SSD и матовым экраном.', { Экран: '7.4" OLED HDR 90Hz', SSD: '1 ТБ NVMe', ОЗУ: '16 ГБ', Батарея: 'до 12 часов' }],
    ['Nintendo Switch 2', 'switch-2', 'Nintendo', 'Игровые консоли', 'Nintendo Switch 2 — следующее поколение гибридной консоли Nintendo с большим экраном и мощнее в 3 раза.', { Экран: '7.9" LCD 1080p', Дорезолюция: '4K в TV режиме', ОЗУ: '12 ГБ', Батарея: 'до 6 часов' }],
    ['Nintendo Switch', 'switch-1', 'Nintendo', 'Игровые консоли', 'Nintendo Switch — революционная гибридная консоль. Играйте дома на ТВ или возьмите с собой.', { Экран: '6.2" LCD', Режимы: 'TV, Настольный, Портативный', Батарея: 'до 9 часов' }],
    ['Nintendo Switch Lite', 'switch-lite', 'Nintendo', 'Игровые консоли', 'Nintendo Switch Lite — компактная версия Switch только для портативной игры. Легче и дешевле.', { Экран: '5.5" LCD', Вес: '275 г', Батарея: 'до 7 часов' }],
    ['Meta Quest 3S', 'oculus-quest-3s', 'Meta', 'Игровые консоли', 'Meta Quest 3S — доступная смешанная реальность с Snapdragon XR2 Gen 2 и цветными сенсорами.', { Чип: 'Snapdragon XR2 Gen 2', ОЗУ: '8 ГБ', Дисплей: 'LCD 2064×2208 на глаз', Батарея: 'до 2.5 часов' }],
    ['Meta Quest 3', 'oculus-quest-3', 'Meta', 'Игровые консоли', 'Meta Quest 3 — лучшее смешанная реальность для потребителей. Вдвое тоньше Quest 2, цветные камеры passthrough.', { Чип: 'Snapdragon XR2 Gen 2', ОЗУ: '8 ГБ', Дисплей: 'LCD 2064×2208 на глаз', Хранилище: '128/512 ГБ', Батарея: 'до 3 часов' }],
  ]
  for (const [name, priceKey, brand, , desc, specs] of consoleItems as any[]) {
    await createProduct({
      name, brand, categoryId: CONSOLES.id,
      description: desc, specs,
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  console.log('✅ Консоли готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // DYSON
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🌀 Dyson...')

  // Dyson — уход за волосами
  const dysonHairItems = [
    ['Dyson Airwrap Long HS05', 'dyson-hs05', 'Стайлер Dyson Airwrap Long HS05 — завивка, укладка и сушка без экстремального жара. В комплекте 6 насадок.', { Технология: 'Coanda airflow', Насадки: '6 в комплекте', Режимы: 'Горячий/холодный', "Длина фена": 'Удлинённый' }],
    ['Dyson Airwrap Long HS07', 'dyson-hs07', 'Dyson Airwrap Long HS07 с улучшенным мотором V9. Тихая работа и равномерный поток воздуха.', { Технология: 'Coanda airflow', Мотор: 'Dyson V9', Режимы: '3 температуры, 3 скорости' }],
    ['Dyson Airwrap Long HS08', 'dyson-hs08', 'Dyson Airwrap Long HS08 — самый умный стайлер с автоматическим режимом AIRWRAP IQ. Сенсоры регулируют температуру 40 раз в секунду.', { Технология: 'Coanda + IQ датчики', Датчики: '40 замеров/сек', Мотор: 'Dyson V9 цифровой' }],
    ['Dyson Airwrap Long HS09', 'dyson-hs09', 'Dyson Airwrap Long HS09 — новейшее поколение стайлера. Технология Flyaway с насадкой для устранения пушистости.', { Технология: 'Coanda airflow + Flyaway', Мотор: 'Dyson V9', Насадки: '7 в комплекте' }],
    ['Dyson Supersonic HD18 Pro', 'dyson-hd18-pro', 'Dyson Supersonic HD18 Pro — профессиональный фен с экраном для контроля температуры. Для салонов красоты.', { Мотор: 'Dyson V13 цифровой', Технология: 'Air Multiplier', Экран: 'LED температурный индикатор', Шум: '75 дБ' }],
    ['Dyson Supersonic HD16', 'dyson-hd16', 'Dyson Supersonic HD16 — новый тихий фен с интеллектуальным контролем температуры и насадкой Flyaway.', { Мотор: 'Dyson V13', Технология: 'Air Multiplier', Насадки: 'Flyaway + концентратор + диффузор' }],
    ['Dyson Supersonic HD15', 'dyson-hd15', 'Dyson Supersonic HD15 — фен с магнитными насадками и технологией защиты волос от перегрева.', { Мотор: 'Dyson V9', Крепление: 'Магнитные насадки', Защита: 'Стекло защищает волосы' }],
    ['Dyson Supersonic HD08', 'dyson-hd08', 'Dyson Supersonic HD08 — классический Dyson Supersonic с магнитными насадками.', { Мотор: 'Dyson V9', Крепление: 'Магнитные насадки' }],
    ['Dyson Supersonic HD07', 'dyson-hd07', 'Dyson Supersonic HD07 — лёгкий фен Dyson для повседневного использования.', { Мотор: 'Dyson V9', Вес: '640 г' }],
    ['Dyson Supersonic HD03', 'dyson-hd03', 'Dyson Supersonic HD03 — доступный фен Dyson с технологией воздушного умножителя.', { Мотор: 'Dyson digital', Технология: 'Air Multiplier' }],
    ['Dyson Supersonic Professional', 'dyson-supersonic-pro', 'Dyson Supersonic Professional — специальная версия для парикмахеров с кейсом и широким выбором насадок.', { Мотор: 'Dyson V9', Комплект: 'Кейс + 6 профессиональных насадок', Использование: 'Профессиональный салон' }],
    ['Dyson HT01 Airstrait', 'dyson-ht01', 'Dyson Airstrait HT01 — выпрямитель потоком воздуха без пластин. Выпрямляет влажные волосы без нагрева пластин.', { Технология: 'Воздух вместо пластин', Для: 'Влажные и сухие волосы', Режимы: '4 настройки' }],
  ]
  for (const [name, priceKey, desc, specs] of dysonHairItems as any[]) {
    await createProduct({
      name, brand: 'Dyson', categoryId: HAIR.id,
      description: desc, specs,
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  // Dyson — бытовая техника (пылесосы)
  const dysonVacuumItems = [
    ['Dyson V15 Detect Submarine', 'dyson-v15s', 'Dyson V15 Detect Submarine — беспроводной пылесос с насадкой для мытья полов и лазерным обнаружением пыли.', { Всасывание: '240 AW', Фильтрация: 'HEPA', Насадки: 'Submarine для мытья', Батарея: 'до 60 мин' }],
    ['Dyson V15 Green Monster', 'dyson-v15-gm', 'Dyson V15 Green Monster — специальная лимитированная версия V15 с лазерным обнаружением пыли.', { Всасывание: '240 AW', Фильтрация: 'HEPA', Батарея: 'до 60 мин', Лазер: 'Выявляет невидимую пыль' }],
    ['Dyson V15 Detect', 'dyson-v15', 'Dyson V15 Detect — самый мощный Dyson с лазером для обнаружения пыли и пьезодатчиком счёта частиц.', { Всасывание: '240 AW', Фильтрация: 'HEPA', Батарея: 'до 60 мин', Датчик: 'Подсчёт частиц в реальном времени' }],
    ['Dyson Gen5 Detect', 'dyson-g5gr', 'Dyson Gen5 Detect — самый мощный Dyson в истории. 262 AW всасывания и полная HEPA фильтрация.', { Всасывание: '262 AW', Фильтрация: 'HEPA полная', Батарея: 'до 70 мин', Двигатель: 'Hyperdymium 135 000 об/мин' }],
    ['Dyson V15 Handstick', 'dyson-v15-handstick', 'Dyson V15 Handstick — компактная версия V15 для небольших пространств и быстрой уборки.', { Всасывание: '230 AW', Фильтрация: 'HEPA', Батарея: 'до 60 мин' }],
    ['Dyson WashG1', 'dyson-wash', 'Dyson WashG1 — первый в мире беспроводной пылесос для влажной уборки. Моет и сушит в одно касание.', { Технология: 'Влажная уборка', Ёмкость: '0.8 л воды', Батарея: 'до 35 мин', Самоочистка: 'Автоматическая' }],
    ['Dyson 360 Vis Nav', 'dyson-360-vis-nav', 'Dyson 360 Vis Nav — самый умный робот-пылесос Dyson с широкоугольным зрением и всасыванием 110 AW.', { Всасывание: '110 AW', Навигация: 'Fish-eye 360°', Фильтрация: 'HEPA', Батарея: 'до 50 мин' }],
    ['Dyson V11 Torque Drive', 'dyson-v11', 'Dyson V11 Torque Drive — умный пылесос с LCD дисплеем и автоматической регулировкой мощности.', { Всасывание: '185 AW', Дисплей: 'LCD остаток заряда/режим', Батарея: 'до 60 мин', Фильтрация: 'HEPA' }],
    ['Dyson V10 Animal', 'dyson-v10', 'Dyson V10 Animal — мощный пылесос для домов с животными. Специальные насадки для шерсти.', { Всасывание: '151 AW', Батарея: 'до 60 мин', Насадки: 'Для шерсти животных', Фильтрация: 'HEPA' }],
    ['Dyson PencilVac', 'dyson-pencilvac', 'Dyson PencilVac — ультратонкий пылесос диаметром 12 мм для труднодоступных мест.', { Диаметр: '12 мм', Батарея: 'до 20 мин', Применение: 'Щели, автомобиль, клавиатура' }],
  ]
  for (const [name, priceKey, desc, specs] of dysonVacuumItems as any[]) {
    await createProduct({
      name, brand: 'Dyson', categoryId: VACUUM.id,
      description: desc, specs,
      variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
    })
  }

  // Dreame
  await createProduct({ name: 'Dreame Робот-пылесос', brand: 'Dreame', categoryId: VACUUM.id, description: 'Dreame — роботы-пылесосы с лазерной навигацией, моющими насадками и умным картированием.', specs: {}, variants: [{ skuParts: ['DREAME-ROBOT'], price: price('dreame-robot'), attributes: {} }] })
  await createProduct({ name: 'Dreame Вертикальный пылесос', brand: 'Dreame', categoryId: VACUUM.id, description: 'Вертикальный беспроводной пылесос Dreame с мощным всасыванием и HEPA фильтрацией.', specs: {}, variants: [{ skuParts: ['DREAME-VERTICAL'], price: price('dreame-vertical'), attributes: {} }] })
  await createProduct({ name: 'Dreame Вертикальный моющий пылесос', brand: 'Dreame', categoryId: VACUUM.id, description: 'Вертикальный моющий пылесос Dreame — пылесосит и моет пол одновременно.', specs: {}, variants: [{ skuParts: ['DREAME-VERTICAL-WASH'], price: price('dreame-vertical-wash'), attributes: {} }] })

  // Roborock
  const roborockItems = [
    ['Roborock Saros Z70', 'roborock-saros-z70', 'Roborock Saros Z70 — революционный робот-пылесос с роборукой для уборки предметов с пола.', { Всасывание: '22 000 Па', Навигация: 'StarSight AI', Роборука: 'Убирает предметы', Мытьё: 'Vibrarise 2.0' }],
    ['Roborock Qrevo MaxV', 'roborock-qrevo-maxv', 'Roborock Qrevo MaxV — флагманский робот-пылесос с всасыванием 10 000 Па и видеокамерой для охраны дома.', { Всасывание: '10 000 Па', Камера: 'Встроенная для наблюдения', Мытьё: 'Vibrarise', Навигация: 'PreciSense LiDAR' }],
    ['Roborock Qrevo C', 'roborock-qrevo-c', 'Roborock Qrevo C — доступный флагман Roborock с самоочищающейся базой.', { Всасывание: '7 000 Па', База: 'Самоопорожнение, самомытьё', Навигация: 'LiDAR' }],
    ['Roborock Qrevo Curv', 'roborock-qrevo-curv', 'Roborock Qrevo Curv с изогнутой щёткой для уборки углов и плинтусов.', { Всасывание: '9 000 Па', Щётка: 'Изогнутая для углов', Мытьё: 'Vibrarise' }],
    ['Roborock Qrevo Edge', 'roborock-qrevo-edge', 'Roborock Qrevo Edge — моет вплотную к стенам и плинтусам. Максимальное покрытие уборки.', { Всасывание: '8 500 Па', Мытьё: 'EdgeExtend', Навигация: 'PreciSense' }],
    ['Roborock F25 LT', 'roborock-f25-lt', 'Roborock F25 LT — лёгкий вертикальный пылесос с быстрой зарядкой и автосамоочисткой.', { Всасывание: '180 AW', Батарея: 'до 45 мин', Вес: '1.4 кг' }],
    ['Roborock H60', 'roborock-h60', 'Roborock H60 — мощный вертикальный пылесос с HEPA фильтром и длинной аккумуляторной жизнью.', { Всасывание: '220 AW', Батарея: 'до 90 мин', Фильтрация: 'HEPA H12' }],
  ]
  for (const [name, priceKey, desc, specs] of roborockItems as any[]) {
    await createProduct({ name, brand: 'Roborock', categoryId: VACUUM.id, description: desc, specs, variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }] })
  }

  // Xiaomi пылесосы
  const xiaomiVacuums = [
    ['Xiaomi Vacuum Cleaner G20', 'xiaomi-g20', 'Xiaomi Vacuum Cleaner G20 — беспроводной пылесос с всасыванием 185 Вт и мягкой роликовой насадкой.', { Всасывание: '185 Вт', Батарея: 'до 60 мин', Вес: '1.5 кг' }],
    ['Xiaomi Vacuum Cleaner G20 Lite', 'xiaomi-g20-lite', 'Xiaomi G20 Lite — доступная версия G20 для ежедневной уборки.', { Всасывание: '150 Вт', Батарея: 'до 50 мин' }],
    ['Xiaomi Vacuum Cleaner G20 Max', 'xiaomi-g20-max', 'Xiaomi G20 Max — усиленная версия с большим аккумулятором и мощным всасыванием.', { Всасывание: '220 Вт', Батарея: 'до 90 мин' }],
  ]
  for (const [name, priceKey, desc, specs] of xiaomiVacuums as any[]) {
    await createProduct({ name, brand: 'Xiaomi', categoryId: VACUUM.id, description: desc, specs, variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }] })
  }

  console.log('✅ Dyson и пылесосы готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // ФОТО И ВИДЕО
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📷 Фото и видео...')

  const photoItems = [
    ['Canon PowerShot GX7 Mark III', 'canon-gx7-mark3', 'Canon', 'Canon PowerShot G7X Mark III — компактная камера с 1" сенсором, 4K видео и прямой трансляцией на YouTube.', { Сенсор: '1" 20.1 МП', Объектив: '24-100mm f/1.8-2.8', Видео: '4K 30fps', Экран: '3" поворотный', "Wi-Fi": 'Встроенный' }],
    ['Nikon ZF', 'nikon-zf', 'Nikon', 'Nikon ZF — беззеркальная камера в ретро-стиле с полнокадровым сенсором 24.5 МП и стабилизацией 8 стопов.', { Сенсор: 'Full-frame 24.5 МП BSI-CMOS', Видео: '4K 30fps', Стабилизация: 'In-body 8 стопов', Экран: '3.2" наклонный', Байонет: 'Nikon Z' }],
    ['Nikon Z6 III', 'nikon-z6iii', 'Nikon', 'Nikon Z6 III — первая частично стекируемая полнокадровая камера с 6K RAW видео и 120fps в 4K.', { Сенсор: 'Full-frame 24.5 МП частично стекированный', Видео: '6K RAW, 4K 120fps', Стабилизация: 'In-body 8 стопов', Скорость: '20 к/с', Байонет: 'Nikon Z' }],
    ['DJI OSMO Pocket 3 Creator Combo', 'dji-osmo-pocket3', 'DJI', 'DJI Osmo Pocket 3 Creator Combo — карманная 3-осевая камера с 1" сенсором и поворотным экраном. Полный комплект для творчества.', { Сенсор: '1" CMOS 20 МП', Стабилизация: '3-осевой гимбал', Видео: '4K 120fps', Экран: '2" поворотный', Набор: 'Creator Combo' }],
    ['DJI OSMO Action 3', 'dji-osmo-action3', 'DJI', 'DJI Osmo Action 3 — экшн-камера с двумя экранами, горизонтальным захватом и зарядкой 0–80% за 18 минут.', { Видео: '4K 120fps', Стабилизация: 'RockSteady 3.0', Экраны: 'Передний + задний', Зарядка: '0–80% за 18 мин', Защита: 'IP68' }],
    ['Insta360 X3', 'insta360-x3', 'Insta360', 'Insta360 X3 — камера 360° с сенсором ½" и редактированием прямо в телефоне. Лучший 360° опыт.', { Видео: '5.7K 360° / 4K One Point', Сенсор: '½" 48 МП', Защита: 'IPX8', Стабилизация: 'FlowState' }],
    ['Insta360 X4', 'insta360-x4', 'Insta360', 'Insta360 X4 — 360° камера с записью 8K видео и поддержкой до 2.5 часов автономной работы.', { Видео: '8K 360° / 4K One Point', Батарея: 'до 135 мин', Защита: 'IPX8', Стабилизация: 'FlowState 360°' }],
    ['Insta360 X5', 'insta360-x5', 'Insta360', 'Insta360 X5 — новейшая 360° камера Insta360 с большим сенсором и улучшенной детализацией в темноте.', { Видео: '8K 360°', Сенсор: 'Увеличенный', Защита: 'IPX8', Батарея: 'до 150 мин' }],
    ['Ray-Ban Meta Headliner', 'ray-ban-meta-headliner', 'Ray-Ban', 'Ray-Ban Meta Headliner — умные очки с камерой 12 МП, открытым звуком и Meta AI. Новый дизайн Headliner.', { Камера: '12 МП', Аудио: 'Открытые динамики', AI: 'Meta AI встроен', Связь: 'Bluetooth, Wi-Fi', Батарея: 'до 4 часов' }],
    ['Ray-Ban Meta Skyler', 'ray-ban-meta-skyler', 'Ray-Ban', 'Ray-Ban Meta Skyler — умные очки Ray-Ban Meta в женском дизайне Skyler с камерой и Meta AI.', { Камера: '12 МП', Аудио: 'Открытые динамики', AI: 'Meta AI встроен', Дизайн: 'Skyler (женский фрейм)' }],
  ]
  for (const [name, priceKey, brand, desc, specs] of photoItems as any[]) {
    await createProduct({ name, brand, categoryId: PHOTO.id, description: desc, specs, variants: [{ skuParts: [name.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }] })
  }

  console.log('✅ Фото и видео готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // АКСЕССУАРЫ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🔌 Аксессуары...')

  const iphoneModels = ['iPhone 15', 'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max', 'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max']
  const ipadModels = ['iPad 11', 'iPad Air 11', 'iPad Air 13', 'iPad Pro 11', 'iPad Pro 13']
  const macbookModels = ['MacBook Air M3', 'MacBook Air M4', 'MacBook Pro 14', 'MacBook Pro 16']
  const watchModels2 = ['Apple Watch Series 10', 'Apple Watch Series 11', 'Apple Watch Ultra 2', 'Apple Watch Ultra 3']

  // iPhone аксессуары
  const iphoneAccessories = [
    ['Чехол iPhone базовый', 'acc-case-basic', 'Базовый защитный чехол для'],
    ['Чехол iPhone Original', 'acc-case-original', 'Оригинальный силиконовый чехол Apple для'],
    ['Чехол iPhone Pitaka', 'acc-case-pitaka', 'Ультратонкий кевларовый чехол Pitaka для'],
    ['Зарядный блок Original', 'acc-charger-block', 'Оригинальный зарядный блок Apple 20W для'],
    ['Защитное стекло ReMax', 'acc-glass-remax', 'Защитное стекло ReMax с рамкой для'],
    ['Плёнка в круг', 'acc-film-circle', 'Защитная плёнка в круг на экран для'],
    ['Зарядный кабель Original', 'acc-cable-original', 'Оригинальный кабель Apple USB-C для'],
    ['Защитное стекло на камеры', 'acc-glass-camera', 'Защитное стекло на блок камер для'],
    ['Зарядная станция 3 в 1', 'acc-dock-3in1', 'Зарядная станция 3 в 1 (iPhone + Apple Watch + AirPods) для'],
  ]
  for (const [accName, priceKey, descPrefix] of iphoneAccessories as any[]) {
    await createProduct({
      name: accName, brand: accName.includes('Pitaka') ? 'Pitaka' : accName.includes('ReMax') ? 'ReMax' : 'Apple',
      categoryId: ACCESSORIES.id,
      description: `${descPrefix} актуальных моделей iPhone. Высокое качество материалов.`,
      specs: {},
      variants: iphoneModels.map(m => ({
        skuParts: [accName.replace(/\s/g,'-').toUpperCase(), m.replace(/\s/g,'-').toUpperCase()],
        price: price(priceKey),
        attributes: { Модель: m }
      }))
    })
  }

  // AirPods аксессуары
  const airpodsAccessories = [
    ['Чехол AirPods 4', 'acc-case-airpods4', 'AirPods 4', 'Защитный силиконовый чехол для кейса AirPods 4.'],
    ['Чехол AirPods Pro 2', 'acc-case-airpods-pro2', 'AirPods Pro 2', 'Защитный силиконовый чехол для кейса AirPods Pro 2.'],
  ]
  for (const [accName, priceKey, model, desc] of airpodsAccessories as any[]) {
    await createProduct({
      name: accName, brand: 'Apple', categoryId: ACCESSORIES.id,
      description: desc, specs: {},
      variants: [{ skuParts: [accName.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: { Модель: model } }]
    })
  }

  // Общие аксессуары AirPods
  await createProduct({ name: 'Зарядный кабель AirPods Original', brand: 'Apple', categoryId: ACCESSORIES.id, description: 'Оригинальный кабель USB-C для зарядки AirPods.', specs: {}, variants: [{ skuParts: ['AIRPODS-CABLE-ORIGINAL'], price: price('acc-cable-original'), attributes: {} }] })
  await createProduct({ name: 'Зарядный блок AirPods Original', brand: 'Apple', categoryId: ACCESSORIES.id, description: 'Оригинальный зарядный блок Apple 20W для AirPods.', specs: {}, variants: [{ skuParts: ['AIRPODS-CHARGER-BLOCK'], price: price('acc-charger-block'), attributes: {} }] })
  await createProduct({ name: 'Зарядная станция 3 в 1 AirPods', brand: 'Apple', categoryId: ACCESSORIES.id, description: 'Зарядная станция 3 в 1 для AirPods, iPhone и Apple Watch.', specs: {}, variants: [{ skuParts: ['AIRPODS-DOCK-3IN1'], price: price('acc-dock-3in1'), attributes: {} }] })

  // iPad аксессуары
  const ipadAccessories = [
    ['Magic Keyboard iPad', 'acc-magic-keyboard', 'Magic Keyboard для iPad с трекпадом и подсветкой клавиш.'],
    ['Apple Pencil 2', 'acc-pencil2', 'Apple Pencil 2-го поколения с магнитной зарядкой и двойным касанием.'],
    ['Apple Pencil USB-C', 'acc-pencil-usbc', 'Apple Pencil USB-C — доступный стилус с USB-C зарядкой.'],
    ['Apple Pencil Pro', 'acc-pencil-pro', 'Apple Pencil Pro с вращением, сжатием и чувствительностью наклона.'],
    ['Чехол Folio iPad', 'acc-folio', 'Smart Folio чехол для iPad с поддержкой подставки и автосна.'],
    ['Чехол книжка iPad', 'acc-case-book', 'Чехол-книжка для iPad — удобная подставка и защита экрана.'],
    ['Зарядный блок iPad Original', 'acc-charger-block-ipad', 'Оригинальный зарядный блок Apple 20W/30W для iPad.'],
    ['Защитное стекло iPad', 'acc-glass-ipad', 'Защитное стекло на экран для iPad — матовое антибликовое.'],
  ]
  for (const [accName, priceKey, desc] of ipadAccessories as any[]) {
    const isUniversal = accName.includes('Pencil') || accName.includes('Зарядный')
    await createProduct({
      name: accName,
      brand: accName.includes('Pitaka') ? 'Pitaka' : 'Apple',
      categoryId: ACCESSORIES.id,
      description: desc,
      specs: {},
      variants: isUniversal
        ? [{ skuParts: [accName.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
        : ipadModels.map(m => ({
            skuParts: [accName.replace(/\s/g,'-').toUpperCase(), m.replace(/\s/g,'-').toUpperCase()],
            price: price(priceKey),
            attributes: { Модель: m }
          }))
    })
  }

  // MacBook аксессуары
  const macbookAccessories = [
    ['Magic Mouse', 'acc-magic-mouse', 'Apple Magic Mouse с Multi-Touch поверхностью и зарядкой Lightning.', true],
    ['Чехол-конверт MacBook', 'acc-sleeve', 'Неопреновый чехол-конверт для MacBook — защищает от царапин.', false],
    ['Сумка для MacBook', 'acc-bag', 'Переносная сумка для MacBook с несколькими отсеками.', false],
    ['Бампер MacBook', 'acc-bumper', 'Бампер на верхнюю и нижнюю крышки MacBook — защита без скрытия дизайна.', false],
    ['Переходник Apple Original', 'acc-adapter-original', 'Оригинальный переходник Apple USB-C Multiport Adapter.', true],
    ['Apple Adapter', 'acc-apple-adapter', 'Адаптер Apple USB-C to USB — для подключения устройств с USB-A.', true],
    ['Кабель MacBook 2m', 'acc-cable-2m', 'Кабель USB-C 2 метра для зарядки MacBook.', true],
    ['Переходник-вилка MacBook', 'acc-plug-adapter', 'Переходник вилки для зарядного устройства MacBook под европейский стандарт.', true],
  ]
  for (const [accName, priceKey, desc, isUniversal] of macbookAccessories as any[]) {
    await createProduct({
      name: accName, brand: 'Apple', categoryId: ACCESSORIES.id, description: desc, specs: {},
      variants: isUniversal
        ? [{ skuParts: [accName.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
        : macbookModels.map(m => ({
            skuParts: [accName.replace(/\s/g,'-').toUpperCase(), m.replace(/\s/g,'-').toUpperCase()],
            price: price(priceKey),
            attributes: { Модель: m }
          }))
    })
  }

  // Apple Watch аксессуары
  const watchAccessories = [
    ['Ремешок Apple Watch', 'acc-watch-band', 'Сменный ремешок для Apple Watch из фторэластомера. Совместим с актуальными моделями.'],
    ['Защитное стекло Apple Watch', 'acc-watch-glass', 'Защитное стекло на экран Apple Watch — ударостойкое, 2.5D скругление.'],
    ['Кабель зарядный Apple Watch', 'acc-watch-cable', 'Оригинальный магнитный зарядный кабель Apple Watch USB-C.'],
    ['Зарядный блок Apple Watch', 'acc-charger-block-watch', 'Оригинальный зарядный блок Apple 20W для Apple Watch.'],
    ['Зарядная станция 3 в 1 Watch', 'acc-dock-3in1-watch', 'Зарядная станция 3 в 1 для Apple Watch, iPhone и AirPods.'],
  ]
  for (const [accName, priceKey, desc] of watchAccessories as any[]) {
    const isUniversal = !accName.includes('Ремешок') && !accName.includes('стекло')
    await createProduct({
      name: accName, brand: 'Apple', categoryId: ACCESSORIES.id, description: desc, specs: {},
      variants: isUniversal
        ? [{ skuParts: [accName.replace(/\s/g,'-').toUpperCase()], price: price(priceKey), attributes: {} }]
        : watchModels2.map(m => ({
            skuParts: [accName.replace(/\s/g,'-').toUpperCase(), m.replace(/\s/g,'-').toUpperCase()],
            price: price(priceKey),
            attributes: { Модель: m }
          }))
    })
  }

  console.log('✅ Аксессуары готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // УСЛУГИ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🛠️ Услуги...')

  await createProduct({
    name: 'Гравировка', brand: 'Bender Shop', categoryId: SERVICES.id,
    description: 'Лазерная гравировка на технике Apple. Имя, дата, надпись — персонализируйте своё устройство.',
    specs: { Материал: 'MacBook, iPad, AirPods', Срок: 'от 1 дня', Гарантия: 'Не влияет на гарантию Apple' },
    variants: [{ skuParts: ['SERVICE-ENGRAVING'], price: price('service-engraving'), attributes: {} }]
  })

  await createProduct({
    name: 'Подарочная упаковка', brand: 'Bender Shop', categoryId: SERVICES.id,
    description: 'Красивая подарочная упаковка с лентой и открыткой. Сделайте ваш подарок особенным.',
    specs: { Включает: 'Коробка, лента, открытка', Размеры: 'Подбирается под устройство' },
    variants: [{ skuParts: ['SERVICE-GIFT-WRAP'], price: price('service-gift-wrap'), attributes: {} }]
  })

  console.log('✅ Услуги готовы\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // ИТОГ
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════')
  console.log(`✅ Готово!`)
  console.log(`📦 Товаров: ${productCount}`)
  console.log(`🔖 Вариантов: ${variantCount}`)
  console.log('═══════════════════════════════════')
}

main()
  .catch(e => { console.error('❌ Ошибка:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
