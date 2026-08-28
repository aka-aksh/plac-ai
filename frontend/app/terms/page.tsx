import Link from "next/link";

export const metadata = {
  title: "Terms of Service | PlacementAI",
  description: "Terms of Service for placementai.online",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#070b14] px-6 py-12 text-slate-200 sm:py-20">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition-colors hover:text-emerald-200">
          <span aria-hidden="true">←</span> Back to PlacementAI
        </Link>
        <header className="mt-10 border-b border-white/10 pb-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">placementai.online</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Terms of Service</h1>
          <p className="mt-4 text-sm text-slate-400">Effective date: August 29, 2026</p>
        </header>

        <div className="space-y-9 pt-10 text-sm leading-7 text-slate-300 sm:text-base">
          <p>These Terms of Service govern your use of PlacementAI at placementai.online. By accessing or using the service, you agree to these terms.</p>

          <section><h2 className="text-xl font-bold text-white">The service</h2><p className="mt-3">PlacementAI is a personal placement-organization tool. It helps you identify, summarize, organize, and track opportunities from information you choose to connect. It does not apply to jobs on your behalf, guarantee the accuracy of extracted information, or guarantee an interview, offer, or placement outcome.</p></section>

          <section><h2 className="text-xl font-bold text-white">Your account and Google connection</h2><p className="mt-3">You are responsible for safeguarding your account and for activities performed through it. If you connect Google, you authorize PlacementAI to use the permissions you approve solely to operate the service. You may disconnect or revoke Google access at any time. You must only connect an account and data you are authorized to use.</p></section>

          <section><h2 className="text-xl font-bold text-white">Acceptable use</h2><p className="mt-3">Do not misuse the service, interfere with its operation, attempt unauthorized access, upload harmful content, scrape or reverse engineer it, or use it in violation of applicable law, university rules, employer rules, or third-party terms. Do not rely on PlacementAI as the only source of information for deadlines or eligibility; always verify details with the employer or official placement channel.</p></section>

          <section><h2 className="text-xl font-bold text-white">Your content</h2><p className="mt-3">You retain ownership of information you provide or connect. You grant PlacementAI a limited permission to process that information only to provide, maintain, and secure the service. You are responsible for ensuring that your content and use of the service comply with applicable law.</p></section>

          <section><h2 className="text-xl font-bold text-white">Availability and third parties</h2><p className="mt-3">The service may change, be interrupted, or be discontinued. PlacementAI depends on third-party services, including Google, Supabase, Vercel, and AI providers; their availability and terms may affect the service. We are not responsible for third-party services or content.</p></section>

          <section><h2 className="text-xl font-bold text-white">Disclaimers and liability</h2><p className="mt-3">The service is provided on an “as is” and “as available” basis to the extent permitted by law. PlacementAI disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement. To the extent permitted by law, PlacementAI will not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the service.</p></section>

          <section><h2 className="text-xl font-bold text-white">Changes and contact</h2><p className="mt-3">We may update these terms by posting a revised version with a new effective date. Continued use after the update means you accept the revised terms. For questions, contact <a className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200" href="mailto:legal@placementai.online">legal@placementai.online</a>.</p></section>
        </div>
      </article>
    </main>
  );
}
