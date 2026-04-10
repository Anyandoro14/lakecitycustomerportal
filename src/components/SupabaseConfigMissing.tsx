/**
 * Shown when VITE_SUPABASE_* vars were not injected at build time.
 * Without this, createClient would throw during the first import and the browser would show a blank page.
 */
export default function SupabaseConfigMissing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6 text-slate-900">
      <div className="max-w-lg rounded-lg border border-slate-200 bg-white p-8 shadow-sm space-y-4">
        <h1 className="text-xl font-semibold">App configuration incomplete</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          This build is missing Supabase environment variables. The JavaScript bundle cannot connect to
          your project until they are set at <strong>build time</strong> (Vite embeds{" "}
          <code className="rounded bg-slate-100 px-1">VITE_*</code> into the client).
        </p>
        <p className="text-sm font-medium">Required in Lovable / hosting env:</p>
        <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
          <li>
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> — Project URL (Settings →
            API)
          </li>
          <li>
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> — anon public
            key (or legacy <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>)
          </li>
        </ul>
        <p className="text-sm text-slate-600">
          After saving variables, trigger a <strong>new production build and publish</strong>. Then hard
          refresh or clear site data if you still see an old blank page (PWA cache).
        </p>
      </div>
    </div>
  );
}
