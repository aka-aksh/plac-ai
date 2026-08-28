import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | PlacementAI",
  description: "Privacy Policy for placementai.online",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#070b14] px-6 py-12 text-slate-200 sm:py-20">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition-colors hover:text-emerald-200">
          <span aria-hidden="true">←</span> Back to PlacementAI
        </Link>
        <header className="mt-10 border-b border-white/10 pb-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">placementai.online</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-sm text-slate-400">Effective date: August 29, 2026</p>
        </header>

        <div className="space-y-9 pt-10 text-sm leading-7 text-slate-300 sm:text-base">
          <p>PlacementAI helps students organize placement opportunities from Gmail. This policy explains what information we handle, why we use it, and the choices available to you.</p>

          <section><h2 className="text-xl font-bold text-white">Information we collect</h2><p className="mt-3">We collect the information you provide in your PlacementAI profile, including contact and academic details. When you connect Google, we receive your Google account identifier and Gmail data covered by the read-only permission you approve, such as placement-related message metadata, message text, and supported attachment text. We also process opportunity details generated from those messages.</p></section>

          <section><h2 className="text-xl font-bold text-white">How we use information</h2><p className="mt-3">We use this information to authenticate you, sync and organize relevant placement emails, identify deadlines and opportunities, match opportunities against your profile, improve the reliability of the service, and protect the service from misuse. We do not use your Gmail content to sell advertising.</p></section>

          <section><h2 className="text-xl font-bold text-white">AI processing and service providers</h2><p className="mt-3">PlacementAI may send relevant email and attachment text to its AI processing provider to classify messages and extract opportunity information. We also rely on infrastructure and authentication providers, including Vercel, Supabase, Google, and Google Gemini, to operate the service. Those providers process information only as needed to provide their services, subject to their applicable terms and privacy policies.</p></section>

          <section><h2 className="text-xl font-bold text-white">Security and retention</h2><p className="mt-3">Gmail access and refresh tokens are encrypted before storage. We use reasonable technical and organizational safeguards, but no online system is completely secure. We retain account and synced placement data while your account is active or as needed to provide the service, resolve disputes, comply with law, and enforce our agreements.</p></section>

          <section><h2 className="text-xl font-bold text-white">Your choices</h2><p className="mt-3">You can revoke PlacementAI&apos;s Google access through your Google Account settings. Revoking access stops future Gmail access, though previously synced information may remain in PlacementAI until it is deleted. You may request access, correction, or deletion of your account data by contacting us.</p></section>

          <section><h2 className="text-xl font-bold text-white">Changes and contact</h2><p className="mt-3">We may update this policy when our practices or legal obligations change. We will post the updated effective date on this page. For privacy questions or requests, contact <a className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200" href="mailto:privacy@placementai.online">privacy@placementai.online</a>.</p></section>
        </div>
      </article>
    </main>
  );
}
