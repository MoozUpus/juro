import type { Metadata } from "next";

type AuthMetadataLocale = "ru" | "uz" | "en";
type AuthMetadataMode = "login" | "register";

const metadataCopy = {
  ru: {
    login: {
      title: "Вход",
      description: "Войдите в защищённое пространство JURO по электронной почте и паролю.",
    },
    register: {
      title: "Создать аккаунт",
      description: "Создайте аккаунт JURO и подтвердите адрес электронной почты.",
    },
  },
  uz: {
    login: {
      title: "Kirish",
      description: "Email va parol orqali JURO himoyalangan makoniga kiring.",
    },
    register: {
      title: "Hisob yaratish",
      description: "JURO hisobini yarating va elektron pochta manzilingizni tasdiqlang.",
    },
  },
  en: {
    login: {
      title: "Sign in",
      description: "Sign in to your secure JURO workspace with your email and password.",
    },
    register: {
      title: "Create an account",
      description: "Create your JURO account and confirm your email address.",
    },
  },
} as const;

export function authPageMetadata(
  locale: AuthMetadataLocale,
  mode: AuthMetadataMode,
): Metadata {
  return metadataCopy[locale][mode];
}
