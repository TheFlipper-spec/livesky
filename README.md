<div align="center">

# LiveSky · Weather Pro 🌤

**Версия: 1.3**

[![Live Site](https://img.shields.io/badge/🌤%20Открыть%20сайт-LiveSky-38bdf8?style=for-the-badge&labelColor=0b1120)](https://theflipper-spec.github.io/livesky/)
[![Android Release](https://img.shields.io/badge/Android-Release%20APK-3ddc84?style=for-the-badge&logo=android&logoColor=white&labelColor=0b1120)](https://github.com/TheFlipper-spec/livesky/releases)

[![Release](https://img.shields.io/github/v/release/TheFlipper-spec/livesky?include_prereleases&style=flat-square&color=818cf8)](https://github.com/TheFlipper-spec/livesky/releases)
[![Issues](https://img.shields.io/github/issues/TheFlipper-spec/livesky?style=flat-square&color=f87171)](https://github.com/TheFlipper-spec/livesky/issues)
[![License](https://img.shields.io/badge/license-MIT-818cf8?style=flat-square)](LICENSE)

</div>

LiveSky — погодное приложение для браузера и Android. Без серверной части, без сторонних SDK, без слежки. Всё что нужно — открыть сайт или установить APK.

Данные: [Open-Meteo](https://open-meteo.com/) · Карты: [MapLibre GL](https://maplibre.org/) · Радар: [RainViewer](https://www.rainviewer.com/)

---

## Что умеет

**Погода**
- Текущие условия: температура, ощущается, ветер с порывами, влажность, давление, видимость, точка росы, УФ-индекс
- Минутный nowcast через `minutely_15` Open-Meteo — статус вида «дождь закончится через 23 мин · в 15:47»
- График 24 часа — можно тянуть пальцем или мышью, время идёт по минутам
- Почасовой и 16-дневный прогноз, история 16 дней
- Автоматический выбор модели прогноза: ECMWF для Европы, GFS для Северной Америки

**Радар осадков**
- Карта на MapLibre GL с подложкой OpenFreeMap и фолбэком на OSM
- Радар RainViewer: ~2 часа прошлого + ~1 час nowcast, dual-layer без мерцания
- Управление: play/pause, скорость 0.5–3×, плотность цвета, Live-режим

**Качество воздуха**
- PM2.5 простым языком: «Мелкая пыль / Норма», лучший и худший час суток
- Полоска AQI на 24 часа вместо µg/m³-жаргона

**Уведомления и алерты**
- Баннер опасной погоды с минутной привязкой: гроза, град, ливень, снегопад, метель, гололёд, сильный ветер, жара, мороз, туман, высокий УФ
- Web Push готов к подключению

**Интерфейс**
- Живой фон под текущую погоду: дождь, снег, звёзды с метеорами, молнии
- 3 темы: адаптивная (под погоду) / тёмная / светлая
- 3 языка: RU / EN / ES
- Метрические и имперские единицы
- Поиск, избранное, недавние города, геолокация
- Панель настроек: сгруппированные разделы, превью тем, переключатель
  уведомлений; на телефонах открывается как bottom-sheet со свайпом вниз

**Производительность**
- MapLibre GL (~800 КБ) грузится только при первом открытии карты
- На мощных устройствах карта тихо догружается в фоне заранее
- Smart Visibility: секции рендерятся по мере скролла, далёкие выгружаются из DOM
- Eco-режим: отключает canvas-эффекты и снижает blur на слабых устройствах

**PWA и офлайн**
- Service Worker кешируент оболочку и последний прогноз
- Работает без интернета — показывает закешированные данные
- Устанавливается на экран на Android, iOS, десктоп
- После принятия пользовательского соглашения один раз предлагает установить
  приложение: кнопка «Установить» в Chromium или подсказка
  «Поделиться → На экран „Домой“» в iOS Safari. Приглашение само уходит,
  запоминает отказ и не показывается, если LiveSky уже установлен

---

## Насколько точен радар?

Карта осадков — это реальные радарные снимки от RainViewer (мозаика наземных метеорадаров + спутник), не генерация ИИ.

| | |
|---|---|
| **Прошлое (~2ч)** | Хорошо. Радар показывает где фактически шёл дождь |
| **Nowcast (~1ч)** | Экстраполяция движения фронта. Хорошо на равнинах, хуже в горах |
| **Ограничения** | Нет данных над океаном и в регионах с редкой радарной сетью |

Для вопроса «брать ли зонт прямо сейчас» — радар + минутный статус отличная связка. Для «будет ли дождь завтра в 18:00» — смотрите почасовой прогноз (ECMWF/GFS), а не радар.

---

## Запуск локально

Проект полностью статический, никакого сборщика не нужно.

```bash
# Просто откройте index.html, или запустите HTTP-сервер для PWA/Service Worker:
python3 -m http.server 8000 --directory docs
# → http://localhost:8000
```

### Сборка Android APK

Нужны: Node.js 22+, JDK 21+, Android SDK 36.

```bash
npm ci
npm run cap:sync       # копирует docs/ в android/app/src/main/assets/
npm run android:build  # debug APK → android/app/build/outputs/apk/debug/
npm run android:open   # открыть в Android Studio
```

Для release-сборки настройте keystore через переменные окружения или `android/key.properties` (файл исключён из git). Шаблон workflow для ручного запуска — `.github/workflows/android-release-manual.yml.template`.

Иконки и splash-экраны пересоздаются командой `./scripts/generate-android-assets.sh` (нужен ImageMagick).

### Тесты

```bash
npm test   # smoke-тест: рендер, Capacitor, график, алерты, AQI, темы, отказы сети
```

---

## Структура проекта

```
docs/                        # публикуемый сайт (GitHub Pages)
├── index.html
├── css/app.css              # дизайн-система
├── js/
│   ├── i18n.js              # переводы RU/EN/ES + коды WMO
│   ├── app.js               # compatibility-loader
│   └── modules/
│       ├── 01-core.js       # DOM, состояние, хранилище, helpers
│       ├── 02-weather-data.js
│       ├── 03-rendering.js
│       ├── 04-chart.js
│       ├── 05-hourly-alerts.js
│       ├── 06-air.js
│       ├── 07-effects.js    # темы, фоны, canvas FX
│       ├── 08-search-modals.js
│       ├── 09-lifecycle.js  # Smart Visibility
│       ├── 10-bootstrap.js  # инициализация + ленивая карта
│       └── 11-map-radar.js  # карта и радар (ленивый модуль)
├── assets/
│   ├── fonts/               # Montserrat, Unbounded (SIL OFL)
│   ├── vendor/              # MapLibre GL (BSD-2), Phosphor Icons (MIT)
│   └── flags/               # SVG-флаги (flag-icons, MIT)
├── legal/
│   ├── privacy.html
│   └── terms.html
├── manifest.webmanifest
└── sw.js
android/                     # нативный проект Capacitor
capacitor.config.json
scripts/
└── generate-android-assets.sh
tests/
└── smoke.js
```

---

## Стек

| | |
|---|---|
| Фронтенд | Vanilla JS, CSS custom properties, Canvas |
| Android | Capacitor 8, Gradle |
| Погода | [Open-Meteo](https://open-meteo.com/) |
| Радар | [RainViewer](https://www.rainviewer.com/) |
| Карты | [MapLibre GL](https://maplibre.org/) + OpenFreeMap / OSM |
| Иконки | [Phosphor Icons](https://phosphoricons.com/) (MIT, self-hosted) |
| Шрифты | Unbounded, Montserrat (SIL OFL, self-hosted) |
| Флаги | [flag-icons](https://github.com/lipis/flag-icons) (MIT, self-hosted) |

Никаких CDN, никакого трекинга, никаких платных API.

---

## Приватность

До принятия пользовательского соглашения ни один запрос к внешним серверам не уходит. Шрифты, иконки и MapLibre хостятся локально. Тайлы карты подгружаются только после согласия.

Подробности: [docs/legal/privacy.html](docs/legal/privacy.html) или [PRIVACY.md](PRIVACY.md).

---

## Баги и предложения

[Открыть Issue на GitHub](https://github.com/TheFlipper-spec/livesky/issues). При ошибке в приложении появляется кнопка «Сообщить об ошибке» прямо в интерфейсе.

---

MIT © TheFlipper-spec
