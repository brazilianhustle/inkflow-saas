import { onRequest as __api_cron_expira_holds_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/cron/expira-holds.js"
import { onRequest as __api_tools_acionar_handoff_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/acionar-handoff.js"
import { onRequest as __api_tools_calcular_orcamento_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/calcular-orcamento.js"
import { onRequest as __api_tools_consultar_horarios_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/consultar-horarios.js"
import { onRequest as __api_tools_enviar_portfolio_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/enviar-portfolio.js"
import { onRequest as __api_tools_gerar_link_sinal_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/gerar-link-sinal.js"
import { onRequest as __api_tools_preview_orcamento_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/preview-orcamento.js"
import { onRequest as __api_tools_prompt_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/prompt.js"
import { onRequest as __api_tools_reservar_horario_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/reservar-horario.js"
import { onRequest as __api_tools_simular_conversa_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/tools/simular-conversa.js"
import { onRequest as __api_webhooks_mp_sinal_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/webhooks/mp-sinal.js"
import { onRequest as __api_cleanup_tenants_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/cleanup-tenants.js"
import { onRequest as __api_create_artist_invite_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/create-artist-invite.js"
import { onRequest as __api_create_onboarding_link_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/create-onboarding-link.js"
import { onRequest as __api_create_subscription_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/create-subscription.js"
import { onRequest as __api_create_tenant_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/create-tenant.js"
import { onRequest as __api_delete_tenant_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/delete-tenant.js"
import { onRequest as __api_evo_create_instance_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/evo-create-instance.js"
import { onRequest as __api_evo_pairing_code_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/evo-pairing-code.js"
import { onRequest as __api_evo_qr_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/evo-qr.js"
import { onRequest as __api_evo_status_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/evo-status.js"
import { onRequest as __api_get_studio_token_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/get-studio-token.js"
import { onRequest as __api_get_tenant_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/get-tenant.js"
import { onRequest as __api_mp_ipn_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/mp-ipn.js"
import { onRequest as __api_public_start_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/public-start.js"
import { onRequest as __api_request_studio_link_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/request-studio-link.js"
import { onRequest as __api_send_studio_email_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/send-studio-email.js"
import { onRequest as __api_send_whatsapp_link_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/send-whatsapp-link.js"
import { onRequest as __api_update_tenant_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/update-tenant.js"
import { onRequest as __api_validate_onboarding_key_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/validate-onboarding-key.js"
import { onRequest as __api_validate_studio_token_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/api/validate-studio-token.js"
import { onRequest as __start___token___js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/start/[[token]].js"
import { onRequest as ___middleware_js_onRequest } from "/Users/brazilianhustler/Documents/inkflow-saas/functions/_middleware.js"

export const routes = [
    {
      routePath: "/api/cron/expira-holds",
      mountPath: "/api/cron",
      method: "",
      middlewares: [],
      modules: [__api_cron_expira_holds_js_onRequest],
    },
  {
      routePath: "/api/tools/acionar-handoff",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_acionar_handoff_js_onRequest],
    },
  {
      routePath: "/api/tools/calcular-orcamento",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_calcular_orcamento_js_onRequest],
    },
  {
      routePath: "/api/tools/consultar-horarios",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_consultar_horarios_js_onRequest],
    },
  {
      routePath: "/api/tools/enviar-portfolio",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_enviar_portfolio_js_onRequest],
    },
  {
      routePath: "/api/tools/gerar-link-sinal",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_gerar_link_sinal_js_onRequest],
    },
  {
      routePath: "/api/tools/preview-orcamento",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_preview_orcamento_js_onRequest],
    },
  {
      routePath: "/api/tools/prompt",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_prompt_js_onRequest],
    },
  {
      routePath: "/api/tools/reservar-horario",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_reservar_horario_js_onRequest],
    },
  {
      routePath: "/api/tools/simular-conversa",
      mountPath: "/api/tools",
      method: "",
      middlewares: [],
      modules: [__api_tools_simular_conversa_js_onRequest],
    },
  {
      routePath: "/api/webhooks/mp-sinal",
      mountPath: "/api/webhooks",
      method: "",
      middlewares: [],
      modules: [__api_webhooks_mp_sinal_js_onRequest],
    },
  {
      routePath: "/api/cleanup-tenants",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_cleanup_tenants_js_onRequest],
    },
  {
      routePath: "/api/create-artist-invite",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_create_artist_invite_js_onRequest],
    },
  {
      routePath: "/api/create-onboarding-link",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_create_onboarding_link_js_onRequest],
    },
  {
      routePath: "/api/create-subscription",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_create_subscription_js_onRequest],
    },
  {
      routePath: "/api/create-tenant",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_create_tenant_js_onRequest],
    },
  {
      routePath: "/api/delete-tenant",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_delete_tenant_js_onRequest],
    },
  {
      routePath: "/api/evo-create-instance",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_evo_create_instance_js_onRequest],
    },
  {
      routePath: "/api/evo-pairing-code",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_evo_pairing_code_js_onRequest],
    },
  {
      routePath: "/api/evo-qr",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_evo_qr_js_onRequest],
    },
  {
      routePath: "/api/evo-status",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_evo_status_js_onRequest],
    },
  {
      routePath: "/api/get-studio-token",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_get_studio_token_js_onRequest],
    },
  {
      routePath: "/api/get-tenant",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_get_tenant_js_onRequest],
    },
  {
      routePath: "/api/mp-ipn",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_mp_ipn_js_onRequest],
    },
  {
      routePath: "/api/public-start",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_public_start_js_onRequest],
    },
  {
      routePath: "/api/request-studio-link",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_request_studio_link_js_onRequest],
    },
  {
      routePath: "/api/send-studio-email",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_send_studio_email_js_onRequest],
    },
  {
      routePath: "/api/send-whatsapp-link",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_send_whatsapp_link_js_onRequest],
    },
  {
      routePath: "/api/update-tenant",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_update_tenant_js_onRequest],
    },
  {
      routePath: "/api/validate-onboarding-key",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_validate_onboarding_key_js_onRequest],
    },
  {
      routePath: "/api/validate-studio-token",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_validate_studio_token_js_onRequest],
    },
  {
      routePath: "/start/:token*",
      mountPath: "/start",
      method: "",
      middlewares: [],
      modules: [__start___token___js_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]