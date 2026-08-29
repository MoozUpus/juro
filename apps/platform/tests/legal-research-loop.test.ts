import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  runJuroLegalResearchLoop,
} from "../lib/legal-corpus/legal-research-loop";
import { buildSparseTermEntries } from "../lib/legal-corpus/sparse-index";
import type { LegalCorpusLanguage } from "../lib/legal-corpus/trust";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

type BenchmarkCase = {
  question: string;
  semanticQuery: string;
  locale: "ru" | "uz";
  language: LegalCorpusLanguage;
  act: string;
  article: string;
  text: string;
};

const benchmark: BenchmarkCase[] = [
  {
    question: "можно ли уволить сотрудника в декрете",
    semanticQuery: "прекращение трудового договора по инициативе работодателя с работником имеющим ребенка до трех лет",
    locale: "ru", language: "ru", act: "Трудовой кодекс Республики Узбекистан", article: "409",
    text: "Прекращение трудового договора по инициативе работодателя с работником, имеющим ребенка в возрасте до трех лет, допускается только по основаниям, установленным законом.",
  },
  {
    question: "шеф задерживает зарплату, что говорит закон",
    semanticQuery: "сроки выплаты заработной платы обязанность работодателя",
    locale: "ru", language: "ru", act: "Трудовой кодекс Республики Узбекистан", article: "253",
    text: "Работодатель выплачивает заработную плату работнику в сроки, установленные трудовым законодательством и договором.",
  },
  {
    question: "могут не отпустить в ежегодный отпуск",
    semanticQuery: "право работника на ежегодный трудовой отпуск порядок предоставления",
    locale: "ru", language: "ru", act: "Трудовой кодекс Республики Узбекистан", article: "216",
    text: "Работнику предоставляется ежегодный трудовой отпуск с сохранением места работы и средней заработной платы.",
  },
  {
    question: "купил бракованную вещь и магазин отказывает",
    semanticQuery: "права потребителя при продаже товара с недостатками",
    locale: "ru", language: "ru", act: "Закон о защите прав потребителей", article: "13",
    text: "Потребитель при обнаружении недостатков товара вправе предъявить продавцу предусмотренные законом требования.",
  },
  {
    question: "как вступить в наследство после смерти отца",
    semanticQuery: "принятие наследства наследником срок и порядок",
    locale: "ru", language: "ru", act: "Гражданский кодекс Республики Узбекистан", article: "1146",
    text: "Для приобретения наследства наследник должен принять его в порядке, установленном гражданским законодательством.",
  },
  {
    question: "хозяин квартиры выселяет без предупреждения",
    semanticQuery: "расторжение договора найма жилого помещения предупреждение нанимателя",
    locale: "ru", language: "ru", act: "Жилищный кодекс Республики Узбекистан", article: "86",
    text: "Расторжение договора найма жилого помещения производится по основаниям и в порядке, установленным законодательством.",
  },
  {
    question: "куда пожаловаться на решение госоргана",
    semanticQuery: "обжалование административного акта заинтересованным лицом",
    locale: "ru", language: "ru", act: "Закон об административных процедурах", article: "63",
    text: "Заинтересованное лицо вправе обжаловать административный акт в административном или судебном порядке.",
  },
  {
    question: "что обязательно написать в уставе ооо",
    semanticQuery: "содержание устава общества с ограниченной ответственностью",
    locale: "ru", language: "ru", act: "Закон об обществах с ограниченной ответственностью", article: "14",
    text: "Устав общества должен содержать фирменное наименование, место нахождения и иные установленные законом сведения.",
  },
  {
    question: "компания слила мой номер рекламщикам",
    semanticQuery: "передача персональных данных третьим лицам согласие субъекта",
    locale: "ru", language: "ru", act: "Закон о персональных данных", article: "21",
    text: "Передача персональных данных третьим лицам допускается при наличии законного основания и с соблюдением прав субъекта.",
  },
  {
    question: "бывший супруг не платит на ребенка",
    semanticQuery: "обязанность родителей содержать несовершеннолетних детей алименты",
    locale: "ru", language: "ru", act: "Семейный кодекс Республики Узбекистан", article: "96",
    text: "Родители обязаны содержать своих несовершеннолетних детей в порядке, предусмотренном семейным законодательством.",
  },
  {
    question: "ishdan bo‘shatishdi, buyruq ham bermadi",
    semanticQuery: "mehnat shartnomasini bekor qilish buyrug‘ini xodimga berish",
    locale: "uz", language: "uz-Latn", act: "O‘zbekiston Respublikasining Mehnat kodeksi", article: "170",
    text: "Mehnat shartnomasi bekor qilinganda ish beruvchi xodimga buyruqning ko‘chirma nusxasini berishi shart.",
  },
  {
    question: "do‘kon sifatsiz telefonni qaytib olmayapti",
    semanticQuery: "nuqsonli tovar sotilganda iste’molchining huquqlari",
    locale: "uz", language: "uz-Latn", act: "Iste’molchilarning huquqlarini himoya qilish to‘g‘risida", article: "13",
    text: "Tovarda nuqson aniqlanganida iste’molchi sotuvchiga qonunda nazarda tutilgan talablarni qo‘yishga haqli.",
  },
  {
    question: "merosni qanday qabul qilaman",
    semanticQuery: "merosxo‘r tomonidan merosni qabul qilish tartibi",
    locale: "uz", language: "uz-Latn", act: "O‘zbekiston Respublikasining Fuqarolik kodeksi", article: "1146",
    text: "Merosni olish uchun merosxo‘r uni fuqarolik qonunchiligida belgilangan tartibda qabul qilishi lozim.",
  },
  {
    question: "MChJ ustavida nimalar bo‘lishi kerak",
    semanticQuery: "mas’uliyati cheklangan jamiyat ustavining mazmuni",
    locale: "uz", language: "uz-Latn", act: "Mas’uliyati cheklangan jamiyatlar to‘g‘risida", article: "14",
    text: "Jamiyat ustavida firma nomi, joylashgan yeri va qonunda belgilangan boshqa ma’lumotlar ko‘rsatilishi kerak.",
  },
  {
    question: "telefon raqamimni ruxsatsiz tarqatishibdi",
    semanticQuery: "shaxsga doir ma’lumotlarni uchinchi shaxsga roziliksiz berish",
    locale: "uz", language: "uz-Latn", act: "Shaxsga doir ma’lumotlar to‘g‘risida", article: "21",
    text: "Shaxsga doir ma’lumotlarni uchinchi shaxsga berish qonuniy asos mavjud bo‘lganda amalga oshiriladi.",
  },
  {
    question: "иш ҳақимни вақтида беришмаяпти",
    semanticQuery: "иш ҳақини тўлаш муддатлари иш берувчининг мажбурияти",
    locale: "uz", language: "uz-Cyrl", act: "Ўзбекистон Республикасининг Меҳнат кодекси", article: "253",
    text: "Иш берувчи ходимга иш ҳақини меҳнат қонунчилиги ва шартномада белгиланган муддатларда тўлайди.",
  },
  {
    question: "йиллик таътилга чиқаришмаяпти",
    semanticQuery: "ходимнинг ҳар йилги меҳнат таътилига бўлган ҳуқуқи",
    locale: "uz", language: "uz-Cyrl", act: "Ўзбекистон Республикасининг Меҳнат кодекси", article: "216",
    text: "Ходимга иш жойи ва ўртача иш ҳақи сақланган ҳолда ҳар йилги меҳнат таътили берилади.",
  },
  {
    question: "уй эгаси огоҳлантирмай чиқармоқчи",
    semanticQuery: "турар жой ижара шартномасини бекор қилиш тартиби",
    locale: "uz", language: "uz-Cyrl", act: "Ўзбекистон Республикасининг Уй-жой кодекси", article: "86",
    text: "Турар жой ижара шартномаси қонунчиликда белгиланган асослар ва тартибда бекор қилинади.",
  },
  {
    question: "давлат идораси қароридан норозиман",
    semanticQuery: "маъмурий ҳужжат устидан шикоят қилиш ҳуқуқи",
    locale: "uz", language: "uz-Cyrl", act: "Маъмурий тартиб-таомиллар тўғрисида", article: "63",
    text: "Манфаатдор шахс маъмурий ҳужжат устидан маъмурий ёки суд тартибида шикоят қилишга ҳақли.",
  },
  {
    question: "болам учун алимент тўламайди",
    semanticQuery: "ота-онанинг вояга етмаган болаларга таъминот бериш мажбурияти",
    locale: "uz", language: "uz-Cyrl", act: "Ўзбекистон Республикасининг Оила кодекси", article: "96",
    text: "Ота-она вояга етмаган болаларига оила қонунчилигида белгиланган тартибда таъминот бериши шарт.",
  },
];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function seedBenchmark(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): Map<string, string> {
  const now = "2026-08-28T00:00:00.000Z";
  const queryToChunk = new Map<string, string>();
  benchmark.forEach((item, index) => {
    const suffix = String(index + 1);
    const documentId = `lexuz:benchmark:${suffix}`;
    const variantId = `${documentId}:${item.language}`;
    const versionId = `${variantId}:v1`;
    const provisionId = `${versionId}:p1`;
    const chunkId = `${provisionId}:c1`;
    const content = `${item.article}. ${item.text}`;
    const hash = sha256(content);
    const sourceUrl = `https://lex.uz/${item.language === "ru" ? "ru" : "uz"}/docs/${10_000 + index}`;
    sqlite.prepare(`INSERT INTO legal_corpus_documents (
      id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,document_type,
      availability_status,trusted,verification_status,approval_required,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      documentId, "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global", sourceUrl,
      item.act, "legal_act", "ready", 1, "official_source", 0, now, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_variants (
      id,document_id,language,is_official_language_version,source_url,last_verified_at,current_version_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      variantId, documentId, item.language, 1, sourceUrl, now, versionId, now, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_versions (
      id,variant_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
      normalized_object_key,source_url,fetched_at,change_type,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      versionId, variantId, 1, "active", "2026-01-01", null, "2026-01-01", hash,
      `legal/benchmark/${suffix}.json`, sourceUrl, now, "new", now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_provisions (
      id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,
      sequence,text,exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      provisionId, documentId, variantId, versionId, item.article, item.article,
      item.semanticQuery, 1, content, content, item.language, "active", "2026-01-01", null,
      sourceUrl, hash, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_chunks (
      id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,
      sparse_terms_json,indexed_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      chunkId, provisionId, versionId, 0, 1, content, hash, "[]", now, now,
    );
    sqlite.prepare("INSERT INTO legal_corpus_sparse_chunk_keys (chunk_id) VALUES (?)").run(chunkId);
    const chunkKeyId = (sqlite.prepare(
      "SELECT id FROM legal_corpus_sparse_chunk_keys WHERE chunk_id=?",
    ).get(chunkId) as { id: number }).id;
    for (const entry of buildSparseTermEntries({
      text: content,
      articleNumber: item.article,
      title: item.semanticQuery,
    })) {
      sqlite.prepare(
        "INSERT OR IGNORE INTO legal_corpus_sparse_term_dictionary (term) VALUES (?)",
      ).run(entry.term);
      const termId = (sqlite.prepare(
        "SELECT id FROM legal_corpus_sparse_term_dictionary WHERE term=?",
      ).get(entry.term) as { id: number }).id;
      sqlite.prepare(`INSERT INTO legal_corpus_sparse_postings
        (term_id,chunk_key_id,term_frequency,title_frequency,article_frequency)
        VALUES (?,?,?,?,?)`).run(
        termId,
        chunkKeyId,
        entry.termFrequency,
        entry.titleFrequency,
        entry.articleFrequency,
      );
    }
    queryToChunk.set(item.semanticQuery.normalize("NFKC"), chunkId);
  });
  return queryToChunk;
}

test("bounded research starts the original hybrid search before generated tasks are ready", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const calls: string[] = [];
    let release!: (queries: readonly string[]) => void;
    const generated = new Promise<readonly string[]>((resolve) => { release = resolve; });
    const pending = runJuroLegalResearchLoop({
      db: d1,
      originalQuery: "original colloquial question",
      generatedQueries: generated,
      locale: "ru",
      search: async ({ query }) => {
        calls.push(query);
        return [];
      },
    });
    await Promise.resolve();
    assert.deepEqual(calls, ["original colloquial question"]);
    release([
      "semantic act provision",
      "second statutory formulation",
      "third statutory formulation",
      "fourth statutory formulation",
      "fifth statutory formulation",
    ]);
    const result = await pending;
    assert.deepEqual(calls, [
      "original colloquial question",
      "semantic act provision",
      "second statutory formulation",
      "third statutory formulation",
    ]);
    assert.equal(result.queriesRun, 4);
  } finally {
    sqlite.close();
  }
});

test("semantic reranking can reject a one-word collision before exact-window hydration", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const now = "2026-08-28T00:00:00.000Z";
    const hash = "a".repeat(64);
    const item = (input: {
      chunkId: string;
      documentId: string;
      documentTitle: string;
      articleTitle: string;
      exactQuote: string;
    }) => ({
      ...input,
      documentType: "legal_act",
      documentNumber: null,
      adoptingAuthority: null,
      sourceClass: "OFFICIAL_LEGISLATION" as const,
      articleNumber: "1",
      sourceUrl: `https://lex.uz/ru/docs/${input.documentId}`,
      language: "ru" as const,
      status: "active" as const,
      validFrom: "2026-01-01",
      validTo: null,
      versionDate: "2026-01-01",
      fetchedAt: now,
      contentHash: hash,
    });
    const irrelevant = item({
      chunkId: "irrelevant-chunk",
      documentId: "100",
      documentTitle: "Регламент информационной системы выборов",
      articleTitle: "Анкета сотрудника комиссии",
      exactQuote: "Сотрудник комиссии заполняет анкету пользователя информационной системы.",
    });
    const relevant = item({
      chunkId: "relevant-chunk",
      documentId: "200",
      documentTitle: "Трудовой кодекс Республики Узбекистан",
      articleTitle: "Гарантии при прекращении трудового договора",
      exactQuote: "Прекращение трудового договора работодателем с работником в отпуске по уходу за ребенком ограничено законом.",
    });
    const leaveOnly = item({
      chunkId: "leave-only-chunk",
      documentId: "300",
      documentTitle: "Трудовое законодательство Республики Узбекистан",
      articleTitle: "Сохранение места работы во время социального отпуска",
      exactQuote: "Во время отпуска по уходу за ребенком за работником сохраняется место работы.",
    });
    const hydratedAnchors: string[] = [];
    let rerankerQuestion = "";
    let rerankerCandidateIds: string[] = [];
    const result = await runJuroLegalResearchLoop({
      db: d1,
      originalQuery: "можно уволить сотрудника в декрете",
      rerankingQuestion: "увольнение во время отпуска по беременности или ухода за ребенком",
      generatedQueries: [
        "прекращение трудового договора работодателем отпуск уход ребенком",
      ],
      requiredConcepts: [
        { alternatives: ["прекращение трудового договора", "увольнение"] },
        { alternatives: ["отпуск по уходу за ребенком"] },
        { alternatives: ["защищенный социальный статус"] },
      ],
      locale: "ru",
      rerankCandidates: async ({ question, candidates }) => {
        rerankerQuestion = question;
        rerankerCandidateIds = candidates.map(({ passage }) => passage.chunkId);
        return [relevant.chunkId];
      },
      readTools: {
        findLegalSources: async ({ query }) => query.startsWith("прекращение")
          ? [leaveOnly, relevant]
          : [irrelevant],
        inspectLegalAct: async ({ anchorChunkId }) => {
          hydratedAnchors.push(anchorChunkId);
          const passage = anchorChunkId === relevant.chunkId ? relevant : irrelevant;
          return {
            documentId: passage.documentId,
            title: passage.documentTitle,
            documentType: passage.documentType,
            documentNumber: null,
            adoptingAuthority: null,
            adoptionDate: null,
            publicationDate: null,
            language: "ru",
            status: "active",
            validFrom: passage.validFrom,
            validTo: null,
            versionDate: passage.versionDate,
            sourceUrl: passage.sourceUrl!,
            fetchedAt: now,
          };
        },
        readLegalProvisions: async ({ anchorChunkId }) => {
          hydratedAnchors.push(anchorChunkId);
          const passage = anchorChunkId === relevant.chunkId ? relevant : irrelevant;
          return [{
            id: passage.chunkId,
            article: passage.articleTitle,
            paragraph: null,
            text: passage.exactQuote,
            textSha256: hash,
            quality: "high",
          }];
        },
      },
    });

    assert.deepEqual(result.hits.map((hit) => hit.passage.chunkId), [relevant.chunkId]);
    assert.deepEqual(hydratedAnchors, [relevant.chunkId, relevant.chunkId]);
    assert.deepEqual(
      new Set(rerankerCandidateIds),
      new Set([irrelevant.chunkId, leaveOnly.chunkId, relevant.chunkId]),
    );
    assert.equal(
      rerankerQuestion,
      "увольнение во время отпуска по беременности или ухода за ребенком",
    );
  } finally {
    sqlite.close();
  }
});

