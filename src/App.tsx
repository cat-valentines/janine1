// Стартовый экран твоего проекта — пока он простой и пустой.
// Когда понадобятся вход и база данных, готовые примеры уже лежат рядом:
//   src/components/Auth.tsx      — вход / регистрация
//   src/components/Entries.tsx   — чтение и запись в базу
// Просто попроси Codex подключить их на экран.

export default function App() {
  return (
    <main className="container">
      <section className="hello">
        <h1>Hi there! 😺</h1>
        <p>This is my practice!</p>
        <p className="hello__hint">
          Open codex.
        </p>
      </section>
    </main>
  );
}
