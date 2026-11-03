import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · Toque",
};

// Public page (excluded in src/proxy.ts): Google's OAuth consent screen needs
// a privacy policy URL before the app can be published.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[17px] leading-relaxed">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">
        Privacy policy
      </h1>
      <p className="mb-8 text-gray-500">
        Toque · last updated: October 2026
      </p>

      <section className="space-y-4">
        <p>
          Toque is a personal app, used only by its author, for managing
          household tasks with NFC tags. It has no other users, shows no
          advertising and does not sell or share data with third parties.
        </p>

        <h2 className="pt-4 text-xl font-semibold">What data it stores</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            The tasks, the tags and the history of when each tag was scanned.
          </li>
          <li>
            The app settings (schedules, notification topic).
          </li>
          <li>
            If Google Calendar is connected: the Google account email and the
            access tokens, stored encrypted.
          </li>
        </ul>

        <h2 className="pt-4 text-xl font-semibold">Google Calendar</h2>
        <p>
          Toque only asks for access to create and manage its own calendar
          called &ldquo;Toque&rdquo;. It does not read or change any other
          calendar or event. Data obtained from Google APIs is used only to
          keep that calendar in sync with the tasks, in compliance with the
          Google API Services User Data Policy, including the Limited Use
          requirements.
        </p>
        <p>
          Disconnecting Google in Settings deletes the &ldquo;Toque&rdquo;
          calendar, revokes access and removes the stored tokens.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Where the data is kept</h2>
        <p>
          In a Postgres database (Neon) in the European Union, accessed by
          the app hosted on Vercel. Notifications are sent through the ntfy.sh
          service.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Contact</h2>
        <p>
          For any question, contact the author through the support email
          listed with Google.
        </p>
      </section>
    </main>
  );
}
