// Стартовый экран твоего проекта — пока он простой и пустой.
// Когда понадобятся вход и база данных, готовые примеры уже лежат рядом:
//   src/components/Auth.tsx      — вход / регистрация
//   src/components/Entries.tsx   — чтение и запись в базу
// Просто попроси Codex подключить их на экран.

export default function App() {
  return (
    <main className="container">
      <section className="hello">
        <h1>Привет! 🚀</h1>
        <p>Это твой проект. Пока тут пусто — самое интересное впереди.</p>
        <p className="hello__hint">
          Открой Codex и опиши свою идею — этот экран станет твоим приложением.
        </p>
      </section>
    </main>
  );
}
