import { z } from "zod";
import {
  PlatformStaffAccessError,
  requirePlatformStaffAccess,
  type PlatformStaffCapability,
} from "../auth/staff-access";
import {
  MfaError,
} from "../auth/mfa-service";
import type { LocalSession } from "../auth/session-management";
import {
  parseJsonRequest,
  type JsonRequestError,
} from "../auth/input";
import {
  ApiAuthError,
  assertSafeWrite,
} from "../auth/safe-write";
import {
  claimLegalSourceReview,
  decideLegalSourceReview,
  legalSourceReviewListInputSchema,
  legalSourceReviewDecisionInputSchema,
  LegalSourceReviewError,
  listLegalSourceReviews,
  type LegalSourceReviewEnv,
} from "./source-review";
import {
  legalSourcePublicationInputSchema,
  LegalSourcePublicationError,
  publishApprovedLegalSource,
} from "./source-publication";

type StaffHttpSession = Pick<
  LocalSession,
  "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
>;

type MfaLocale = "ru" | "uz";

export type LegalSourceStaffHttpDependencies = {
  enabled: string | undefined;
  env?: LegalSourceReviewEnv;
  sessionForRequest: (
    request: Request,
    options: { now: Date },
  ) => Promise<StaffHttpSession>;
  now?: () => Date;
};

const decisionRequestSchema = legalSourceReviewDecisionInputSchema.omit({
  reviewId: true,
});
const publicationRequestSchema = legalSourcePublicationInputSchema.omit({
  reviewId: true,
});
const reviewIdSchema = z.string().min(1).max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);
const FRESH_MFA_WINDOW_MS = 15 * 60 * 1_000;
const listRequestSchema = legalSourceReviewListInputSchema.extend({
  lang: z.enum(["ru", "uz"]).optional(),
});

function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
    },
  });
}

function legalSourceMfaErrorResponse(
  error: unknown,
  locale: MfaLocale,
): Response | null {
  if (!(error instanceof MfaError)) return null;
  const ru = locale === "ru";
  const status = error.code === "MFA_STATE_CONFLICT" ? 409 : 401;
  return jsonNoStore({
    code: error.code,
    error: ru
      ? "Для этого действия заново войдите в JURO и подтвердите двухфакторную защиту."
      : "Bu amal uchun JURO hisobiga qayta kiring va ikki bosqichli himoyani tasdiqlang.",
  }, status);
}

export function legalSourceStaffApiEnabled(value: string | undefined): boolean {
  return value === "true";
}

function localeForRequest(request: Request): MfaLocale {
  return new URL(request.url).searchParams.get("lang") === "uz" ? "uz" : "ru";
}

function message(locale: MfaLocale, ru: string, uz: string): string {
  return locale === "uz" ? uz : ru;
}

function disabledResponse(locale: MfaLocale): Response {
  return jsonNoStore({
    code: "NOT_FOUND",
    error: message(locale, "Маршрут не найден.", "Yo‘nalish topilmadi."),
  }, 404);
}

function unavailableResponse(locale: MfaLocale): Response {
  return jsonNoStore({
    code: "LEGAL_SOURCE_STAFF_API_UNAVAILABLE",
    correlationId: crypto.randomUUID(),
    error: message(
      locale,
      "Контур проверки источников временно недоступен.",
      "Manbalarni tekshirish konturi vaqtincha mavjud emas.",
    ),
  }, 503);
}

function inputErrorResponse(
  locale: MfaLocale,
  error: JsonRequestError,
): Response {
  const status = error === "payload_too_large"
    ? 413
    : error === "invalid_content_type"
      ? 415
      : 400;
  return jsonNoStore({
    code: error.toLocaleUpperCase(),
    correlationId: crypto.randomUUID(),
    error: message(
      locale,
      "Проверьте формат запроса.",
      "So‘rov formatini tekshiring.",
    ),
  }, status);
}

