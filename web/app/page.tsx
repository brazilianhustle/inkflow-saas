export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-6">
      <div className="max-w-2xl text-center space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Bootstrap completo
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          <span className="text-emerald-400">Ink</span>Flow{" "}
          <span className="text-zinc-500">v2</span>
        </h1>

        <p className="text-lg text-zinc-400 leading-relaxed">
          Hello Next.js 16. Ambiente de desenvolvimento configurado com TypeScript,
          Tailwind CSS 4 e App Router rodando localmente.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <Stat label="Next.js" value="16" />
          <Stat label="React" value="19" />
          <Stat label="Tailwind" value="4" />
          <Stat label="TypeScript" value="5" />
        </div>

        <p className="text-sm text-zinc-600 pt-8">
          Próximo passo: recriar a landing page do InkFlow nessa stack.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3">
      <div className="text-2xl font-bold text-emerald-400">{value}</div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}
