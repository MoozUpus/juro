"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated handoff records are loaded after the first browser render */

import { LoaderCircle, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { LawyerRequestMessages } from "./LawyerRequestMessages";
import { LawyerPhoneContact } from "./LawyerPhoneContact";
import { LawyerReviewForm } from "./LawyerReviewForm";
import { ClientServiceProposals } from "./MarketplaceServiceProposalFlow";
import { LawyerConsultationPanel } from "./LawyerConsultationPanel";
import { LawyerDocumentRequests } from "./LawyerDocumentRequests";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { WorkspaceEntitlements } from "../../lib/billing/entitlements";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import {
  formatLawyerRequestDate as formatRequestDate,
  lawyerRequestFormatLabel as formatLabel,
  lawyerRequestServiceLabel as serviceLabel,
} from "../../lib/platform/lawyer-request-presentation";

type CaseOption = { id: string; title: string };
type HandoffRequest = {
  id: string;
  caseId: string;
  status: string;
  createdAt: string;
  lawyerName?: string | null;
  conflictStatus?: string | null;
  activeGrantId?: string | null;
  offerId?: string | null;
  offerStatus?: string | null;
  offerScopeDescription?: string | null;
  offerPriceDescription?: string | null;
  offerDurationDescription?: string | null;
  serviceCode?: string | null;
  preferredFormat?: string | null;
  proposedStartsAt?: string | null;
};
type PublicLawyer = {
  id: string;
  displayName: string;
  specialties: string[];
  languages: string[];
  experienceYears: number | null;
  priceDescription: string | null;
  availabilityStatus: "unknown" | "available" | "limited" | "unavailable";
  nextAvailableAt: string | null;
  advocateStatus: "not_declared" | "declared" | "verified";
  firmName: string | null;
  bio: string | null;
  marketplaceStatus: "pending_review" | "public_approved";
  canReceiveRequests: boolean;
  rating: {
    reviewCount: number;
    overallAverage: number | null;
    speedAverage: number | null;
    qualityAverage: number | null;
    communicationAverage: number | null;
  };
  reviews: Array<{
    overallRating: number;
    body: string | null;
    createdAt: string;
  }>;
};

export function LawyerHandoffClient({
  locale,
  accountType,
  workspaceId,
}: {
  locale: PlatformLocale;
  accountType: AccountType;
  workspaceId?: string;
}) {
  const ru = locale === "ru";
  const selectedLawyerId = useSearchParams().get("lawyer") || "";
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [requests, setRequests] = useState<HandoffRequest[]>([]);
  const [lawyers, setLawyers] = useState<PublicLawyer[]>([]);
  const [lawyerProfileId, setLawyerProfileId] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [minimumExperience, setMinimumExperience] = useState("");
  const [minimumRating, setMinimumRating] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [advocateFilter, setAdvocateFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [entitlements, setEntitlements] =
    useState<WorkspaceEntitlements | null>(null);
  const [caseId, setCaseId] = useState("");
  const [summary, setSummary] = useState("");
  const [serviceCode, setServiceCode] = useState("initial_consultation");
  const [preferredFormat, setPreferredFormat] = useState("video");
  const [proposedStartsAt, setProposedStartsAt] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accessActionId, setAccessActionId] = useState("");
  const [accessConsents, setAccessConsents] = useState<Record<string, boolean>>(
    {},
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [
      requestResponse,
      caseResponse,
      consultationResponse,
      lawyerResponse,
    ] = await Promise.all([
      fetch("/api/platform/lawyer-requests", { cache: "no-store" }),
      fetch("/api/platform/cases", { cache: "no-store" }),
      fetch("/api/platform/consultations", { cache: "no-store" }),
      fetch("/api/platform/lawyers", { cache: "no-store" }),
    ]);
    const requestBody = (await requestResponse.json()) as {
      requests?: HandoffRequest[];
      error?: string;
    };
    const caseBody = (await caseResponse.json()) as {
      cases?: CaseOption[];
      error?: string;
    };
    const consultationBody = (await consultationResponse.json()) as {
      entitlements?: WorkspaceEntitlements;
      error?: string;
    };
    const lawyerBody = (await lawyerResponse.json()) as {
      lawyers?: PublicLawyer[];
      error?: string;
    };
    if (
      !requestResponse.ok ||
      !caseResponse.ok ||
      !consultationResponse.ok ||
      !lawyerResponse.ok
    )
      throw new Error(
        requestBody.error ||
          caseBody.error ||
          consultationBody.error ||
          lawyerBody.error ||
          "Ошибка",
      );
    const nextCases = caseBody.cases || [];
    setCases(nextCases);
    setCaseId((current) => current || nextCases[0]?.id || "");
    setRequests(requestBody.requests || []);
    setEntitlements(consultationBody.entitlements || null);
    const directory = lawyerBody.lawyers || [];
    setLawyers(directory);
    if (
      selectedLawyerId &&
      directory.some((lawyer) => lawyer.id === selectedLawyerId)
    )
      setLawyerProfileId(selectedLawyerId);
  }, [selectedLawyerId]);

  useEffect(() => {
    void load().catch((value) =>
      setError(value instanceof Error ? value.message : String(value)),
    );
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entitlements?.lawyerHandoff || !consent) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/platform/lawyer-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({
          caseId: caseId || undefined,
          lawyerProfileId: lawyerProfileId || undefined,
          anonymizedSummary: summary,
          serviceCode,
          preferredFormat,
          proposedStartsAt: proposedStartsAt
            ? new Date(proposedStartsAt).toISOString()
            : undefined,
          consent: true,
          locale,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      setSummary("");
      setProposedStartsAt("");
      setConsent(false);
      setMessage(
        ru
          ? "Заявка сохранена. До назначения юриста материалы дела не раскрываются."
          : "So‘rov saqlandi. Yurist tayinlanmaguncha ish materiallari oshkor qilinmaydi.",
      );
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  async function respondToOffer(
    item: HandoffRequest,
    decision: "accepted" | "declined",
  ) {
    if (!item.offerId || item.offerStatus !== "proposed") return;
    setAccessActionId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(item.id)}/offer`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({ decision, locale }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      setMessage(
        decision === "accepted"
          ? ru
            ? "Условия юриста приняты. Оплата в платформе пока не выполняется."
            : "Yurist shartlari qabul qilindi. Platformada to‘lov hozircha amalga oshirilmaydi."
          : ru
            ? "Условия отклонены. Юрист сможет направить обновлённое предложение."
            : "Shartlar rad etildi. Yurist yangilangan taklif yuborishi mumkin.",
      );
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setAccessActionId("");
    }
  }
  async function updateCaseAccess(
    item: HandoffRequest,
    action: "grant" | "revoke",
  ) {
    if (action === "grant" && !accessConsents[item.id]) return;
    setAccessActionId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(item.id)}/access-grant`,
        {
          method: action === "grant" ? "POST" : "DELETE",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          ...(action === "grant"
            ? { body: JSON.stringify({ consent: true, locale }) }
            : {}),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      setAccessConsents((current) => ({ ...current, [item.id]: false }));
      setMessage(
        action === "grant"
          ? ru
            ? "Доступ юристу предоставлен. Это действие зафиксировано в журнале дела."
            : "Yuristga ruxsat berildi. Bu harakat ish jurnalida qayd etildi."
          : ru
            ? "Доступ юриста к делу отозван. Это действие зафиксировано в журнале дела."
            : "Yuristning ishga ruxsati bekor qilindi. Bu harakat ish jurnalida qayd etildi.",
      );
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setAccessActionId("");
    }
  }

  const specialties = [
    ...new Set(lawyers.flatMap((lawyer) => lawyer.specialties)),
  ].sort();
  const languages = [
    ...new Set(lawyers.flatMap((lawyer) => lawyer.languages)),
  ].sort();
  const filteredLawyers = lawyers.filter(
    (lawyer) =>
      lawyer.canReceiveRequests &&
      (!specialtyFilter || lawyer.specialties.includes(specialtyFilter)) &&
      (!languageFilter || lawyer.languages.includes(languageFilter)) &&
      (!minimumExperience ||
        (lawyer.experienceYears ?? -1) >= Number(minimumExperience)) &&
      (!minimumRating ||
        (lawyer.rating.overallAverage ?? 0) >= Number(minimumRating)) &&
      (!availabilityFilter ||
        lawyer.availabilityStatus === availabilityFilter) &&
      (!advocateFilter || lawyer.advocateStatus === advocateFilter) &&
      (!firmFilter ||
        lawyer.firmName
          ?.toLocaleLowerCase()
          .includes(firmFilter.toLocaleLowerCase())),
  );

  return (
    <section
      className="lawyer-handoff"
      aria-labelledby="lawyer-handoff-heading"
    >
      <div className="lawyer-handoff-heading">
        <UserRoundCheck aria-hidden="true" />
        <div>
          <h2 id="lawyer-handoff-heading">
            {ru ? "Передать дело юристу" : "Ishni yuristga topshirish"}
          </h2>
          <p>
            {ru
              ? "Сначала создаётся только анонимизированная заявка. Полный доступ к делу возможен лишь после conflict check и вашего отдельного подтверждения."
              : "Avval faqat anonimlashtirilgan so‘rov yaratiladi. Ishga to‘liq ruxsat faqat manfaatlar to‘qnashuvi tekshiruvi va sizning alohida tasdiqingizdan keyin beriladi."}
          </p>
        </div>
      </div>
      {error && (
        <p className="plan-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="lawyer-handoff-success" role="status">
          <ShieldCheck aria-hidden="true" />
          {message}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {ru ? "Дело" : "Ish"}
          <select
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            disabled={!entitlements?.lawyerHandoff || busy}
          >
            <option value="">
              {ru ? "Новое приватное дело из заявки" : "So‘rovdan yangi maxfiy ish"}
            </option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <small>
            {caseId
              ? (ru
                ? "Заявка будет связана с выбранным делом."
                : "So‘rov tanlangan ish bilan bog‘lanadi.")
              : (ru
                ? "Мы создадим приватную карточку дела из этой заявки. Юрист не получит доступ до conflict check и вашего отдельного согласия."
                : "Ushbu so‘rovdan maxfiy ish kartasi yaratiladi. Yurist manfaatlar to‘qnashuvi tekshiruvi va alohida roziligingizgacha ruxsat olmaydi.")}
          </small>
        </label>
        <fieldset className="lawyer-directory-filters">
          <legend>
            {ru ? "Фильтры каталога юристов" : "Yuristlar katalogi filtrlari"}
          </legend>
          <label>
            {ru ? "Специализация" : "Mutaxassislik"}
            <select
              value={specialtyFilter}
              onChange={(event) => setSpecialtyFilter(event.target.value)}
            >
              <option value="">{ru ? "Все" : "Barchasi"}</option>
              {specialties.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ru ? "Язык" : "Til"}
            <select
              value={languageFilter}
              onChange={(event) => setLanguageFilter(event.target.value)}
            >
              <option value="">{ru ? "Все" : "Barchasi"}</option>
              {languages.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ru ? "Стаж от" : "Tajriba, kamida"}
            <select
              value={minimumExperience}
              onChange={(event) => setMinimumExperience(event.target.value)}
            >
              <option value="">{ru ? "Любой" : "Istalgan"}</option>
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
            </select>
          </label>
          <label>
            {ru ? "Рейтинг от" : "Reyting, kamida"}
            <select
              value={minimumRating}
              onChange={(event) => setMinimumRating(event.target.value)}
            >
              <option value="">{ru ? "Любой" : "Istalgan"}</option>
              <option value="4">4/5</option>
              <option value="4.5">4.5/5</option>
            </select>
          </label>
          <label>
            {ru ? "Доступность" : "Mavjudlik"}
            <select
              value={availabilityFilter}
              onChange={(event) => setAvailabilityFilter(event.target.value)}
            >
              <option value="">{ru ? "Любая" : "Istalgan"}</option>
              <option value="available">{ru ? "Доступен" : "Mavjud"}</option>
              <option value="limited">
                {ru ? "Ограниченная" : "Cheklangan"}
              </option>
              <option value="unavailable">
                {ru ? "Недоступен" : "Mavjud emas"}
              </option>
            </select>
          </label>
          <label>
            {ru ? "Статус адвоката" : "Advokat maqomi"}
            <select
              value={advocateFilter}
              onChange={(event) => setAdvocateFilter(event.target.value)}
            >
              <option value="">{ru ? "Любой" : "Istalgan"}</option>
              <option value="verified">
                {ru ? "Подтверждён JURO" : "JURO tasdiqlagan"}
              </option>
              <option value="declared">{ru ? "Заявлен" : "Bildirilgan"}</option>
            </select>
          </label>
          <label>
            {ru ? "Фирма" : "Firma"}
            <input
              value={firmFilter}
              maxLength={180}
              onChange={(event) => setFirmFilter(event.target.value)}
            />
          </label>
        </fieldset>
        <label>
          {ru ? "Юрист" : "Yurist"}
          <select
            value={lawyerProfileId}
            onChange={(event) => setLawyerProfileId(event.target.value)}
            disabled={!entitlements?.lawyerHandoff || busy}
          >
            <option value="">
              {ru ? "Назначить через JURO" : "JURO orqali tayinlash"}
            </option>
            {filteredLawyers.map((lawyer) => (
              <option key={lawyer.id} value={lawyer.id}>
                {lawyer.displayName}
                {lawyer.specialties.length
                  ? ` — ${lawyer.specialties.join(", ")}`
                  : ""}
                {lawyer.rating.reviewCount
                  ? ` · ${lawyer.rating.overallAverage?.toFixed(1)}/5 (${lawyer.rating.reviewCount})`
                  : ""}
              </option>
            ))}
          </select>
          <small>
            {ru
              ? `Найдено: ${filteredLawyers.length}`
              : `Topildi: ${filteredLawyers.length}`}
          </small>
        </label>
        <label>
          {ru ? "Услуга" : "Xizmat"}
          <select
            required
            value={serviceCode}
            onChange={(event) => setServiceCode(event.target.value)}
            disabled={!entitlements?.lawyerHandoff || busy}
          >
            <option value="initial_consultation">{ru ? "Первичная консультация" : "Dastlabki maslahat"}</option>
            <option value="document_review">{ru ? "Проверка документа" : "Hujjatni tekshirish"}</option>
            <option value="case_strategy">{ru ? "Стратегия по делу" : "Ish strategiyasi"}</option>
            <option value="representation">{ru ? "Представительство" : "Vakillik"}</option>
            <option value="other">{ru ? "Другая юридическая помощь" : "Boshqa yuridik yordam"}</option>
          </select>
        </label>
        <label>
          {ru ? "Предпочтительный формат" : "Afzal format"}
          <select
            required
            value={preferredFormat}
            onChange={(event) => setPreferredFormat(event.target.value)}
            disabled={!entitlements?.lawyerHandoff || busy}
          >
            <option value="video">{ru ? "Видеоконсультация" : "Video maslahat"}</option>
            <option value="phone">{ru ? "Телефон" : "Telefon"}</option>
            <option value="office">{ru ? "Очно" : "Ofisda"}</option>
            <option value="chat">{ru ? "Чат" : "Chat"}</option>
          </select>
        </label>
        <label>
          {ru ? "Предложить дату и время" : "Sana va vaqtni taklif qilish"}
          <input
            type="datetime-local"
            value={proposedStartsAt}
            onChange={(event) => setProposedStartsAt(event.target.value)}
            disabled={!entitlements?.lawyerHandoff || busy}
          />
        </label>
        <label>
          {ru
            ? "Анонимизированное описание для conflict check"
            : "Manfaatlar to‘qnashuvi tekshiruvi uchun anonimlashtirilgan tavsif"}
          <textarea
            value={summary}
            minLength={20}
            maxLength={2000}
            required
            disabled={!entitlements?.lawyerHandoff || busy}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={
              ru
                ? "Без имён, реквизитов и содержания документов"
                : "Ismlar, rekvizitlar va hujjat mazmunisiz"
            }
          />
        </label>
        <label className="consult-consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={!entitlements?.lawyerHandoff || busy}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            {ru
              ? "Подтверждаю создание анонимизированной заявки; доступ к делу пока не предоставляется."
              : "Anonimlashtirilgan so‘rov yaratilishini tasdiqlayman; ishga ruxsat hozircha berilmaydi."}
          </span>
        </label>
        <button
          type="submit"
          disabled={
            !entitlements?.lawyerHandoff ||
            summary.trim().length < 20 ||
            !consent ||
            busy
          }
        >
          {busy ? <LoaderCircle className="spin" /> : null}
          {ru ? "Создать заявку" : "So‘rov yaratish"}
        </button>
      </form>
      {requests.length > 0 && (
        <div className="lawyer-handoff-list">
          <h3>
            {ru ? "Мои заявки к юристу" : "Yuristga yuborgan so‘rovlarim"}
          </h3>
          {requests.map((item) => (
            <div key={item.id}>
              <strong>{handoffStatus(item.status, ru)}</strong>
              <span>
                {item.lawyerName ||
                  (ru
                    ? "Ожидается назначение JURO"
                    : "JURO tayinlashi kutilmoqda")}
              </span>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
                  dateStyle: "medium",
                  timeZone: "Asia/Tashkent",
                }).format(new Date(item.createdAt))}
              </time>
              <div className="lawyer-request-intake">
                <span>{serviceLabel(item.serviceCode, ru)}</span>
                <span>{formatLabel(item.preferredFormat, ru)}</span>
                {item.proposedStartsAt && <time dateTime={item.proposedStartsAt}>{formatRequestDate(item.proposedStartsAt, ru)}</time>}
              </div>
              {item.status === "awaiting_user_consent" && (
                <div className="lawyer-access-action">
                  <label className="consult-consent">
                    <input
                      type="checkbox"
                      checked={Boolean(accessConsents[item.id])}
                      disabled={accessActionId === item.id}
                      onChange={(event) =>
                        setAccessConsents((current) => ({
                          ...current,
                          [item.id]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {ru
                        ? "Подтверждаю передачу выбранному юристу материалов этого дела и взаимное раскрытие наших номеров телефона для обычного звонка. Доступ можно отозвать в любой момент."
                        : "Tanlangan yuristga ushbu ish materiallarini berish va oddiy qo‘ng‘iroq uchun telefon raqamlarimizni o‘zaro ko‘rsatishni tasdiqlayman. Ruxsatni istalgan paytda bekor qilish mumkin."}
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={
                      !accessConsents[item.id] || accessActionId === item.id
                    }
                    onClick={() => void updateCaseAccess(item, "grant")}
                  >
                    {accessActionId === item.id ? (
                      <LoaderCircle className="spin" />
                    ) : null}
                    {ru ? "Предоставить доступ" : "Ruxsat berish"}
                  </button>
                </div>
              )}
              {item.activeGrantId && (
                <div className="lawyer-access-action">
                  <p>
                    {ru
                      ? "У юриста есть доступ к материалам этого дела."
                      : "Yurist ushbu ish materiallariga ruxsatga ega."}
                  </p>
                  <LawyerConsultationPanel
                    requestId={item.id}
                    locale={locale}
                    role="client"
                  />
                  <LawyerDocumentRequests requestId={item.id} locale={locale} role="client" />
                  <ClientServiceProposals
                    locale={locale}
                    accountType={accountType}
                    workspaceId={workspaceId}
                    caseId={item.caseId}
                  />
                  {item.offerId && (
                    <div className="lawyer-offer-card">
                      <strong>{offerLabel(item.offerStatus, ru)}</strong>
                      <p>{item.offerScopeDescription}</p>
                      <p>
                        {ru ? "Стоимость: " : "Narx: "}
                        {item.offerPriceDescription}
                      </p>
                      <p>
                        {ru ? "Срок: " : "Muddat: "}
                        {item.offerDurationDescription}
                      </p>
                      {item.offerStatus === "proposed" && (
                        <div className="lawyer-offer-actions">
                          <button
                            type="button"
                            disabled={accessActionId === item.id}
                            onClick={() =>
                              void respondToOffer(item, "accepted")
                            }
                          >
                            {ru
                              ? "Принять внешние условия"
                              : "Tashqi shartlarni qabul qilish"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={accessActionId === item.id}
                            onClick={() =>
                              void respondToOffer(item, "declined")
                            }
                          >
                            {ru ? "Отклонить" : "Rad etish"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <LawyerPhoneContact requestId={item.id} locale={locale} />
                  <button
                    type="button"
                    className="secondary"
                    disabled={accessActionId === item.id}
                    onClick={() => void updateCaseAccess(item, "revoke")}
                  >
                    {accessActionId === item.id ? (
                      <LoaderCircle className="spin" />
                    ) : null}
                    {ru ? "Отозвать доступ" : "Ruxsatni bekor qilish"}
                  </button>
                </div>
              )}
              {item.activeGrantId && (
                <LawyerRequestMessages requestId={item.id} locale={locale} />
              )}
              {item.status === "completed" && (
                <LawyerReviewForm requestId={item.id} locale={locale} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function offerLabel(status: string | null | undefined, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    proposed: ["Предложение ожидает решения", "Taklif qarorni kutmoqda"],
    accepted: ["Условия приняты", "Shartlar qabul qilindi"],
    declined: ["Условия отклонены", "Shartlar rad etildi"],
  };
  return labels[status || ""]?.[ru ? 0 : 1] || status || "";
}

function handoffStatus(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    unassigned: ["Ожидается назначение", "Tayinlash kutilmoqda"],
    conflict_check_pending: [
      "Проверка конфликта",
      "Manfaatlar to‘qnashuvi tekshirilmoqda",
    ],
    awaiting_user_consent: [
      "Нужно ваше подтверждение",
      "Sizning tasdig‘ingiz kerak",
    ],
    access_granted: ["Доступ предоставлен", "Ruxsat berildi"],
    access_revoked: ["Доступ отозван", "Ruxsat bekor qilindi"],
    conflict_declined: ["Конфликт интересов", "Manfaatlar to‘qnashuvi"],
  };
  return labels[status]?.[ru ? 0 : 1] || status;
}
