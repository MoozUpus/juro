<div align="center">
  <img src="docs/github/hero.svg" width="100%" alt="JURO — O‘zbekiston uchun AI yordamidagi LegalTech platformasi">
</div>

<div align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="README.uz.md">O‘zbekcha</a>
</div>

<div align="center">
  <a href="https://juro.uz">Jonli sayt</a> ·
  <a href="https://app.juro.uz">Platformani ochish</a> ·
  <a href="#qanday-ishlaydi">Qanday ishlaydi</a> ·
  <a href="#mahsulot-tajribasi">Mahsulot tajribasi</a> ·
  <a href="#arxitektura">Arxitektura</a> ·
  <a href="#tezkor-boshlash">Tezkor boshlash</a>
</div>

<br>

<div align="center">
  <img src="docs/github/stack-badges.svg" width="100%" alt="TypeScript, React, Next.js, Cloudflare Workers, Cloudflare D1, Cloudflare R2, OpenAI, Node.js 22 va CI">
</div>

<div align="center">

**Yuridik ma’lumot — aniq keyingi qadamlar uchun.**

Manbaga bog‘langan huquqiy ma’lumot · himoyalangan hujjat jarayonlari · ishlar va harakat rejalari · workflow imkon bersa, yuristga yo‘naltirish

</div>

JURO — O‘zbekiston uchun LegalTech ish maydoni. U inson yoki jamoaga yuridik savol va hujjatdan tushunarli, tekshirib borish mumkin bo‘lgan keyingi qadamga o‘tishga yordam beradi; AI javobini individual yuridik maslahat o‘rniga qo‘ymaydi.