function legalSourceErrorResponse(
  error: unknown,
  locale: MfaLocale,
): Response | null {
  const mfa = legalSourceMfaErrorResponse(error, locale);
  if (mfa) return mfa;
  const correlationId = crypto.randomUUID();
  if (error instanceof ApiAuthError) {
    return jsonNoStore({
      code: "REQUEST_REJECTED",
      correlationId,
      error: message(
        locale,
        "Запрос отклонён проверкой безопасности.",
        "So‘rov xavfsizlik tekshiruvi tomonidan rad etildi.",
      ),
    }, error.status);
  }
  if (error instanceof PlatformStaffAccessError) {
    return jsonNoStore({
      code: "ACCESS_DENIED",
      correlationId,
      error: message(locale, "Доступ запрещён.", "Kirish taqiqlangan."),
    }, 403);
  }
  if (error instanceof z.ZodError) {
    return jsonNoStore({
      code: "INVALID_INPUT",
      correlationId,
      error: message(
        locale,
        "Проверьте формат запроса.",
        "So‘rov formatini tekshiring.",
      ),
    }, 400);
  }
  if (error instanceof LegalSourceReviewError) {
    const status = error.code === "LEGAL_SOURCE_REVIEW_NOT_FOUND"
      ? 404
      : error.code === "LEGAL_SOURCE_REVIEW_STATE_CONFLICT"
          || error.code === "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT"
        ? 409
        : 503;
    return jsonNoStore({
      code: error.code,
      correlationId,
      error: message(
        locale,
        status === 404
          ? "Задание проверки не найдено."
          : status === 409
            ? "Состояние или доказательства проверки изменились."
            : "Не удалось проверить сохранённый снимок источника.",
        status === 404
          ? "Tekshiruv topshirig‘i topilmadi."
          : status === 409
            ? "Tekshiruv holati yoki dalillari o‘zgargan."
            : "Saqlangan manba nusxasini tekshirib bo‘lmadi.",
      ),
    }, status);
  }
  if (error instanceof LegalSourcePublicationError) {
    const status = error.code === "LEGAL_SOURCE_PUBLICATION_NOT_FOUND"
      ? 404
      : error.code === "LEGAL_SOURCE_PUBLICATION_STATE_CONFLICT"
          || error.code === "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT"
        ? 409
        : error.code === "LEGAL_SOURCE_PUBLICATION_CONTENT_TOO_LARGE"
          ? 413
          : 503;
    return jsonNoStore({
      code: error.code,
      correlationId,
      error: message(
        locale,
        status === 404
          ? "Одобренная проверка не найдена."
          : status === 409
            ? "Состояние или доказательства публикации изменились."
            : status === 413
              ? "Источник слишком велик для безопасной публикации."
              : "Не удалось опубликовать проверенный снимок источника.",
        status === 404
          ? "Tasdiqlangan tekshiruv topilmadi."
          : status === 409
            ? "Nashr holati yoki dalillari o‘zgargan."
            : status === 413
              ? "Manba xavfsiz nashr qilish uchun juda katta."
              : "Tekshirilgan manba nusxasini nashr qilib bo‘lmadi.",
      ),
    }, status);
  }
  return null;
}

async function authorize(
  request: Request,
  dependencies: LegalSourceStaffHttpDependencies,
  capability: PlatformStaffCapability,
  now: Date,
  options: { write?: boolean } = {},
): Promise<{ env: LegalSourceReviewEnv; session: StaffHttpSession }> {
  if (options.write === false) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      (fetchSite !== null && fetchSite !== "same-origin")
      || request.headers.get("x-juro-csrf") !== "1"
    ) {
      throw new ApiAuthError("Запрос отклонён проверкой безопасности.", 403);
    }
  } else {
    assertSafeWrite(request);
  }
  const env = dependencies.env;
  if (!env) throw new Error("LEGAL_SOURCE_STAFF_API_BINDINGS_UNAVAILABLE");
  const session = await dependencies.sessionForRequest(request, { now });
  await requirePlatformStaffAccess(env.DB, session, capability, {
    now,
    freshMfaWithinMs: FRESH_MFA_WINDOW_MS,
  });
  return { env, session };
}

function reviewSourceDto(
  source: Awaited<ReturnType<typeof claimLegalSourceReview>>["source"],
) {
  return {
    sourceId: source.sourceId,
    versionId: source.versionId,
    sourceKind: source.sourceKind,
    locale: source.locale,
    canonicalId: source.canonicalId,
    canonicalUrl: source.canonicalUrl,
    rawContentSha256: source.rawContentSha256,
    parsedContentSha256: source.parsedContentSha256,
    parser: source.snapshot.parser,
    primarySelector: source.snapshot.primarySelector,
    documentTitle: source.snapshot.documentTitle,
    blocks: source.snapshot.blocks,
  };
}

