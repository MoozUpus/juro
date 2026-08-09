import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span>404</span>
        <h1>Страница не найдена</h1>
        <p>Проверьте адрес или вернитесь на главную страницу JURO. Сохранённые данные вашего аккаунта не затронуты.</p>
        <Link href="/ru">Вернуться на главную</Link>
      </section>
    </main>
  );
}