test("one exact article split across chunks bypasses the model reranker", async () => {
  const hash = "e".repeat(64);
  const exact = {
    chunkId: "labour-409",
    documentId: "6257291",
    documentTitle: "Трудовой кодекс Республики Узбекистан",
    documentType: "code",
    documentNumber: null,
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION" as const,
    articleNumber: "409",
    articleTitle: "Гарантии для работников, имеющих ребенка до трех лет",
    exactQuote: "Статья 409 ограничивает прекращение трудового договора с работником, имеющим ребенка до трех лет.",
    sourceUrl: "https://lex.uz/ru/docs/6257291",
    language: "ru" as const,
    status: "active" as const,
    validFrom: "2023-04-30",
    validTo: null,
    versionDate: "2026-07-25",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    contentHash: hash,
  };
  const continuation = {
    ...exact,
    chunkId: "labour-409-continuation",
    exactQuote: "Гарантия статьи 409 также применяется к одинокому отцу или опекуну.",
  };
  let rerankerCalls = 0;
  let hydrationBatches = 0;
  const result = await runJuroLegalResearchLoop({
    db: {} as D1Database,
    originalQuery: "статья 409 Трудового кодекса",
    locale: "ru",
    readTools: {
      findLegalSources: async () => [exact, continuation],
      inspectLegalAct: async () => { throw new Error("batched hydration expected"); },
      readLegalProvisions: async () => { throw new Error("batched hydration expected"); },
      hydrateLegalSources: async ({ anchorChunkIds }) => {
        hydrationBatches += 1;
        return anchorChunkIds.map((anchorChunkId) => ({
          anchorChunkId,
          act: {
            documentId: exact.documentId,
            title: exact.documentTitle,
            documentType: exact.documentType,
            documentNumber: null,
            adoptingAuthority: null,
            adoptionDate: null,
            publicationDate: null,
            language: exact.language,
            status: exact.status,
            validFrom: exact.validFrom,
            validTo: null,
            versionDate: exact.versionDate,
            sourceUrl: exact.sourceUrl,
            fetchedAt: exact.fetchedAt,
          },
          spans: [{
            id: anchorChunkId,
            article: exact.articleNumber,
            paragraph: null,
            text: anchorChunkId === exact.chunkId ? exact.exactQuote : continuation.exactQuote,
            textSha256: hash,
            quality: "high" as const,
          }],
        }));
      },
    },
    rerankCandidates: async () => { rerankerCalls += 1; return [exact.chunkId]; },
  });
  assert.equal(rerankerCalls, 0);
  assert.equal(hydrationBatches, 1);
  assert.equal(result.rerankingOutcome, "not_needed");
  assert.deepEqual(result.hits.map((hit) => hit.passage.chunkId), [exact.chunkId, continuation.chunkId]);
});

