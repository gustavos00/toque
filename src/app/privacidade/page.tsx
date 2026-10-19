import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade · Toque",
};

// Public page (excluded in src/proxy.ts): Google's OAuth consent screen needs
// a privacy policy URL before the app can be published.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[17px] leading-relaxed">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">
        Política de privacidade
      </h1>
      <p className="mb-8 text-gray-500">
        Toque · última atualização: outubro de 2026
      </p>

      <section className="space-y-4">
        <p>
          O Toque é uma aplicação pessoal, usada apenas pelo seu autor, para
          gerir tarefas da casa com tags NFC. Não tem outros utilizadores, não
          mostra publicidade e não vende nem partilha dados com terceiros.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Que dados guarda</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            As tarefas, as tags e o histórico de quando cada tag foi lida.
          </li>
          <li>
            As definições da aplicação (horários, tópico de notificações).
          </li>
          <li>
            Se o Google Calendar for ligado: o email da conta Google e os tokens
            de acesso, guardados cifrados.
          </li>
        </ul>

        <h2 className="pt-4 text-xl font-semibold">Google Calendar</h2>
        <p>
          O Toque pede apenas acesso para criar e gerir um calendário próprio
          chamado &ldquo;Toque&rdquo;. Não lê nem altera nenhum outro calendário
          ou evento. Os dados obtidos das APIs Google são usados só para manter
          esse calendário sincronizado com as tarefas, em conformidade com a
          Google API Services User Data Policy, incluindo os requisitos de
          utilização limitada.
        </p>
        <p>
          Desligar o Google nas Definições apaga o calendário
          &ldquo;Toque&rdquo;, revoga o acesso e remove os tokens guardados.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Onde ficam os dados</h2>
        <p>
          Numa base de dados Postgres (Neon) na União Europeia, acedida pela
          aplicação alojada no Vercel. As notificações são enviadas através do
          serviço ntfy.sh.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Contacto</h2>
        <p>
          Para qualquer questão, contacta o autor através do email de suporte
          indicado no Google.
        </p>
      </section>
    </main>
  );
}
