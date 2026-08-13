<div align="center">
  <img src="docs/github/hero.svg" width="100%" alt="JURO — AI-powered LegalTech platform for Uzbekistan">
</div>

<div align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="README.uz.md">O‘zbekcha</a>
</div>

<div align="center">
  <a href="https://juro.uz">Сайт</a> ·
  <a href="https://app.juro.uz">Открыть платформу</a> ·
  <a href="#как-читать-репозиторий">Как читать репозиторий</a> ·
  <a href="#обзор-продукта">Обзор продукта</a> ·
  <a href="#продуктовый-контракт">Продуктовый контракт</a> ·
  <a href="#архитектура">Архитектура</a> ·
  <a href="#быстрый-старт">Быстрый старт</a>
</div>

<br>

<div align="center">
  <img src="docs/github/stack-badges.svg" width="100%" alt="TypeScript, React, Next.js, Cloudflare Workers, D1, R2, OpenAI, Node.js 22 and CI">
</div>

JURO — LegalTech-пространство для Узбекистана, которое связывает юридические вопросы, работу с документами и следующие действия в единый контекст. Продукт предназначен для людей и команд, которым нужны практическая правовая информация, более структурированные документы и, когда это уместно, путь к помощи живого юриста.

Публичный сайт доступен на [juro.uz](https://juro.uz), защищённая продуктовая платформа — на [app.juro.uz](https://app.juro.uz). В репозитории находятся исходный код обоих приложений, конфигурация Cloudflare, документация и проверки качества.

## Как читать репозиторий

| Если вы оцениваете… | Начните здесь | Затем посмотрите |
|---|---|---|
| Продуктовый опыт | [Обзор продукта](#обзор-продукта) и [операционную модель](#операционная-модель-продукта) | [Текущий статус](#текущий-статус) и [границы доверия](#доверие-приватность-и-юридическая-безопасность) |
| Подход к legal AI | [Как работает JURO](#как-работает-juro) и [продуктовый контракт](#продуктовый-контракт) | [Product foundations](docs/github/PRODUCT_FOUNDATIONS.md) и модули работы с источниками |
| Техническую архитектуру | [Архитектура](#архитектура) | Cloudflare-конфигурацию, [развёртывание](#развёртывание) и quality-команды |
| Безопасный вклад | [Структура репозитория](#структура-репозитория) и [быстрый старт](#быстрый-старт) | [Contributing](#contributing), [security](#security) и PR template |

## Что такое JURO?

Поиск и понимание правовой информации могут быть сложными, а традиционные юридические услуги — дорогими и разрозненными. JURO уменьшает это трение: начать с вопроса или документа, сохранять видимыми источник и контекст, затем перейти к черновику, плану или передаче человеку там, где это поддерживается продуктом.

Продукт ориентирован на Узбекистан. В текущем публичном интерфейсе доступны русская и узбекская поверхности; документация репозитория поддерживается также на английском для международной технической аудитории. JURO не представляет AI-результат как индивидуальную юридическую консультацию или замену юриста.

## В двух словах

| Область | Факт, подтверждённый репозиторием | Чего это **не** означает |
|---|---|---|
| Контур продукта | В одном направлении платформы связаны юридические вопросы, документы, дела/планы действий и контролируемая передача юристу. | Не каждый workflow обязательно доступен каждому аккаунту или deployment. |
| Delivery | В монорепозитории есть публичный сайт, защищённая платформа и отдельное административное приложение. | Административные и hand-off поверхности не представлены как полностью завершённые сервисы. |
| Юридические источники | Source-aware путь получает query-scoped публичные страницы Lex.uz и Advice.uz и сохраняет citation context. | Не заявляется официальный API провайдера или полный корпус законодательства. |
| Runtime | В репозитории используются TypeScript, React, Next.js, Vite/Vinext и Cloudflare Worker tooling. | Выбор технологии не является заявлением о юридической правильности. |
| Границы данных | Возможности платформы используют Cloudflare D1, private R2 и server-side AI configuration. | Здесь не заявляются сертификации, compliance-статус или data residency. |
| Проверки качества | Root scripts и CI покрывают linting, type checks, tests, builds и artifact validation. | Успешная проверка не является гарантией production release или юридического качества. |

## Обзор продукта

| Публичная точка входа | Защищённое рабочее пространство |
|---|---|
| <img src="docs/github/screenshots/public-website.webp" alt="Публичный сайт JURO" width="100%"> | <img src="docs/github/screenshots/platform-dashboard.webp" alt="Панель JURO без данных аккаунта" width="100%"> |
| Начните с ситуации, документа или следующего шага на публичном сайте. | Связывайте вопрос, источник, документ и действие в защищённом пространстве. |

| Начальное состояние AI-чата | Конструктор документов |
|---|---|
| <img src="docs/github/screenshots/ai-chat.webp" alt="Начальное состояние AI-чата JURO без истории" width="100%"> | <img src="docs/github/screenshots/document-builder.webp" alt="Библиотека и конструктор документов JURO" width="100%"> |
| Интерфейс просит описать ситуацию и честно показывает доступность источника. | Просматривайте документные сценарии и начинайте структурированный черновик. |

| Проверка и сравнение документов | Узкий публичный preview |
|---|---|
| <img src="docs/github/screenshots/document-analysis.webp" alt="Экран проверки и сравнения документов JURO" width="100%"> | <img src="docs/github/screenshots/mobile-experience.webp" alt="Узкий preview публичного продукта JURO" width="100%"> |
| UI проверки и сравнения существует; ниже его сквозной статус честно обозначен как PARTIAL. | Узкий presentation-crop живого сайта; замените его проверенным mobile-capture перед использованием как mobile QA evidence. |

## Что могут делать пользователи

| Возможность | Пользовательская ценность | Статус |
|---|---|---|
| Задать юридический вопрос | Начать структурированный поток правовой информации с видимыми источниками. | WORKING |
| Создать документ | Подготовить черновик и сгенерировать поддерживаемые файлы. | WORKING |
| Проверить или сравнить документ | Проверить документ и сравнить версии; новые сквозные evidence анализа пока неполные. | PARTIAL |
| Построить план действий | Связать действия, сроки, документы и правовой контекст с делом. | WORKING |
| Запросить помощь юриста | Использовать контролируемые профили и hand-off там, где он доступен. | PARTIAL |
| Использовать production-платежи | В репозитории нет заявления о действующем платежном сервисе. | PLANNED |

## Операционная модель продукта

<img src="docs/github/operating-model.svg" width="100%" alt="Операционная модель JURO: от правового контекста к source-aware ответу, защищённой работе и частичной передаче юристу">

JURO организован вокруг связанной последовательности, а не изолированного экрана чата. Пользователь может начать с вопроса или документа, изучить source-aware информацию, продолжить в защищённом рабочем пространстве и, если текущий workflow это поддерживает, запросить помощь человека.

| Переход | Текущий статус | Как это представлено |
|---|---|---|
| Публичная legal-intelligence точка входа → защищённая платформа | LIVE | Публичный сайт и вход в платформу развёрнуты на отдельных публичных доменах. |
| Вопрос → структурированный ответ с работой с источниками | WORKING | Source-aware response и citation surfaces реализованы в platform routes. |
| Ответ → документ, дело или план действий | WORKING | Document, case и task workflows реализованы в защищённой платформе. |
| Сложный вопрос → помощь юриста | PARTIAL | Есть код controlled profiles и hand-off lifecycle; это не представляется как гарантия представительства. |

Сплошные пути на схеме обозначают реализованные или рабочие поверхности. Пунктирный путь hand-off намеренно остаётся PARTIAL. Схема — продуктовая модель, а не заявление, что все переходы доступны в каждом окружении или состоянии аккаунта.

## Как работает JURO

<img src="docs/github/ai-answer-flow.svg" width="100%" alt="Поток source-aware юридического ответа JURO">

Реализованный source-aware путь JURO классифицирует запрос, ищет релевантные публичные юридические страницы, собирает ограниченный контекст и при наличии доказательств показывает структурированный ответ с карточками источников. Источниковый слой — query-scoped прямое получение со страниц Lex.uz и Advice.uz, а не заявление о наличии официального API провайдера.

- Источник должен быть виден пользователю; система не должна выдумывать ссылку.
- Если доступные доказательства не подтверждают вывод, продукт должен сообщить об ограничении.
- AI-результат — правовая информация и поддержка рабочего процесса, а не индивидуальная юридическая консультация.
- Передача юристу — частичный продуктовый поток, а не гарантия представительства или завершённой консультации.

## Продуктовый контракт

<img src="docs/github/engineering-commitments.svg" width="100%" alt="Продуктовый контракт JURO: от правового контекста и источника к защищённой работе и частичной передаче человеку">

Сам по себе аккуратный интерфейс юридического AI недостаточен. JURO показывает следующие границы как продуктовые обязательства, которые можно проверить в репозитории, а не как маркетинговые обещания:

| Продуктовое обязательство | Доказательство в реализации | Видимая граница |
|---|---|---|
| Сохранять источник рядом с ответом, который его использовал. | [`direct-citation-store.ts`](apps/platform/lib/legal/direct-citation-store.ts) связывает прямые citations с AI-run. | Публичная страница источника не становится автоматически подтверждённым выводом. |
| Сохранять канонический контекст при получении юридических страниц. | [`direct-retrieval.ts`](apps/platform/lib/legal/direct-retrieval.ts) содержит путь прямого получения источников и eligibility для citation. | Это query-scoped получение публичных страниц, а не заявление об официальном API провайдера. |
| Требовать ссылки для части результатов проверки документа. | [`document-analysis/schema.ts`](apps/platform/lib/document-analysis/schema.ts) отклоняет legal findings, risks и missing clauses без citations. | Поверхность review остаётся PARTIAL, пока не завершены свежие authenticated end-to-end evidence. |
| Держать сохранённую юридическую работу за границами платформы. | Защищённые handlers, D1, private R2 и document-storage runtime находятся в [`apps/platform`](apps/platform). | Здесь не заявляется сертификация или compliance-статус. |

Развёрнутый инженерный разбор, доказательства в репозитории и карту для review см. в [product foundations](docs/github/PRODUCT_FOUNDATIONS.md) (английский).

## Экосистема продукта

<img src="docs/github/product-overview.svg" width="100%" alt="Текущая, частичная и планируемая экосистема JURO">

Схема отделяет ядро текущего продукта от частичных потоков и планируемых платежей. Сплошные связи обозначают реализованные или рабочие поверхности репозитория, пунктирные — PARTIAL или PLANNED.

## Архитектура

<img src="docs/github/platform-architecture.svg" width="100%" alt="Архитектура приложений и Cloudflare JURO">

JURO — монорепозиторий с независимо развёртываемыми публичным и защищённым приложениями:

- apps/website обеспечивает публичный сайт через React, Next.js, Vite/Vinext и Cloudflare Worker tooling.
- apps/platform содержит защищённые route handlers, document workflows, authorization boundaries и generated-file flows.
- apps/admin — отдельная Worker-based административная поверхность со статусом PARTIAL.
- Cloudflare D1 и private R2 поддерживают сохраняемые данные и файлы платформы; интеграция OpenAI выполняется на сервере.
- Платформа поддерживает генерацию DOCX, PDF и ZIP. При включении email/OTP настраивается server-side provider settings.

## Доверие, приватность и юридическая безопасность

<img src="docs/github/trust-layer.svg" width="100%" alt="Принципы доверия, приватности и юридической безопасности JURO">

Границы в репозитории определены намеренно: credentials остаются на сервере, доступ к D1/R2 идёт через backend routes, защищённые потоки проверяют ownership или workspace. Здесь не заявляются GDPR, ISO, SOC 2 и другие сертификации. Для ответственного раскрытия уязвимостей см. [SECURITY.md](SECURITY.md).

## Текущий статус

| Область | Статус | Примечание |
|---|---|---|
| Публичный сайт | LIVE | [juro.uz](https://juro.uz) был доступен во время аудита документации. |
| Вход в защищённую платформу | LIVE | [app.juro.uz](https://app.juro.uz) доступен и обслуживает защищённые маршруты. |
| AI legal chat | WORKING | Source-aware response и citation surfaces реализованы; более широкая legal evaluation — отдельный release gate. |
| Конструктор документов | WORKING | Реализованы persisted workflows, private storage и generated-file paths. |
| Анализ и сравнение документов | PARTIAL | Поверхности review/compare есть, но свежие authenticated end-to-end evidence анализа не завершены. |
| Дела и планы действий | WORKING | Реализованы workflows для cases, tasks и action plans. |
| Маркетплейс юристов и консультации | PARTIAL | Цикл controlled profiles, directory и hand-off не завершён. |
| Администрирование | PARTIAL | Есть отдельный admin Worker и защищённые administrative flows. |
| Production-платежи | PLANNED | Demo/payment-foundation code не представлен как действующий платёжный сервис. |

## Структура репозитория

    juro/
    ├── apps/
    │   ├── website/       # juro.uz
    │   ├── platform/      # app.juro.uz и юридические workflows
    │   └── admin/         # отдельный administrative Worker
    ├── docs/
    ├── .github/
    ├── .env.example
    ├── SECURITY.md
    ├── package.json
    └── README.md

## Быстрый старт

### Требования

- Node.js 22.13 или новее.
- npm, совместимый с committed lockfiles.
- Bash и документированные POSIX tools для legacy lifecycle apps/website; apps/platform использует shell-neutral Node launchers.
- Cloudflare-compatible bindings для persisted platform features.

Клонирование и установка:

    git clone https://github.com/MoozUpus/juro.git
    cd juro
    npm run install:all

Локальный запуск:

    npm run dev:website
    npm run dev:platform
    npm run dev:admin

Скопируйте .env.example в локальный ignored environment file. Никогда не коммитьте .env, API keys, access tokens, database exports, user documents или logs.

<details>
<summary>Переменные окружения и Cloudflare bindings</summary>

| Имя | Обязательно | Scope | Назначение |
|---|---:|---|---|
| OPENAI_API_KEY | Только для live AI | Server | OpenAI Responses API authentication |
| OPENAI_MODEL | Нет | Server | Optional model override |
| RESEND_API_KEY | Для email OTP | Server | Email-provider authentication |
| EMAIL_FROM | Для email OTP | Server | Verified sender address |
| JURO_SMOKE_BASE_URL | Нет | Test process | Document-builder smoke-test base URL |
| CLOUDFLARE_REMOTE_BINDINGS | Нет | Local development | Opt in to remote bindings; нужен Wrangler login |
| DB | Persisted features | Worker binding | Cloudflare D1 |
| BUCKET | File workflows | Worker binding | Private Cloudflare R2 |
| ASSETS / IMAGES | Hosting managed | Worker binding | Static assets и image optimization |

DB, BUCKET, ASSETS и IMAGES — platform bindings, а не secrets для environment file. AI и email keys — только server-side configuration и не должны становиться public browser variables.

</details>

## Качество и тестирование

В корне репозитория:

    npm run lint
    npm run type-check
    npm test
    npm run build
    npm run validate:artifact

CI определён в [.github/workflows/ci.yml](.github/workflows/ci.yml) и запускает locked installs, linting, TypeScript checks, tests, artifact validation и platform Cloudflare environment matrix. Для matrix и dry-run платформы:

    npm --prefix apps/platform run validate:cloudflare:matrix

## Развёртывание

Развёртывания website и platform намеренно независимы. Для платформы нужны D1 migrations, private R2 bindings, server-side secrets и явные permission checks; оба target должны быть проверены на preview до production approval.

См. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) для release sequence, rollback expectations, DNS safeguards и backup requirements. [docs/MIGRATION.md](docs/MIGRATION.md) сохраняет source-migration и alternative-hosting audit.

## Roadmap

| Now | Next | Later |
|---|---|---|
| Поддерживать source-aware ответы, document workflows, permissions и release evidence. | Завершить authenticated verification document analysis и lawyer hand-off. | Рассматривать production payments и broader integrations только после утверждения product, security и operational gates. |

## Безопасность

Сообщайте об уязвимостях приватно, как описано в [SECURITY.md](SECURITY.md). Не включайте secrets, personal data, user documents или production logs в issues и pull requests. Если credential раскрыт, его нужно ротировать: удаления из позднего revision недостаточно.

## Участие

JURO — product-managed repository. Приветствуются сфокусированные и безопасные contributions; см. [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) и используйте issue/PR templates. Pull Request не даёт разрешения на production deploy, DNS change или доступ к production data.

## Лицензия

Файл лицензии сейчас отсутствует. Этот репозиторий не предоставляет права на повторное использование; свяжитесь с владельцем до использования кода или assets.

---

Происхождение и правила обновления presentation assets: [docs/github/README_ASSETS.md](docs/github/README_ASSETS.md).