test("near-duplicate generated searches share one request-scoped corpus lookup", async () => {
  const calls: string[] = [];
  const result = await runJuroLegalResearchLoop({
    db: {} as D1Database,
    originalQuery: "Статья 409 ТК РУз",
    generatedQueries: ["статья 409 тк руз!", "  СТАТЬЯ 409 ТК РУЗ  ", "гарантии работнику с ребенком"],
    locale: "ru",
    readTools: {
      findLegalSources: async ({ query }) => { calls.push(query); return []; },
      inspectLegalAct: async () => null,
      readLegalProvisions: async () => [],
    },
  });
  assert.deepEqual(calls, ["Статья 409 ТК РУз", "гарантии работнику с ребенком"]);
  assert.equal(result.queriesRun, 2);
});

test("reranker permutations produce the same deterministic source order", async () => {
  const hash = "f".repeat(64);
  const now = "2026-08-28T00:00:00.000Z";
  const passage = (chunkId: string, articleNumber: string, text: string) => ({
    chunkId,
    documentId: "6257291",
    documentTitle: "Трудовой кодекс Республики Узбекистан",
    documentType: "code",
    documentNumber: null,
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION" as const,
    articleNumber,
    articleTitle: "Гарантии при прекращении трудового договора",
    exactQuote: text,
    sourceUrl: "https://lex.uz/ru/docs/6257291",
    language: "ru" as const,
    status: "active" as const,
    validFrom: "2023-04-30",
    validTo: null,
    versionDate: "2026-07-25",
    fetchedAt: now,
    contentHash: hash,
  });
  const first = passage(
    "labour-215",
    "215",
    "В период отпуска не допускается прекращение трудового договора по инициативе работодателя.",
  );
  const second = passage(
    "labour-409",
    "409",
    "Прекращение трудового договора работодателем с работником, имеющим ребенка до трех лет, ограничено законом.",
  );
  const readTools = {
    findLegalSources: async () => [first, second],
    inspectLegalAct: async () => ({
      documentId: "6257291",
      title: "Трудовой кодекс Республики Узбекистан",
      documentType: "code",
      documentNumber: null,
      adoptingAuthority: null,
      adoptionDate: null,
      publicationDate: null,
      language: "ru" as const,
      status: "active" as const,
      validFrom: "2023-04-30",
      validTo: null,
      versionDate: "2026-07-25",
      sourceUrl: "https://lex.uz/ru/docs/6257291",
      fetchedAt: now,
    }),
    readLegalProvisions: async ({ anchorChunkId }: { anchorChunkId: string }) => {
      const item = anchorChunkId === first.chunkId ? first : second;
      return [{
        id: item.chunkId,
        article: item.articleNumber,
        paragraph: null,
        text: item.exactQuote,
        textSha256: hash,
        quality: "high" as const,
      }];
    },
  };
  const run = (rankedChunkIds: string[]) => runJuroLegalResearchLoop({
    db: {} as D1Database,
    originalQuery: "прекращение трудового договора работодателем с работником в отпуске",
    locale: "ru",
    limit: 2,
    readTools,
    rerankCandidates: async () => rankedChunkIds,
  });

  const [forward, reversed] = await Promise.all([
    run([first.chunkId, second.chunkId]),
    run([second.chunkId, first.chunkId]),
  ]);

  assert.deepEqual(
    forward.hits.map((hit) => hit.passage.chunkId),
    reversed.hits.map((hit) => hit.passage.chunkId),
  );
  assert.deepEqual(forward.hits.map((hit) => hit.passage.chunkId), [first.chunkId, second.chunkId]);
});