export async function handleLegalSourceReviewListRequest(
  request: Request,
  dependencies: LegalSourceStaffHttpDependencies,
): Promise<Response> {
  const locale = localeForRequest(request);
  if (!legalSourceStaffApiEnabled(dependencies.enabled)) {
    return disabledResponse(locale);
  }
  if (!dependencies.env) return unavailableResponse(locale);
  const now = dependencies.now?.() ?? new Date();
  try {
    const { env, session } = await authorize(
      request,
      dependencies,
      "legal.sources.review",
      now,
      { write: false },
    );
    const params = new URL(request.url).searchParams;
    const raw: Record<string, string> = {};
    for (const [key, value] of params) {
      if (Object.hasOwn(raw, key)) {
        listRequestSchema.parse({ duplicateParameter: key });
      }
      raw[key] = value;
    }
    const parsed = listRequestSchema.parse(raw);
    const input = {
      status: parsed.status,
      scope: parsed.scope,
      sourceKind: parsed.sourceKind,
      language: parsed.language,
      limit: parsed.limit,
      cursor: parsed.cursor,
    };
    const result = await listLegalSourceReviews(env, session, input, { now });
    return jsonNoStore({ ok: true, ...result });
  } catch (error) {
    const response = legalSourceErrorResponse(error, locale);
    if (response) return response;
    return unavailableResponse(locale);
  }
}

export async function handleLegalSourceReviewClaimRequest(
  request: Request,
  reviewId: string,
  dependencies: LegalSourceStaffHttpDependencies,
): Promise<Response> {
  const locale = localeForRequest(request);
  if (!legalSourceStaffApiEnabled(dependencies.enabled)) {
    return disabledResponse(locale);
  }
  if (!dependencies.env) return unavailableResponse(locale);
  const now = dependencies.now?.() ?? new Date();
  try {
    const { env, session } = await authorize(
      request,
      dependencies,
      "legal.sources.review",
      now,
    );
    const parsedReviewId = reviewIdSchema.parse(reviewId);
    const result = await claimLegalSourceReview(
      env,
      session,
      parsedReviewId,
      { now },
    );
    return jsonNoStore({
      ok: true,
      review: {
        reviewId: result.reviewId,
        reviewerUserId: result.reviewerUserId,
        status: result.status,
        changed: result.changed,
      },
      source: reviewSourceDto(result.source),
    });
  } catch (error) {
    const response = legalSourceErrorResponse(error, locale);
    if (response) return response;
    return unavailableResponse(locale);
  }
}

export async function handleLegalSourceReviewDecisionRequest(
  request: Request,
  reviewId: string,
  dependencies: LegalSourceStaffHttpDependencies,
): Promise<Response> {
  const locale = localeForRequest(request);
  if (!legalSourceStaffApiEnabled(dependencies.enabled)) {
    return disabledResponse(locale);
  }
  if (!dependencies.env) return unavailableResponse(locale);
  const now = dependencies.now?.() ?? new Date();
  try {
    const { env, session } = await authorize(
      request,
      dependencies,
      "legal.sources.review",
      now,
    );
    const parsedReviewId = reviewIdSchema.parse(reviewId);
    const parsed = await parseJsonRequest(request, decisionRequestSchema, 4_096);
    if (!parsed.ok) return inputErrorResponse(locale, parsed.error);
    const result = await decideLegalSourceReview(env, session, {
      reviewId: parsedReviewId,
      ...parsed.data,
    }, { now });
    return jsonNoStore({ ok: true, decision: result });
  } catch (error) {
    const response = legalSourceErrorResponse(error, locale);
    if (response) return response;
    return unavailableResponse(locale);
  }
}

export async function handleLegalSourcePublicationRequest(
  request: Request,
  reviewId: string,
  dependencies: LegalSourceStaffHttpDependencies,
): Promise<Response> {
  const locale = localeForRequest(request);
  if (!legalSourceStaffApiEnabled(dependencies.enabled)) {
    return disabledResponse(locale);
  }
  if (!dependencies.env) return unavailableResponse(locale);
  const now = dependencies.now?.() ?? new Date();
  try {
    const { env, session } = await authorize(
      request,
      dependencies,
      "legal.sources.publish",
      now,
    );
    const parsedReviewId = reviewIdSchema.parse(reviewId);
    const parsed = await parseJsonRequest(
      request,
      publicationRequestSchema,
      2_048,
    );
    if (!parsed.ok) return inputErrorResponse(locale, parsed.error);
    const result = await publishApprovedLegalSource(env, session, {
      reviewId: parsedReviewId,
      ...parsed.data,
    }, { now });
    return jsonNoStore({ ok: true, publication: result });
  } catch (error) {
    const response = legalSourceErrorResponse(error, locale);
    if (response) return response;
    return unavailableResponse(locale);
  }
}
