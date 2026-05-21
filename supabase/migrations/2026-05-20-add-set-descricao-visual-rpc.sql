-- set_descricao_visual: grava message.descricao_visual targeted (jsonb_set) sem
-- clobber das demais chaves do `message` (preserva media_base64/content).
-- Memoria de recall da arte de referencia (feature visao-fotos-agente Fase A).
-- Mesmo padrao/seguranca do zerar_media_base64 (SECURITY DEFINER + grants restritos):
-- coexiste com zerar_media_base64 sem race read-modify-write porque AMBAS usam
-- jsonb_set targeted em chaves disjuntas.
CREATE OR REPLACE FUNCTION public.set_descricao_visual(p_msg_id BIGINT, p_descricao TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversa_mensagens
  SET message = jsonb_set(message, '{descricao_visual}', to_jsonb(p_descricao))
  WHERE id = p_msg_id;
$$;

-- Supabase concede EXECUTE a anon/authenticated por default privileges.
-- Como a funcao e SECURITY DEFINER (bypassa RLS), revogar de TODOS menos service_role
-- pra evitar que qualquer holder de anon key escreva descricao em mensagens arbitrarias.
REVOKE ALL ON FUNCTION public.set_descricao_visual(BIGINT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_descricao_visual(BIGINT, TEXT) TO service_role;