test("configured semantic reranker fails closed on rejection or an empty decision", async () => {
  const hash = "a".repeat(64);
  const candidate = {
    chunkId: "keyword-collision",
    documentId: "100",
    documentTitle: "Постановление Пленума Верховного суда",
    documentType: "resolution",
    documentNumber: null,
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION" as const,
    articleNumber: "29",
    articleTitle: "Прекращение трудового договора",
    exactQuote: "Суд проверяет прекращение трудового договора с работником по инициативе работодателя.",
    sourceUrl: "https://lex.uz/ru/docs/100",
    language: "ru" as const,
    status: "active" as const,
    validFrom: "2026-01-01",
    validTo: null,
    versionDate: "2026-01-01",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    contentHash: hash,
  };
  let hydrationCalls = 0;
  const run = (rerankCandidates: Parameters<typeof runJuroLegalResearchLoop>[0]["rerankCandidates"]) =>
    runJuroLegalResearchLoop({
      db: {} as D1Database,
      originalQuery: "можно уволить работника",
      generatedQueries: ["прекращение трудового договора работодателем с работником"],
      locale: "ru",
      readTools: {
        findLegalSources: async () => [candidate],
        inspectLegalAct: async () => {
          hydrationCalls += 1;
          return null;
        },
        readLegalProvisions: async () => {
          hydrationCalls += 1;
          return [];
        },
      },
      rerankCandidates,
    });

  const rejected = await run(async () => []);
  const unavailable = await run(async () => {
    throw new Error("reranker unavailable");
  });

  assert.deepEqual(rejected.hits, []);
  assert.deepEqual(unavailable.hits, []);
  assert.equal(rejected.rerankedCandidateCount, 0);
  assert.equal(unavailable.rerankedCandidateCount, 0);
  assert.equal(rejected.rerankingOutcome, "rejected");
  assert.equal(unavailable.rerankingOutcome, "failed_closed");
  assert.equal(rejected.rerankingFailureCode, null);
  assert.equal(unavailable.rerankingFailureCode, "Error");
  assert.equal(hydrationCalls, 0);
});

