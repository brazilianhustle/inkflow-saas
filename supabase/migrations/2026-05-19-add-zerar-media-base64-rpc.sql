-- supabase/migrations/2026-05-19-add-zerar-media-base64-rpc.sql
-- RPC pra zerar message.media_base64 in-place sem race read-modify-write.
-- Chamado pelo pipeline (pos-handoff) e pela tool enviar-orcamento-tatuador (pos-upload).

CREATE OR REPLACE FUNCTION public.zerar_media_base64(p_msg_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversa_mensagens
  SET message = jsonb_set(message, '{media_base64}', '""')
  WHERE id = p_msg_id;
$$;

-- Supabase concede EXECUTE a anon/authenticated por default privileges.
-- Como a funcao e SECURITY DEFINER (bypassa RLS), revogar de TODOS menos service_role
-- pra evitar que qualquer holder de anon key zere base64 de mensagens arbitrarias via PostgREST.
REVOKE ALL ON FUNCTION public.zerar_media_base64(BIGINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zerar_media_base64(BIGINT) TO service_role;
