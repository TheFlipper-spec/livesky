<div align="center">

# LiveSky · Weather Pro 🌤

**Премиальное погодное веб-приложение** — живые анимированные фоны, радар осадков,
графики, качество воздуха, PWA-офлайн и умные уведомления о погоде.

[![Live Site](https://img.shields.io/badge/🌤%20Открыть%20сайт-theflipper--spec.github.io%2Flivesky-38bdf8?style=for-the-badge&labelColor=0b1120)](https://theflipper-spec.github.io/livesky/)
[![Issues](https://img.shields.io/github/issues/TheFlipper-spec/livesky?style=flat-square&color=f87171)](https://github.com/TheFlipper-spec/livesky/issues)
[![License](https://img.shields.io/badge/license-MIT-818cf8?style=flat-square)](LICENSE)

100% на фронтенде · данные [Open-Meteo](https://open-meteo.com/) · карты [MapLibre GL](https://maplibre.org/) · радар [RainViewer](https://www.rainviewer.com/)

</div>

---

## ✨ Возможности

### 🌍 Погода и данные
- **Живой фон** — градиенты и canvas-эффекты под текущую погоду: дождь, снег, туман,
  облака, звёзды с падающими метеорами, молнии при грозе
- **Текущая погода** + 8 метрик: ощущается, ветер с порывами, влажность, видимость,
  давление с трендом, точка росы, УФ-индекс, осадки
- **График температуры на 24 часа** с осадками и интерактивной панелью деталей
- **Почасовой прогноз** на 24 часа и **16-дневный прогноз + история за 16 дней**
- **Качество воздуха**: европейский индекс AQI, тренд на 24 часа, спарклайны загрязнителей,
  рекомендации по здоровью
- **Солнечная дуга** — восход/закат, долгота дня, фаза луны, «золотой час»
- **LifeSky-активности** — лучшие слоты для бега, мойки авто и прогулок

### 🗺️ Карта и радар
- Карта на **MapLibre GL** с надёжными тайлами (CARTO + фолбэк OSM), выбор точки кликом
- **Радар осадков (RainViewer)** поверх полноэкранной карты: таймлайн, слайдер по кадрам
  прошлого + nowcast, play/pause, легенда интенсивности

### 📲 PWA, офлайн и уведомления
- **PWA + офлайн**: service worker кеширует оболочку и последний прогноз — работает без сети
- **Установка на экран**: манифест, иконки, `beforeinstallprompt`, iOS-мета
- **Погодные уведомления** — локальные алерты по прогнозу (гроза, дождь, жара/холод,
  ветер, туман) + готовый к Web Push service worker
- **Адаптивная производительность** — детектор FPS автоматически отключает тяжёлые
  эффекты на слабых устройствах (режимы «Авто / Максимум / Эконом»)

### 🎨 Удобство
- **3 языка** (RU / EN / ES) · **3 темы** (адаптивная / тёмная / светлая)
- Метрические/имперские единицы · выбор модели данных (Auto / ECMWF / GFS / ICON)
- Поиск с автодополнением, избранное, недавние города, геолокация
- Автообновление каждые 15 минут · доступность с клавиатуры · `prefers-reduced-motion`

---

## 🧭 Живой пример

**Откройте сайт:** [https://theflipper-spec.github.io/livesky/](https://theflipper-spec.github.io/livesky/)

## 🚀 Запуск локально

Проект полностью статический — достаточно открыть `docs/index.html`. Для работы
PWA/service worker и карт удобнее HTTP-сервер:

```bash
python3 -m http.server 8000 --directory docs
# → http://localhost:8000
```

### Установка как приложения (PWA)

- **Android / Chrome / Edge / Desktop** — значок «Установить» в адресной строке
  или кнопка «Установить приложение» в меню LiveSky
- **iOS Safari** — «Поделиться» → «На экран “Домой”»
- Офлайн показывается последний загруженный прогноз

### Android APK (Capacitor)

В репозитории есть нативный Android-проект на **Capacitor 8** с постоянным Application ID
`io.github.theflipperspec.livesky`. Минимальная версия — Android 7.0 (API 24), целевая — API 36.
В Android-обёртке подключены системная геолокация, локальные погодные уведомления и
корректная обработка кнопки «Назад».

Требования для локальной сборки: Node.js 22+, JDK 17+ и Android SDK 36.

```bash
npm ci
npm run cap:sync       # скопировать docs/ и обновить нативные плагины
npm run android:build  # debug APK
npm run android:open   # открыть проект в Android Studio
```

Debug APK появится в `android/app/build/outputs/apk/debug/app-debug.apk`.
Для Google Play используйте `npm run android:bundle` и настройте release-подпись через
локальный keystore — файлы `*.jks`, `*.keystore` и `android/key.properties` исключены из Git.
Иконки и splash-экраны можно повторно создать командой
`./scripts/generate-android-assets.sh` (нужен ImageMagick).

---

## 📂 Структура проекта

```
docs/                        # публикуемый сайт (GitHub Pages)
├── index.html               # разметка
├── css/app.css              # дизайн-система (токены, стекло, анимации, адаптив)
├── js/
│   ├── i18n.js              # словари RU/EN/ES + коды погоды WMO
│   └── app.js               # логика приложения (PWA, FPS, радар, уведомления)
├── manifest.webmanifest     # PWA-манифест
├── sw.js                    # service worker (кеш оболочки + прогноз + push)
└── icons/                   # иконки приложения (16…512 px)
android/                     # нативный проект Capacitor / Gradle
capacitor.config.json        # ID, webDir и настройки Android WebView
scripts/
└── generate-android-assets.sh # генерация Android-иконок и splash-экранов
tests/
└── smoke.js                 # smoke-тест (jsdom + данные Open-Meteo)
```

## 🧪 Тестирование

```bash
npm install
npm test        # 103 проверки: веб-рендеринг, Capacitor, свайп, модалки, темы и отказы
```

Включая сценарии отказов: зависшая сеть (watchdog скрывает загрузчик), отсутствующие
элементы страницы, пропавший скрипт локализации — вместо вечного лоадера панель ошибки.

## 🛡️ Надёжность

- Все `fetch` с таймаутами (AbortController) — ни один запрос не зависает
- Watchdog загрузчика — экран загрузки не может остаться навсегда
- Аварийная панель с кнопками **«Перезагрузить»** и **«Сообщить об ошибке»**
- Автодоклад о багах: при ошибке сети/сбое появляется кнопка-баг, ведущая на GitHub Issues
- Санитизация настроек из localStorage · защита от устаревшего кеша (версии ассетов)

## 🐛 Обратная связь и баги

Нашли ошибку или есть идея? Откройте [Issue на GitHub](https://github.com/TheFlipper-spec/livesky/issues).
Приложение само подставляет кнопку «Сообщить об ошибке» в момент сбоя — с описанием
страницы и версии.

## 🧰 Стек

| Слой | Технологии |
|---|---|
| Фронтенд | Ванильный JS, CSS-токены, canvas |
| Android | Capacitor 8, Gradle, нативные плагины геолокации и уведомлений |
| Погода | [Open-Meteo](https://open-meteo.com/) (forecast, air-quality, geocoding) |
| Радар | [RainViewer](https://www.rainviewer.com/) Weather Maps |
| Карты | [MapLibre GL](https://maplibre.org/) + OpenStreetMap / CartoDB |
| Иконки | [Phosphor Icons](https://phosphoricons.com/) |
| Шрифты | [Google Fonts](https://fonts.google.com/) (Unbounded, Montserrat) |

## 📄 Лицензия

MIT © TheFlipper-spec