test("reranker outage keeps multiple strictly grounded fallback candidates for final synthesis", async () => {
  const hash = "e".repeat(64);
  const passage = (chunkId: string, articleNumber: string, exactQuote: string) => ({
    chunkId,
    documentId: "labour-code",
    documentTitle: "Трудовой кодекс Республики Узбекистан",
    documentType: "code",
    documentNumber: null,
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION" as const,
    articleNumber,
    articleTitle: "Гарантии при прекращении трудового договора",
    exactQuote,
    sourceUrl: "https://lex.uz/ru/docs/100",
    language: "ru" as const,
    status: "active" as const,
    validFrom: "2026-01-01",
    validTo: null,
    versionDate: "2026-01-01",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    contentHash: hash,
  });
  const leave = passage(
    "labour-215",
    "215",
    "В период отпуска работника не допускается прекращение трудового договора работодателем.",
  );
  const pregnancy = passage(
    "labour-408",
    "408",
    "Прекращение трудового договора работодателем с беременной женщиной не допускается.",
  );
  const byId = new Map([leave, pregnancy].map((item) => [item.chunkId, item]));
  const result = await runJuroLegalResearchLoop({
    db: {} as D1Database,
    originalQuery: "прекращение трудового договора работодателем с работником в декрете",
    generatedQueries: ["прекращение трудового договора с работником в отпуске или беременной женщиной"],
    rerankingQuestion: "прекращение трудового договора работодателем с работником в отпуске или беременной женщиной",
    requiredConcepts: [
      { alternatives: ["прекращение трудового договора"] },
      { alternatives: ["работник в отпуске", "беременная женщина"] },
    ],
    locale: "ru",
    readTools: {
      findLegalSources: async () => [leave, pregnancy],
      inspectLegalAct: async () => ({
        documentId: "labour-code",
        title: "Трудовой кодекс Республики Узбекистан",
        documentType: "code",
        documentNumber: null,
        adoptingAuthority: null,
        adoptionDate: null,
        publicationDate: null,
        language: "ru",
        status: "active",
        validFrom: "2026-01-01",
        validTo: null,
        versionDate: "2026-01-01",
        sourceUrl: "https://lex.uz/ru/docs/100",
        fetchedAt: "2026-08-28T00:00:00.000Z",
      }),
      readLegalProvisions: async ({ anchorChunkId }) => {
        const item = byId.get(anchorChunkId)!;
        return [{
          id: item.chunkId,
          article: item.articleNumber,
          paragraph: null,
          text: item.exactQuote,
          textSha256: hash,
          quality: "high",
        }];
      },
    },
    rerankCandidates: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.rerankingOutcome, "deterministic_fallback");
  assert.deepEqual(result.hits.map((hit) => hit.passage.chunkId), [leave.chunkId, pregnancy.chunkId]);
  assert.equal(result.hits.every((hit) => hit.selectionMethod === "deterministic_fallback"), true);
});

test("selected anchors retain independently responsive provisions from their exact window", async () => {
  const hash = "b".repeat(64);
  const anchor = {
    chunkId: "labour-408",
    documentId: "labour-code",
    documentTitle: "Трудовой кодекс Республики Узбекистан",
    documentType: "code",
    documentNumber: null,
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION" as const,
    articleNumber: "408",
    articleTitle: "Гарантии беременным женщинам при прекращении трудового договора",
    exactQuote: "Прекращение трудового договора работодателем с беременной женщиной не допускается.",
    sourceUrl: "https://lex.uz/ru/docs/100",
    language: "ru" as const,
    status: "active" as const,
    validFrom: "2026-01-01",
    validTo: null,
    versionDate: "2026-01-01",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    contentHash: hash,
  };
  const result = await runJuroLegalResearchLoop({
    db: {} as D1Database,
    originalQuery: "можно уволить работника в декрете",
    rerankingQuestion: "прекращение трудового договора работодателем с беременной женщиной или работником имеющим ребенка до трех лет",
    requiredConcepts: [
      { alternatives: ["прекращение трудового договора", "увольнение"] },
      { alternatives: ["беременная женщина", "работник имеющий ребенка до трех лет"] },
    ],
    locale: "ru",
    readTools: {
      findLegalSources: async () => [anchor],
      inspectLegalAct: async () => ({
        documentId: anchor.documentId,
        title: anchor.documentTitle,
        documentType: anchor.documentType,
        documentNumber: null,
        adoptingAuthority: null,
        adoptionDate: null,
        publicationDate: null,
        language: "ru",
        status: "active",
        validFrom: anchor.validFrom,
        validTo: null,
        versionDate: anchor.versionDate,
        sourceUrl: anchor.sourceUrl,
        fetchedAt: anchor.fetchedAt,
      }),
      readLegalProvisions: async () => [{
        id: anchor.chunkId,
        article: "408. Гарантии беременным женщинам",
        paragraph: null,
        text: anchor.exactQuote,
        textSha256: hash,
        quality: "high",
        provisionSequence: 408,
      }, {
        id: "labour-409",
        article: "409. Гарантии работнику с ребенком до трех лет",
        paragraph: null,
        text: "Прекращение трудового договора работодателем с работником, имеющим ребенка до трех лет, ограничено законом.",
        textSha256: "c".repeat(64),
        quality: "high",
        provisionSequence: 409,
      }, {
        id: "unrelated-neighbour",
        article: "407. Рассмотрение трудового спора",
        paragraph: null,
        text: "Суд исследует представленные сторонами документы и другие доказательства.",
        textSha256: "d".repeat(64),
        quality: "high",
        provisionSequence: 407,
      }],
    },
    rerankCandidates: async () => {
      throw new Error("transient reranker failure");
    },
  });

  assert.equal(result.rerankingOutcome, "deterministic_fallback");
  assert.equal(result.rerankingFailureCode, "Error");
  assert.equal(result.hits[0]?.selectionMethod, "deterministic_fallback");
  assert.deepEqual(
    result.hits[0]?.responsiveSpans.map((span) => span.article?.match(/\d+/u)?.[0]),
    ["408", "409"],
  );

  const reverseAnchor = {
    ...anchor,
    chunkId: "labour-409",
    articleNumber: "409",
    articleTitle: "Гарантии работнику с ребенком до трех лет",
    exactQuote: "Прекращение трудового договора работодателем с работником, имеющим ребенка до трех лет, ограничено законом.",
  };
  const reverse = await runJuroLegalResearchLoop({
    db: {} as D1Database,
    originalQuery: "можно уволить работника в декрете",
    rerankingQuestion: "прекращение трудового договора работодателем с беременной женщиной или работником имеющим ребенка до трех лет",
    requiredConcepts: [
      { alternatives: ["прекращение трудового договора", "увольнение"] },
      { alternatives: ["беременная женщина", "работник имеющий ребенка до трех лет"] },
    ],
    locale: "ru",
    readTools: {
      findLegalSources: async () => [reverseAnchor],
      inspectLegalAct: async () => ({
        documentId: reverseAnchor.documentId,
        title: reverseAnchor.documentTitle,
        documentType: reverseAnchor.documentType,
        documentNumber: null,
        adoptingAuthority: null,
        adoptionDate: null,
        publicationDate: null,
        language: "ru",
        status: "active",
        validFrom: reverseAnchor.validFrom,
        validTo: null,
        versionDate: reverseAnchor.versionDate,
        sourceUrl: reverseAnchor.sourceUrl,
        fetchedAt: reverseAnchor.fetchedAt,
      }),
      readLegalProvisions: async () => [{
        id: reverseAnchor.chunkId,
        article: "409. Гарантии работнику с ребенком до трех лет",
        paragraph: null,
        text: reverseAnchor.exactQuote,
        textSha256: "c".repeat(64),
        quality: "high",
        provisionSequence: 409,
      }, {
        id: "labour-408",
        article: "408. Гарантии беременным женщинам",
        paragraph: null,
        text: anchor.exactQuote,
        textSha256: hash,
        quality: "high",
        provisionSequence: 408,
      }],
    },
    rerankCandidates: async () => {
      throw new Error("transient reranker failure");
    },
  });

  assert.deepEqual(
    reverse.hits[0]?.responsiveSpans.map((span) => span.article?.match(/\d+/u)?.[0]),
    ["409", "408"],
  );
});

test("bilingual colloquial benchmark reaches recall@8 >= 90% and hydrates every counted hit", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const queryToChunk = seedBenchmark(sqlite);
    const hitsByLocale = { ru: 0, uz: 0 };
    const totalsByLocale = { ru: 0, uz: 0 };
    let recalled = 0;
    let hydrated = 0;
    for (const item of benchmark) {
      totalsByLocale[item.locale] += 1;
      const result = await runJuroLegalResearchLoop({
        db: d1,
        originalQuery: item.question,
        generatedQueries: [item.semanticQuery],
        locale: item.locale,
        denseSearch: async (query) => {
          const chunkId = queryToChunk.get(query.normalize("NFKC"));
          return chunkId ? [{ chunkId, score: 0.97 }] : [];
        },
      });
      const expected = result.hits.slice(0, 8).find((hit) =>
        hit.act.title === item.act && hit.passage.articleNumber === item.article);
      if (expected) {
        recalled += 1;
        hitsByLocale[item.locale] += 1;
        if (expected.exactWindowHydrated && expected.spans.every((span) => /^[a-f0-9]{64}$/u.test(span.textSha256))) {
          hydrated += 1;
        }
      }
    }
    assert.ok(recalled / benchmark.length >= 0.90, `recall@8=${recalled}/${benchmark.length}`);
    assert.ok(hitsByLocale.ru / totalsByLocale.ru >= 0.85, `ru=${hitsByLocale.ru}/${totalsByLocale.ru}`);
    assert.ok(hitsByLocale.uz / totalsByLocale.uz >= 0.85, `uz=${hitsByLocale.uz}/${totalsByLocale.uz}`);
    assert.equal(hydrated, recalled, `hydrated=${hydrated}, recalled=${recalled}`);

    const maternityCase = benchmark[0]!;
    const sparseOnly = await runJuroLegalResearchLoop({
      db: d1,
      originalQuery: maternityCase.question,
      generatedQueries: [maternityCase.semanticQuery],
      locale: maternityCase.locale,
    });
    assert.equal(
      sparseOnly.hits.some((hit) => hit.passage.articleNumber === maternityCase.article),
      true,
      "request-scoped statutory query must bridge colloquial wording without dense vectors",
    );
    assert.equal(sparseOnly.hits.some((hit) => hit.passage.denseRank !== undefined), false);

    const production = await Promise.all([
      readFile(new URL("../lib/legal-corpus/retrieval.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/legal-corpus/legal-research-loop.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/legal/direct-retrieval.ts", import.meta.url), "utf8"),
    ]);
    assert.doesNotMatch(production.join("\n"), /декрет|6257291|(?:article|статья)\s*409/iu);
    assert.doesNotMatch(
      production[0] ?? "",
      /SELECT\s+COUNT\(\*\)\s+FROM\s+legal_corpus_chunks/iu,
      "interactive ranking must not full-scan the million-row chunk table",
    );
  } finally {
    sqlite.close();
  }
});
