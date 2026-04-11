export async function onRequest(context) {
  // Captura o token da URL /start/TOKEN
  const token = context.params.token.join('');

  if (!token) {
    return new Response('Token não informado', { status: 400 });
  }

  // Redireciona para o onboarding com o token real
  const destination = `https://inkflowbrasil.com/onboarding?token=${encodeURIComponent(token)}`;
  return Response.redirect(destination, 302);
}
