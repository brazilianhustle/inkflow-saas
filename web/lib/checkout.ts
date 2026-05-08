// Checkout wrapper para POST /api/public-start.
//
// Replica EXATAMENTE o fluxo da legacy index.html (linhas 731-753):
//   - Payload: { plano: "individual" | "estudio" | "premium" | "trial" }
//     (Nota: legacy usa "plano" em PT, NÃO "plan". Plano "trial" é distinto dos pagos.)
//   - Response esperada: { url: string, error?: string }
//   - Sucesso: window.location.href = data.url (full redirect, não nova aba)
//   - Falha: alert PT-BR + console.error com '[inkflow]' prefix
//   - Loading state era controlado por classe CSS no btn da legacy; aqui delegamos
//     ao componente React (que pode usar useState antes/depois de chamar startCheckout).
//
// Diferenças vs template do plan original:
//   - Plan estava como "vip" no template; legacy/copy usa "premium" → mantemos "premium".
//   - Template enviava { plan }; legacy usa { plano } → mantemos "plano" pra compat com /api/public-start.
//   - Template lia data.checkout_url; legacy lê data.url → mantemos "url".

export type Plan = "individual" | "estudio" | "premium" | "trial";

export async function startCheckout(plano: Plan = "individual"): Promise<void> {
  try {
    const res = await fetch("/api/public-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plano }),
    });
    const data: { url?: string; error?: string } = await res.json();
    if (!res.ok || !data.url) {
      throw new Error(data.error || "Erro ao iniciar cadastro");
    }
    window.location.href = data.url;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[inkflow] start checkout error:", message);
    alert(
      "Não foi possível iniciar o cadastro agora. Tente novamente em alguns instantes ou entre em contato pelo WhatsApp."
    );
  }
}