Jonli ommaviy kirish nuqtasi [juro.uz](https://juro.uz) manzilida, himoyalangan mahsulot platformasi esa [app.juro.uz](https://app.juro.uz) manzilida. Ushbu repozitoriy ommaviy sayt, platforma, ma’muriy sirt, Cloudflare konfiguratsiyasi hamda release tekshiruvlari uchun mahsulot dosyesi va muhandislik qaydidir.

## Mahsulotga bir qarash

| Mahsulot yo‘nalishi | Repozitoriyda mavjud narsa | Holat chegarasi |
|---|---|---|
| Huquqiy ma’lumot | Aniq so‘rov doirasidagi ommaviy huquqiy sahifalar uchun source-aware javob yo‘li va citation yuzalari. | WORKING — bu rasmiy manba provayderi API’si yoki to‘liq korpus da’vosi emas. |
| Hujjatlar va ish | Draftlar, generated-file yo‘llari, ishlar, vazifalar va harakat-reja workflows. | WORKING — foydalanish himoyalangan account va deploy holatiga bog‘liq bo‘lishi mumkin. |
| Huquqiy ko‘rib chiqish | Citationga yo‘naltirilgan document review va comparison interfeyslari. | PARTIAL — yangi authenticated end-to-end tekshiruv zarur. |
| Inson yordami | Yurist profillari, katalog va hand-off lifecycle yuzalari. | PARTIAL — bu vakillik yoki yakunlangan konsultatsiya kafolati emas. |
| Yetkazib berish platformasi | Bitta monorepozitoriydagi ommaviy sayt, himoyalangan platforma va alohida admin ilova. | LIVE / WORKING / PARTIAL — quyidagi status matritsasida batafsil. |

> **Nima uchun bu taqdimot dalillarga tayanadi:** JURO repozitoriyda qayta tekshiriladigan manba bo‘lmasa, auditoriya, aniqlik, daromad, korpus hajmi yoki yuridik natijalar haqida metrikalarni e’lon qilmaydi. Yashil texnik tekshiruv ham yuridik sifat yoki production-release kafolati sifatida ko‘rsatilmaydi.

## Qanday ishlaydi

<img src="docs/github/ai-answer-flow.svg" width="100%" alt="JUROning savol yoki hujjatdan manbalar va ixtiyoriy yuristga yo‘naltirishgacha bo‘lgan source-aware oqimi">

Amalga oshirilgan huquqiy-ma’lumot yo‘li savol yoki hujjatdan boshlanadi, so‘rov turini aniqlaydi, tegishli ommaviy manba sahifalarini oladi, cheklangan kontekstni yig‘adi va dalil bo‘lganda manba kartalari bilan tartibli javobni ko‘rsatadi. Ommaviy manba qatlami Lex.uz hamda Advice.uz sahifalarini query-scoped olishdan iborat; JURO uchinchi tomon rasmiy API integratsiyasini da’vo qilmaydi.

Javobning chegarasi aniq bo‘lsagina u foydali bo‘ladi:

| JURO ko‘rinadigan qilmoqchi bo‘lgan narsa | Repozitoriy dalili | Mahsulot ataylab nimani va’da qilmaydi |
|---|---|---|
| Javob bilan bog‘langan manba | [`direct-citation-store.ts`](apps/platform/lib/legal/direct-citation-store.ts) bevosita citationsni AI run bilan saqlaydi. | Bir manba sahifasi javobni individual yuridik maslahatga aylantirmaydi. |
| Nazorat qilinadigan ommaviy manba olish yo‘li | [`direct-retrieval.ts`](apps/platform/lib/legal/direct-retrieval.ts) retrieval va citation eligibility mantiqini o‘z ichiga oladi. | Rasmiy provayderga kirish, to‘liq qamrov yoki xatosiz retrieval. |
| Hujjat review’ida citation chegaralari | [`document-analysis/schema.ts`](apps/platform/lib/document-analysis/schema.ts) ayrim legal findings, risks va missing clausesni citationssiz rad etadi. | Tugallangan end-to-end review da’vosi; bu sirt PARTIAL bo‘lib qoladi. |
| Inson tekshiruviga yo‘l | Yurist profili va hand-off kodi [`apps/platform`](apps/platform) ichida. | Avtomatik konsultatsiya, vakillik yoki natija. |

Muhandislik asoslari va kod xaritasini [Product foundations](docs/github/PRODUCT_FOUNDATIONS.md) hujjatida o‘qing.

## Mahsulot tajribasi

<img src="docs/github/product-experience.svg" width="100%" alt="JURO mahsulotining original illyustratsiyasi: huquqiy ma’lumot, hujjatlar bilan ish va qisman review sirtlari">

Bu mahsulot illyustratsiyasi, jonli interfeys haqidagi da’vo emas. Ommaviy kirish nuqtasi — [juro.uz](https://juro.uz); himoyalangan workflow’lar [app.juro.uz](https://app.juro.uz) orqali mavjud. Undagi statuslar repository matritsasiga asoslangan: huquqiy ma’lumot va hujjatlar bilan ish — WORKING, hujjat review’i va yuristga yo‘naltirish esa PARTIAL bo‘lib qoladi.

## Huquqiy kontekstdan amaliy ishga

JURO alohida chat oynasi emas, bog‘langan workflow sifatida shakllantirilgan. Foydalanuvchi kontekstdan boshlashi, manbalardagi mavjud dalillarni ko‘rishi, himoyalangan maydonda davom etishi va — joriy ssenariy bunga ruxsat bersa — inson yordamiga murojaat qilishi mumkin.

| O‘tish | Joriy holat | Ochiq ko‘rsatiladigan chegara |
|---|---|---|
| Ommaviy legal-intelligence kirish → himoyalangan platforma | LIVE | Ommaviy sayt va platforma alohida domenga deploy qilingan. |
| Savol → tartibli source-aware javob | WORKING | Javob asosini ko‘rsatishi yoki cheklovni aytishi lozim. |
| Javob → hujjat, ish yoki harakat rejasi | WORKING | Workflows himoyalangan platformada amalga oshirilgan; ayrim route ma’lum account uchun yoqilmagan bo‘lishi mumkin. |
| Murakkab masala → yuristga yo‘naltirish | PARTIAL | Workflow kodda bor, lekin kafolatli vakillik sifatida ko‘rsatilmaydi. |

## Mahsulot ekotizimi

<img src="docs/github/product-overview.svg" width="100%" alt="JUROning working, partial va planned komponentlardan iborat mahsulot ekotizimi">

Sxema joriy yadroni qisman hamda rejalashtirilgan yuzalardan ajratadi. Uzluksiz chiziqlar repozitoriydagi implemented yoki working yo‘llarni, punktir chiziqlar esa PARTIAL yoki PLANNED ishni bildiradi.

## Arxitektura

<img src="docs/github/platform-architecture.svg" width="100%" alt="JURO monorepozitoriyi va Cloudflare arxitekturasi">

JURO mustaqil deploy qilinadigan ommaviy va himoyalangan ilovalarga ega monorepozitoriydir:

- `apps/website` React, Next.js, Vite/Vinext va Cloudflare Worker tooling orqali ommaviy saytni ishga tushiradi.
- `apps/platform` himoyalangan route handlerlar, document workflows, authorization chegaralari va generated-file flowsni ta’minlaydi.
- `apps/admin` alohida Worker-based ma’muriy sirt bo‘lib, PARTIAL holatida qoladi.
- Cloudflare D1 va private R2 saqlanadigan platforma ma’lumotlari hamda fayllarini qo‘llab-quvvatlaydi; OpenAI konfiguratsiyasi serverda qoladi.
- Platforma DOCX, PDF va ZIP generatsiyasini qo‘llaydi. Yoqilganda email/OTP server-side provider settings orqali sozlanadi.

## Ishonch, maxfiylik va yuridik xavfsizlik

<img src="docs/github/trust-layer.svg" width="100%" alt="JURO ishonch, maxfiylik va yuridik xavfsizlik chegaralari">

Repozitoriyda bir nechta asosiy chegara tekshirilishi mumkin: server-side credentials, backend orqali D1/R2 kirishi, himoyalangan ownership yoki workspace checks, manbalarni ko‘rsatish va AI natijasidagi aniq cheklovlar. Bu yerda GDPR, ISO, SOC 2, data residency yoki boshqa sertifikatlar da’vo qilinmaydi.

Zaifliklar haqida [SECURITY.md](SECURITY.md) bo‘yicha yopiq tarzda xabar bering. Issue yoki pull requestga secrets, shaxsiy ma’lumotlar, foydalanuvchi hujjatlari yoki production logsni qo‘shmang.

## Joriy holat

| Soha | Holat | Izoh |
|---|---|---|
| Ommaviy veb-sayt | LIVE | [juro.uz](https://juro.uz) hujjatlashtirish auditi vaqtida ochildi. |
| Himoyalangan platformaga kirish | LIVE | [app.juro.uz](https://app.juro.uz) ochiladi va himoyalangan mahsulot route’larini xizmat qiladi. |
| AI huquqiy ma’lumot oqimi | WORKING | Source-aware javob va citation surfaces amalga oshirilgan; kengroq legal evaluation alohida release gate hisoblanadi. |
| Hujjat konstruktori | WORKING | Persisted document workflows, private storage va generated-file paths amalga oshirilgan. |
| Hujjat tahlili va taqqoslash | PARTIAL | Review va comparison yuzalari bor, ammo yangi authenticated end-to-end evidence yakunlanmagan. |
| Ishlar va harakat rejalari | WORKING | Case, task va action-plan workflows amalga oshirilgan. |
| Yuristlar katalogi va konsultatsiyalar | PARTIAL | Controlled profiles, katalog va hand-off lifecycle hali to‘liq emas. |
| Ma’muriyat | PARTIAL | Alohida admin Worker va himoyalangan administrative flows mavjud. |
| Production to‘lovlar | PLANNED | Repozitoriyda live payment provider da’vo qilinmaydi. |

## Repozitoriy xaritasi

    juro/
    ├── apps/
    │   ├── website/       # juro.uz ommaviy sayti
    │   ├── platform/      # app.juro.uz va yuridik workflows
    │   └── admin/         # alohida administrative Worker
    ├── docs/              # arxitektura, migrations va operations
    ├── .github/           # CI, contribution va issue templates
    ├── .env.example       # faqat konfiguratsiya nomlari, secrets yo‘q
    ├── SECURITY.md
    ├── package.json
    └── README.md

## Tezkor boshlash

### Talablar

- Node.js 22.13 yoki yangiroq.
- Committed lockfiles bilan mos npm.
- Legacy `apps/website` lifecycle uchun Bash va hujjatlashtirilgan POSIX tools; `apps/platform` shell-neutral Node launchersdan foydalanadi.
- Persisted platform imkoniyatlari uchun Cloudflare-compatible bindings.

Website va platformani klonlab o‘rnating:

    git clone https://github.com/MoozUpus/juro.git
    cd juro
    npm run install:all

Lokal ishga tushiring:

    npm run dev:website
    npm run dev:platform
    npm run dev:admin

`.env.example` faylini local ignored environment filega nusxalang. `.env`, API keys, access tokens, database exports, foydalanuvchi hujjatlari yoki logsni hech qachon commit qilmang.

<details>
<summary>Muhit o‘zgaruvchilari va Cloudflare bindings</summary>

| Nomi | Kerak | Scope | Vazifasi |
|---|---:|---|---|
| `OPENAI_API_KEY` | Faqat live AI uchun | Server | OpenAI Responses API autentifikatsiyasi |
| `OPENAI_MODEL` | Yo‘q | Server | Ixtiyoriy model o‘rnini bosish |
| `RESEND_API_KEY` | Email OTP uchun | Server | Email provayderi autentifikatsiyasi |
| `EMAIL_FROM` | Email OTP uchun | Server | Tasdiqlangan jo‘natuvchi manzili |
| `JURO_SMOKE_BASE_URL` | Yo‘q | Test process | Document builder smoke-test base URL |
| `CLOUDFLARE_REMOTE_BINDINGS` | Yo‘q | Local development | Remote bindings’ni yoqish; Wrangler login kerak |
| `DB` | Persisted features | Worker binding | Cloudflare D1 |
| `BUCKET` | File workflows | Worker binding | Private Cloudflare R2 |
| `ASSETS` / `IMAGES` | Hosting managed | Worker binding | Static assets va image optimization |

`DB`, `BUCKET`, `ASSETS` va `IMAGES` platform bindings bo‘lib, environment filega yoziladigan secrets emas. AI va email keys faqat server-side configuration bo‘lishi, public browser variables orqali oshkor qilinmasligi kerak.

</details>

## Sifat va testlash

Repozitoriy ildizidan:

    npm run lint
    npm run type-check
    npm test
    npm run build
    npm run validate:artifact

CI [.github/workflows/ci.yml](.github/workflows/ci.yml) da belgilangan. U locked installs, linting, TypeScript checks, tests, artifact validation hamda platform Cloudflare environment matrixni qamrab oladi. Faqat platform matrix va dry-run uchun:

    npm --prefix apps/platform run validate:cloudflare:matrix

## Deploy

Website va platform deploylari ataylab mustaqil. Platformaga D1 migrations, private R2 bindings, server-side secrets va aniq permission checks kerak; production approvaldan oldin ikkala target previewda tekshirilishi lozim.

Release sequence, rollback expectations, DNS safeguards va backup requirements uchun [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ni o‘qing. [docs/MIGRATION.md](docs/MIGRATION.md) source-migration hamda alternative-hosting auditni saqlaydi.

## Roadmap

| Hozir | Keyin | Keyinroq |
|---|---|---|
| Source-aware ma’lumot, document workflows, permissions va release evidence’ni saqlash. | Document analysis va lawyer hand-off’ni authenticated tekshirishni yakunlash. | Payments hamda kengroq ekotizim integratsiyalarini faqat product, security va operational gates tasdiqlangandan keyin ko‘rib chiqish. |

## Hissa va litsenziya

JURO — product-managed repository. Tor doiradagi, xavfsiz contributions qabul qilinadi; [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) ni o‘qing va tayyor issue hamda pull-request templatesdan foydalaning. Pull request production deployment, DNS change yoki production data’ga kirishga ruxsat bermaydi.

Hozircha license file mavjud emas. Qayta foydalanish huquqi berilmagan; code yoki presentation assetsdan foydalanishdan oldin repozitoriy egasi bilan bog‘laning.

---

Presentation assets kelib chiqishi va yangilash qoidalari: [docs/github/README_ASSETS.md](docs/github/README_ASSETS.md).
