import assert from "node:assert/strict";
import test from "node:test";
import { authPageMetadata } from "../app/_auth/auth-metadata";

test("auth page metadata is localized for login and registration", () => {
  assert.deepEqual(authPageMetadata("ru", "login"), {
    title: "Вход",
    description: "Войдите в защищённое пространство JURO по электронной почте и паролю.",
  });
  assert.deepEqual(authPageMetadata("uz", "login"), {
    title: "Kirish",
    description: "Email va parol orqali JURO himoyalangan makoniga kiring.",
  });
  assert.deepEqual(authPageMetadata("en", "login"), {
    title: "Sign in",
    description: "Sign in to your secure JURO workspace with your email and password.",
  });
  assert.deepEqual(authPageMetadata("ru", "register"), {
    title: "Создать аккаунт",
    description: "Создайте аккаунт JURO и подтвердите адрес электронной почты.",
  });
  assert.deepEqual(authPageMetadata("uz", "register"), {
    title: "Hisob yaratish",
    description: "JURO hisobini yarating va elektron pochta manzilingizni tasdiqlang.",
  });
  assert.deepEqual(authPageMetadata("en", "register"), {
    title: "Create an account",
    description: "Create your JURO account and confirm your email address.",
  });
});
