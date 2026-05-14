// FAQ content for MAXFEM CRM
// Organized by category matching sidebar groups.
// Steps use simple strings (markdown-style emphasis is rendered manually).

export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
  steps?: string[];
  tips?: string[];
  troubleshoot?: { problem: string; solution: string }[];
  related?: string[];
};

export type FaqCategory = {
  id: string;
  title: string;
  description: string;
  icon: string;
  entries: FaqEntry[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "comecar",
    title: "Começando",
    description: "Primeiros passos pra entender o CRM e fazer login.",
    icon: "Rocket",
    entries: [
      {
        id: "o-que-e-crm",
        question: "O que é o Maxfem CRM?",
        answer:
          "Plataforma interna da Maxfem pra centralizar relacionamento com cliente: WhatsApp (atendimento humano + IA Ana), e-mail marketing, automações de carrinho/pix/pós-venda, segmentação de listas, dashboards de vendas e atribuição multicanal. Tudo conectado nativamente a Yampi, Bling, Meta Ads, ML, Klaviyo e Solomon.",
      },
      {
        id: "como-fazer-login",
        question: "Como faço login?",
        answer:
          "Acessa maxfem.tech/crm. Use seu e-mail Maxfem e senha. Se for primeira vez, peça pro admin (Thiago) te convidar via Configurações > Colaboradores.",
        steps: [
          "Abra maxfem.tech/crm no navegador",
          "Digite seu e-mail e senha cadastrados",
          "Clique em Entrar",
          "Você cai direto em Indicadores (dashboard inicial)",
        ],
        troubleshoot: [
          {
            problem: "Esqueci minha senha",
            solution: "Clique em 'Esqueci senha' na tela de login — chega um link de redefinição no seu e-mail.",
          },
          {
            problem: "Diz 'usuário não encontrado'",
            solution: "Você ainda não foi convidado. Pede pro Thiago te adicionar em Configurações > Colaboradores.",
          },
        ],
      },
      {
        id: "como-funciona-menu",
        question: "Como funciona o menu lateral?",
        answer:
          "O menu é organizado em 4 grupos: MONITORAR (dashboards e saúde), PLANEJAR (campanhas, automações, templates), EXECUTAR (operação do dia-a-dia) e GERENCIAR (clientes/listas). No rodapé fica Configurações.",
        tips: [
          "Clica no ícone de seta pra recolher e ter mais espaço de tela",
          "O menu segue o fluxo: você Planeja, Executa, Monitora resultado",
        ],
      },
      {
        id: "como-trocar-tema",
        question: "Como troco entre tema claro/escuro?",
        answer:
          "No rodapé do menu lateral tem um botão de sol/lua. Clica pra alternar. A preferência fica salva no seu navegador.",
      },
      {
        id: "tenants-multi-loja",
        question: "O CRM funciona pra mais de uma loja?",
        answer:
          "Sim — é multi-tenant. Hoje Maxfem é a loja viva, Amo Bicho está sendo preparada. No dropdown 'Maxfem' (topo do sidebar) você troca entre lojas que tem acesso.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "monitorar",
    title: "Monitorar",
    description: "Indicadores, Inteligência IA e Saúde da Ana.",
    icon: "BarChart3",
    entries: [
      {
        id: "indicadores-o-que-mostra",
        question: "O que o painel de Indicadores mostra?",
        answer:
          "Visão consolidada de receita, pedidos, ticket médio, taxa de conversão de campanhas, CPA, ROAS e churn. Filtros por período (hoje/ontem/7d/30d/personalizado) e por canal.",
        steps: [
          "Acessa /dashboard pelo menu Indicadores",
          "Escolhe o período no filtro superior",
          "Clica num card pra abrir o detalhamento",
          "Exporta CSV pelo botão no canto superior direito",
        ],
      },
      {
        id: "inteligencia-ia",
        question: "O que é Inteligência IA?",
        answer:
          "Painel preditivo que usa OpenAI pra: prever churn, sugerir oferta certa pra cada cliente, identificar produtos com risco de ruptura e sugerir melhor horário de envio (STO).",
        tips: [
          "As predições são reprocessadas a cada 24h",
          "Quanto mais histórico de comportamento, melhor a precisão",
        ],
      },
      {
        id: "saude-ana",
        question: "Pra que serve a 'Saúde da Ana'?",
        answer:
          "Monitora a IA Ana (atendente automática WhatsApp/Instagram) em tempo real: nº de conversas, taxa de resolução sem humano, taxa de escalação, palavras-chave que estão pegando ela de surpresa, custo OpenAI/dia.",
        steps: [
          "Acessa /saude-ana",
          "Confere card 'Resolvido sem humano' — meta acima de 60%",
          "Olha 'Top palavras escaladas' — vê o que a Ana não está entendendo",
          "Adiciona conhecimento novo em /listas (Arquiteto CRM)",
        ],
        troubleshoot: [
          {
            problem: "Taxa de escalação muito alta",
            solution: "Ana está esbarrando em perguntas sem resposta. Adiciona ai_knowledge entries via Arquiteto CRM. Cron de aprendizado diário roda 03h.",
          },
        ],
      },
      {
        id: "como-exportar-dados",
        question: "Como exporto dados pra Excel/CSV?",
        answer:
          "Toda tabela do CRM tem botão Exportar no canto superior direito. Gera CSV UTF-8 do conjunto filtrado.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "campanhas",
    title: "Campanhas",
    description: "Disparos one-shot pra listas segmentadas (Black Friday, lançamentos).",
    icon: "Megaphone",
    entries: [
      {
        id: "campanha-vs-automacao",
        question: "Qual a diferença entre Campanha e Automação?",
        answer:
          "Campanha = disparo único pra uma lista (broadcast). Automação = fluxo contínuo que dispara automaticamente quando um gatilho acontece (carrinho abandonado, PIX não pago, etc).",
        related: ["criar-automacao"],
      },
      {
        id: "criar-campanha",
        question: "Como crio uma campanha do zero?",
        answer:
          "Vai em Campanhas > Nova Campanha. Define nome, lista (público), template, agenda e ativa.",
        steps: [
          "Menu lateral > Campanhas > botão 'Nova Campanha'",
          "Dá um nome descritivo (ex: 'BF 2026 - clareador')",
          "Escolhe canal (WhatsApp/E-mail)",
          "Seleciona template aprovado",
          "Escolhe a lista de destinatários (segmento)",
          "Define data/hora de envio (ou 'Agora')",
          "Clica em Salvar e depois em Ativar",
        ],
        tips: [
          "Sempre testa em modo Sandbox primeiro (envia só pra você)",
          "Templates WhatsApp precisam estar 'approved' na Meta antes de poder usar",
          "Pode usar A/B test ativando o toggle 'Testar variações'",
        ],
      },
      {
        id: "ab-test",
        question: "Como faço A/B test numa campanha?",
        answer:
          "Liga o toggle 'Testar variações de cópia' no editor de campanha. Você define 2-4 variantes do template e o sistema divide audiência proporcionalmente. O vencedor é escolhido pelo critério configurado (open rate, click rate, conversão) após o período de teste.",
      },
      {
        id: "sandbox-mode",
        question: "O que é modo Sandbox?",
        answer:
          "Modo de teste — campanha 'roda' mas só envia pra contatos marcados como teste no seu workspace. Útil pra validar template, links, variáveis, sem custar disparos reais nem brisar audiência.",
      },
      {
        id: "agendamento-recorrencia",
        question: "Posso agendar campanha recorrente?",
        answer:
          "Não diretamente — campanhas são one-shot. Pra recorrência (ex: lembrete mensal), use Automações com gatilho de tempo ou crons.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "automacoes",
    title: "Automações",
    description: "Fluxos contínuos disparados por eventos (carrinho abandonado, pix pendente).",
    icon: "Zap",
    entries: [
      {
        id: "criar-automacao",
        question: "Como crio uma automação?",
        answer:
          "Vai em Automações > Nova Automação. Escolhe o gatilho, monta o fluxo visual (envia WA / aguarda / envia e-mail / condição), define templates, ativa.",
        steps: [
          "Menu lateral > Automações > 'Nova Automação'",
          "Dá nome descritivo",
          "Escolhe o gatilho (cart_abandoned, order_paid, etc)",
          "No editor visual, arrasta nós da paleta direita",
          "Conecta os nós (drag das setas)",
          "Em cada nó 'Enviar WhatsApp', escolhe o template",
          "Em cada nó 'Aguardar', define duração",
          "Salva e ativa o toggle 'Ativa' no topo",
        ],
        tips: [
          "Sempre teste com Sandbox antes de ativar pra produção",
          "Carrinho abandonado clássico: 15min → 1h → 6h → 12h → 24h",
          "Templates WhatsApp precisam começar com o prefixo do gatilho (carrinho_abandonado_*, pix_nao_pago_*) pra recovery_url funcionar",
        ],
      },
      {
        id: "gatilhos-disponiveis",
        question: "Quais gatilhos existem?",
        answer:
          "Lista completa de trigger_types: cart_abandoned (Yampi), order_created, order_created_pix, order_created_boleto, order_paid, order_approved, order_delivered, order_rejected_card, invoice_issued, return_approved, first_purchase, tracking_created, tracking_updated, browse_abandonment (pixel), cart_abandonment_pixel.",
      },
      {
        id: "gatilho-nao-disparou",
        question: "Meu gatilho não disparou. O que pode ser?",
        answer:
          "Checklist comum de troubleshooting.",
        troubleshoot: [
          {
            problem: "Status da campanha está 'draft'",
            solution: "Só dispara em status 'running'. Liga o toggle 'Ativa' no topo do editor.",
          },
          {
            problem: "Evento aconteceu ANTES da campanha ser ativada",
            solution: "Sistema só enfileira eventos com data >= activation_date (start_date ou created_at).",
          },
          {
            problem: "WhatsApp node sem template configurado",
            solution: "Abre o nó, escolhe o template no campo 'Template'. Se template não está aprovado pela Meta, não envia.",
          },
          {
            problem: "Wait nodes parecem disparar imediatamente",
            solution: "Verifica se os campos waitTime e waitUnit estão configurados (não duration/unit antigos).",
          },
          {
            problem: "Cliente já pagou e ainda recebe lembrete",
            solution: "O guardrail de conversão valida automaticamente. Se está mandando mesmo após pagamento, abra um chamado.",
          },
        ],
      },
      {
        id: "fluxo-condicional",
        question: "Como uso condições no fluxo?",
        answer:
          "Arrasta o nó 'Condição' ou 'Multi-condição'. Define a regra (ex: 'tem cupom usado nos últimos 30 dias'). O fluxo se ramifica em 'Sim' e 'Não' — cada ramo pode ter ações diferentes.",
      },
      {
        id: "parar-fluxo-cliente-converteu",
        question: "O fluxo para automaticamente se cliente converter?",
        answer:
          "Sim, pra cart_abandoned. O executor verifica antes de cada step: se cliente pagou QUALQUER pedido depois do carrinho abandonado, marca como 'skipped' e para. Para pix_nao_pago, a checagem é por pedido específico (yampi_order_id).",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "popups",
    title: "Pop-ups",
    description: "Modais on-site pra captura, oferta e exit-intent.",
    icon: "Layout",
    entries: [
      {
        id: "criar-popup",
        question: "Como crio um pop-up?",
        answer:
          "Vai em Pop-ups > Novo Pop-up. Define gatilho (timer, scroll, exit-intent, página específica), layout (single column, two columns, drawer), campos do form e CTA.",
        steps: [
          "Menu > Pop-ups > 'Novo Pop-up'",
          "Nome interno",
          "Escolhe template visual",
          "Define gatilho (quando aparece)",
          "Define audiência (todos, primeira visita, não-clientes)",
          "Configura campos (nome, e-mail, telefone)",
          "Define CTA e destino do form",
          "Liga 'Ativo' e salva",
        ],
        tips: [
          "Exit-intent funciona só em desktop — não dispara em mobile",
          "Pop-ups muito frequentes pioram experiência — usa frequency cap",
        ],
      },
      {
        id: "popup-mobile",
        question: "Pop-up aparece em mobile?",
        answer:
          "Sim, mas alguns gatilhos não funcionam — exit-intent só roda em desktop (depende de movimento do mouse). Em mobile, usa scroll ou timer.",
      },
      {
        id: "popup-integra-klaviyo",
        question: "Pop-up sincroniza com Klaviyo?",
        answer:
          "Sim — leads capturados vão automaticamente pra lista Klaviyo via API (campo KLAVIYO_API_KEY no .env).",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "templates",
    title: "Templates",
    description: "Modelos de mensagem WhatsApp (HSM Meta) e e-mail.",
    icon: "FileText",
    entries: [
      {
        id: "criar-template-wa",
        question: "Como crio um template WhatsApp?",
        answer:
          "Templates > Novo Template > WhatsApp. Define nome (snake_case), idioma, categoria (UTILITY/MARKETING/AUTHENTICATION), corpo, rodapé e botões. Depois submete pra Meta aprovar.",
        steps: [
          "Aba WhatsApp > 'Novo Template'",
          "Nome: snake_case, ex 'pedido_aprovado'",
          "Categoria: UTILITY (transacional, custo baixo) ou MARKETING (promocional)",
          "Idioma: Português (BR)",
          "Corpo: usa {{1}}, {{2}} etc pra variáveis (sequenciais!)",
          "Mapeia cada variável a um token do CRM (customer.first_name, numero_pedido, etc)",
          "Rodapé opcional (max 60 chars, sem variável)",
          "Botões: até 2 URL + 1 telefone + 1 copy_code + quick_replies (total 10)",
          "Submete pra Meta — aprovação leva minutos a horas",
        ],
        tips: [
          "Variáveis NÃO podem estar no início ou fim do corpo — sempre cerca com texto fixo",
          "Variáveis precisam ser sequenciais ({{1}}, {{2}}, {{3}}) — pular numeração quebra",
          "Texto fixo > variáveis em proporção, senão Meta rejeita",
          "Sem emoji no cabeçalho, sem markdown (* _ ~) em parte alguma",
        ],
      },
      {
        id: "variaveis-disponiveis",
        question: "Quais variáveis posso usar nos templates?",
        answer:
          "Tokens organizados por grupo:",
        tips: [
          "Cliente: customer.first_name, customer.name, customer.email, customer.phone, customer.city",
          "Pedido: numero_pedido, valor_pedido, status_pedido, link_pedido, link_pagamento, link_rastreio",
          "PIX: codigo_pix, link_pagamento (resolve pra public_url do Yampi)",
          "Carrinho: link_carrinho (recovery_url Yampi com itens preenchidos)",
          "Nota Fiscal: link_nf_pdf, link_nf, numero_nf",
          "Campanha: campaign.product_name, campaign.coupon, campaign.discount",
        ],
      },
      {
        id: "botao-link-dinamico",
        question: "Como faço botão Link dinâmico (URL muda por cliente)?",
        answer:
          "Meta exige URL no formato 'https://prefixo/{{1}}'. Pro CRM resolver automaticamente: nomeia o template começando com 'carrinho_abandonado_*' ou 'pix_nao_pago_*' e usa 'https://wpp.maxapps.com.br/r/{{1}}' como URL. O CRM cria shortlink rastreado e injeta o code no {{1}}.",
      },
      {
        id: "template-rejeitado-meta",
        question: "Meu template foi rejeitado pela Meta. Por quê?",
        answer:
          "Causas mais comuns:",
        troubleshoot: [
          {
            problem: "Variável longa demais no body (ex: código PIX completo)",
            solution: "Move pra botão COPY_CODE ou pra página externa. Variáveis devem ser palavras curtas (nome, número), não blobs.",
          },
          {
            problem: "Variáveis no início ou fim do corpo",
            solution: "Sempre cerca {{N}} com texto fixo: 'Oi {{1}}, ...' ou '... pedido {{2}}.'",
          },
          {
            problem: "Muita variável e pouco texto fixo",
            solution: "Body precisa ter mais palavras fixas do que variáveis. Regra Meta.",
          },
          {
            problem: "COPY_CODE em template UTILITY",
            solution: "COPY_CODE só funciona em MARKETING/AUTHENTICATION. Pra UTILITY usa só URL ou QUICK_REPLY.",
          },
          {
            problem: "Idioma errado",
            solution: "Mensagem em português precisa ter idioma pt_BR. Inglês precisa de en_US.",
          },
        ],
      },
      {
        id: "template-aprovado-quanto-tempo",
        question: "Quanto tempo Meta leva pra aprovar?",
        answer:
          "Normalmente entre 1 minuto e 4 horas. Pode estender até 24h em horário de pico. Status atualiza automaticamente no CRM via webhook Meta.",
      },
      {
        id: "template-meta-id-null",
        question: "Status diz 'rascunho' mas eu submeti. Cadê?",
        answer:
          "Verifica se o template foi de fato enviado pra Meta (botão 'Submeter pra Meta'). Se meta_template_id está null, ele ainda não foi enviado. Se está preenchido mas status é draft, sincroniza usando o botão 'Sincronizar Meta' no topo.",
      },
      {
        id: "template-resubmit",
        question: "Posso reenviar template rejeitado?",
        answer:
          "Não com o mesmo nome — Meta bloqueia por 30 dias após rejeição. Cria um novo com nome diferente (ex: nome_v2) e a estrutura corrigida.",
      },
      {
        id: "categoria-template",
        question: "UTILITY vs MARKETING — qual escolher?",
        answer:
          "UTILITY: transacional (confirmação pedido, rastreio, PIX pendente). Sem janela 24h, custo menor. Não pode ser promocional. MARKETING: promocional, novidades, lembrete carrinho com desconto. Janela 24h do cliente respondendo, custo maior. AUTHENTICATION: só OTP/códigos de verificação.",
      },
      {
        id: "template-email",
        question: "E os templates de e-mail? Precisa aprovar também?",
        answer:
          "Não — e-mail não passa por aprovação Meta. Você cria, salva, e já pode usar em automações/campanhas. Suporta HTML completo e MJML.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "arquiteto",
    title: "Arquiteto CRM",
    description: "IA que planeja listas, segmentos e conhecimento da Ana.",
    icon: "Sparkles",
    entries: [
      {
        id: "o-que-faz-arquiteto",
        question: "O que o Arquiteto CRM faz?",
        answer:
          "Assistente IA que ajuda a: criar segmentos de cliente em linguagem natural ('Quero clientes que compraram clareador nos últimos 30 dias e não receberam lembrete'), gerar listas dinâmicas, gerenciar base de conhecimento da Ana e propor automações novas baseadas em padrões de comportamento.",
      },
      {
        id: "criar-lista-ia",
        question: "Como crio uma lista usando IA?",
        answer:
          "Vai em Arquiteto CRM > 'Nova lista IA'. Descreve em texto o que quer ('clientes que abandonaram carrinho > R$200 e usaram cupom alguma vez'). IA gera a query SQL, mostra preview e você confirma.",
      },
      {
        id: "ai-knowledge-ana",
        question: "Como adiciono conhecimento na Ana?",
        answer:
          "Arquiteto CRM > aba 'Conhecimento Ana'. Adiciona pergunta + resposta (ex: 'Posso usar Imunofem na gravidez?' → 'Sim, é seguro durante gestação...'). Ana usa via RAG no atendimento.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "atendimento",
    title: "Atendimento",
    description: "Chat WhatsApp e Instagram com IA Ana + escalação humana.",
    icon: "MessageSquare",
    entries: [
      {
        id: "como-funciona-atendimento",
        question: "Como funciona o atendimento?",
        answer:
          "Mensagens de WhatsApp e Instagram chegam aqui. Ana (IA) responde automaticamente em primeira linha. Se não consegue (escalation), aparece com flag 'Aguardando humano' pro time atender.",
        steps: [
          "Cliente manda mensagem no WA/IG",
          "Webhook recebe no Supabase",
          "Edge function 'whatsapp-ai-respond' processa via Ana",
          "Ana responde direto ou cria flag escalation",
          "Time vê a conversa na aba Atendimento e pode responder",
        ],
      },
      {
        id: "responder-cliente",
        question: "Como respondo manualmente um cliente?",
        answer:
          "Clica na conversa, digita resposta, envia. Se Ana estava ativa, ela é pausada nessa conversa por 1h pra você não conflitar.",
      },
      {
        id: "ana-erra-resposta",
        question: "Ana respondeu errado. O que faço?",
        answer:
          "Clica no botão 'Marcar resposta incorreta' embaixo da mensagem dela. Vira input pro treinamento. Cron 03h diário reavalia knowledge base.",
        tips: [
          "Adiciona a resposta correta em Arquiteto CRM > Conhecimento Ana",
          "Casos críticos: desativa Ana temporariamente em Configurações > IA",
        ],
      },
      {
        id: "ana-pausar",
        question: "Como pauso a Ana pra responder tudo manual?",
        answer:
          "Configurações > IA > toggle 'Ana ativa'. Quando OFF, todas as mensagens entram como pendentes pro time.",
      },
      {
        id: "ana-rag",
        question: "Como a Ana sabe das coisas?",
        answer:
          "Ela consulta um RAG (Retrieval-Augmented Generation): combina base de conhecimento (ai_knowledge), histórico do cliente, regras do prompt principal (whatsapp_prompt) e contexto da conversa. Adiciona conhecimento em Arquiteto CRM.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "email-marketing",
    title: "E-mail Marketing",
    description: "Disparos de e-mail via Amazon SES com tracking e supressão.",
    icon: "Mail",
    entries: [
      {
        id: "como-criar-email",
        question: "Como crio uma campanha de e-mail?",
        answer:
          "E-mail Marketing > Nova campanha. Igual ao fluxo de WhatsApp, mas com editor HTML/MJML. Suporta drag-and-drop e código direto.",
      },
      {
        id: "ses-amazon",
        question: "Por que Amazon SES e não SendGrid?",
        answer:
          "SES tem o melhor custo por e-mail enviado (~$0.10/1000) e melhor deliverability quando você gerencia a reputação. Configurado em Configurações > AWS.",
      },
      {
        id: "deliverability",
        question: "Como melhoro deliverability?",
        answer:
          "Checklist:",
        tips: [
          "DKIM e SPF configurados corretamente no DNS",
          "DMARC com p=quarantine ou reject",
          "Lista limpa — sempre confirma double opt-in",
          "Frequency cap — não bombardear",
          "Conteúdo equilibrado (texto + imagem, evita all-image)",
          "Link de descadastro visível",
        ],
      },
      {
        id: "descadastro",
        question: "Como funciona o descadastro (opt-out)?",
        answer:
          "Todo template e-mail inclui automaticamente {{unsubscribe_url}}. Cliente clica, vai pra /preferences/:token, escolhe quais canais quer manter. Decisão grava em customer.subscribed_channels e respeitada em todos os envios.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "pixel",
    title: "Pixel",
    description: "Tracking de comportamento no site pra retargeting e abandonment.",
    icon: "Radar",
    entries: [
      {
        id: "o-que-pixel-rastreia",
        question: "O que o Pixel rastreia?",
        answer:
          "Pageviews, sessões, produtos vistos, items adicionados ao carrinho, checkout iniciado, ofertas vistas. Dados ficam em pixel_sessions e pixel_events.",
      },
      {
        id: "browse-abandonment",
        question: "O que é Browse Abandonment?",
        answer:
          "Cliente entrou no site, viu produto, mas não adicionou ao carrinho. Cron pixel-abandonment-cron detecta sessão sem checkout em X minutos e dispara automação.",
      },
      {
        id: "diferenca-pixel-yampi",
        question: "Diferença entre Pixel e dados Yampi?",
        answer:
          "Pixel captura BEHAVIOR (o que cliente faz no site, mesmo sem comprar). Yampi captura COMMERCE (carrinhos, pedidos, vendas). Pixel detecta abandono antes do carrinho; Yampi detecta abandono do carrinho em si.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "clientes",
    title: "Clientes",
    description: "Base unificada de contatos com histórico completo.",
    icon: "Users",
    entries: [
      {
        id: "buscar-cliente",
        question: "Como busco um cliente?",
        answer:
          "Campo de busca no topo aceita CPF, nome, e-mail, telefone (com ou sem DDD/máscara). Match parcial.",
      },
      {
        id: "ver-historico",
        question: "Como vejo histórico de um cliente?",
        answer:
          "Clica no nome do cliente. Abre perfil com: pedidos, mensagens enviadas, atividades, custom_attributes (CPF, cidade, abandoned_cart, pix_pending, etc), tags.",
      },
      {
        id: "merge-duplicados",
        question: "Tem duplicado, como mescla?",
        answer:
          "Hoje não tem merge automático na UI. Pede pra equipe técnica resolver via SQL — geralmente dá pra unificar por CPF.",
      },
      {
        id: "lgpd-deletar",
        question: "Cliente pediu pra deletar dados (LGPD). Como faço?",
        answer:
          "/data-deletion é a página pública pro próprio cliente pedir. Internamente, abre o perfil > menu > 'Solicitar exclusão LGPD'. Processo apaga dados pessoais mas mantém pedidos pra fins fiscais.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "listas",
    title: "Listas",
    description: "Segmentos estáticos e dinâmicos da base.",
    icon: "List",
    entries: [
      {
        id: "lista-estatica-dinamica",
        question: "Lista estática vs dinâmica?",
        answer:
          "Estática: você seleciona os contatos uma vez. Mesmo se eles mudarem (ex: comprarem de novo), continuam na lista. Dinâmica: definida por regra — recalcula a cada disparo (ex: 'clientes ativos últimos 30 dias' muda automaticamente).",
      },
      {
        id: "criar-segmento",
        question: "Como crio um segmento por regra?",
        answer:
          "Listas > Nova > 'Dinâmica'. Adiciona filtros (cidade, total gasto, último pedido, tags, custom_attributes). Combine com AND/OR.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "atividades",
    title: "Atividades",
    description: "Log de tudo que o CRM faz: disparos, cliques, eventos.",
    icon: "Activity",
    entries: [
      {
        id: "log-disparos",
        question: "Como vejo o log de disparos?",
        answer:
          "Atividades mostra cada mensagem enviada com: cliente, canal, template, status (sent/delivered/read/clicked/failed), timestamps. Filtra por campanha, automação, canal ou status.",
      },
      {
        id: "evento-falhou",
        question: "Disparo falhou. Como descubro o erro?",
        answer:
          "Clica no item com status 'failed'. Abre detalhe com mensagem de erro Meta/SES.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "integracoes",
    title: "Integrações",
    description: "Conexões com Yampi, Bling, OpenAI, Gemini, AWS, Meta, Instagram.",
    icon: "Plug",
    entries: [
      {
        id: "conectar-yampi",
        question: "Como conecto a Yampi?",
        answer:
          "Configurações > Integrações > Yampi. Cole alias da loja, User-Token e Secret Key. CRM começa sync de pedidos e carrinhos imediatamente.",
        steps: [
          "Yampi admin > Configurações > Tokens API > Criar token novo",
          "Copia alias, user_token e user_secret_key",
          "CRM > Configurações > Integrações > Yampi > Conectar",
          "Cola valores, clica em Testar conexão",
          "Salva. Sync começa em 1 minuto",
        ],
      },
      {
        id: "conectar-bling",
        question: "Como conecto o Bling?",
        answer:
          "OAuth v3 — Configurações > Integrações > Bling > 'Conectar'. Você é redirecionado pra autorizar a app na sua conta Bling. Token de refresh é renovado automaticamente.",
        tips: [
          "refresh_token rotaciona a cada uso — nunca testa manualmente sem gravar de volta",
          "API base: api.bling.com.br/Api/v3 (NÃO www.bling.com.br — 403)",
        ],
      },
      {
        id: "conectar-whatsapp",
        question: "Como conecto WhatsApp Business?",
        answer:
          "Configurações > WhatsApp. Cole phone_number_id e access_token gerado no Meta Business Manager. Verifica webhook URL e token.",
      },
      {
        id: "conectar-openai",
        question: "Como conecto OpenAI?",
        answer:
          "Configurações > Integrações > OpenAI. Cole sua API key. Configure modelo padrão (gpt-4o-mini pra Ana é boa).",
      },
      {
        id: "conectar-gemini",
        question: "Pra que serve Gemini?",
        answer:
          "Geração de imagens (Nano Banana Pro) e vídeos (Veo 3.1) usados em criativos. Configurações > Integrações > Gemini.",
      },
      {
        id: "conectar-instagram",
        question: "Como conecto Instagram?",
        answer:
          "Configurações > Instagram. OAuth via Facebook Business. Webhook recebe DMs, respondidas via Ana ou time.",
      },
      {
        id: "conectar-aws",
        question: "Como configuro AWS pra envio de e-mail?",
        answer:
          "Configurações > AWS. Access Key + Secret + região (default us-east-1). SES precisa estar fora do sandbox da conta — solicite production access no console AWS.",
      },
      {
        id: "webhooks",
        question: "O que são Webhooks?",
        answer:
          "URLs públicas que CRM expõe pra receber callback de provedores. Meta usa webhook pra entregar mensagens recebidas, status de templates, status de envio. Configura em Configurações > Webhooks.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "configuracoes",
    title: "Configurações Gerais",
    description: "Colaboradores, políticas, MCP, auditoria.",
    icon: "Settings",
    entries: [
      {
        id: "convidar-colaborador",
        question: "Como convido alguém pro CRM?",
        answer:
          "Configurações > Colaboradores > Convidar. Informa nome, e-mail, role (admin/manager/agent/analyst). Pessoa recebe e-mail com link de cadastro.",
        steps: [
          "Configurações > Colaboradores > 'Convidar pessoa'",
          "Preenche e-mail, nome, role",
          "Define quais módulos pode acessar",
          "Envia convite",
          "Pessoa clica no link do e-mail, define senha",
          "Aparece na lista de colaboradores",
        ],
      },
      {
        id: "roles-permissoes",
        question: "Quais roles existem?",
        answer:
          "admin (acesso total), manager (gerencia campanhas/templates/automações mas não settings nem billing), agent (só atendimento), analyst (só leitura/dashboards).",
      },
      {
        id: "auditoria",
        question: "Pra que serve Auditoria?",
        answer:
          "Log de tudo que cada usuário faz: login, criou template, ativou automação, alterou cliente, etc. Pesquisa por usuário, ação, período. Útil pra LGPD e investigação.",
      },
      {
        id: "mcp-conexoes",
        question: "O que é Conexões MCP?",
        answer:
          "Model Context Protocol — permite que IAs externas (Claude, Cursor) conectem direto no CRM e executem ações. Cada conexão tem chave própria. Use com cautela: dá acesso programático ao tenant.",
      },
      {
        id: "politicas-privacidade",
        question: "Onde edito políticas de privacidade?",
        answer:
          "Configurações > Políticas. Edita Política de Privacidade, Termos de Uso e Política de Cookies. Visíveis publicamente em /privacy, /terms, /data-deletion.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Problemas comuns e como resolver.",
    icon: "AlertTriangle",
    entries: [
      {
        id: "mensagem-nao-chegou",
        question: "Cliente diz que não recebeu a mensagem",
        answer:
          "Diagnóstico em camadas:",
        troubleshoot: [
          {
            problem: "Confirma se mensagem foi enviada",
            solution: "Atividades > filtra por telefone do cliente. Olha status: sent? delivered? read? failed?",
          },
          {
            problem: "Status 'sent' mas não 'delivered'",
            solution: "Telefone pode estar errado, sem WhatsApp, ou Meta bloqueou. Confere número e tenta novamente.",
          },
          {
            problem: "Status 'failed'",
            solution: "Clica no log pra ver o erro Meta. Pode ser número inválido, template não aprovado, ou janela 24h expirada (Marketing).",
          },
          {
            problem: "Cliente bloqueou o número",
            solution: "Nada a fazer — respeita o opt-out. Marca status 'blocked' no cliente.",
          },
        ],
      },
      {
        id: "yampi-nao-sincroniza",
        question: "Yampi não está sincronizando pedidos novos",
        answer: "",
        troubleshoot: [
          {
            problem: "Cron travado",
            solution: "Configurações > Integrações > Yampi > 'Sincronizar agora'. Se erro, confere tokens.",
          },
          {
            problem: "Tokens expiraram",
            solution: "Gera novos na Yampi admin, atualiza no CRM.",
          },
          {
            problem: "Rate limit Yampi atingido",
            solution: "API tem limite de chamadas. Aguarda 1h ou reduz frequência do sync.",
          },
        ],
      },
      {
        id: "ana-respondendo-estranho",
        question: "Ana está respondendo coisas estranhas",
        answer:
          "Causa comum: knowledge base com entrada errada ou prompt principal modificado.",
        troubleshoot: [
          {
            problem: "Resposta fora de contexto",
            solution: "Saúde da Ana > top conversas problemáticas > marca como 'resposta incorreta'.",
          },
          {
            problem: "Inventando produtos/preços",
            solution: "Hallucination. Garante que ai_knowledge tem informação canônica do catálogo. Cron diário corrige.",
          },
          {
            problem: "Não responde nada",
            solution: "Configurações > IA > confere se Ana está ativa. Verifica saldo OpenAI.",
          },
        ],
      },
      {
        id: "campanha-nao-disparou",
        question: "Campanha agendada não disparou",
        answer: "",
        troubleshoot: [
          {
            problem: "Status ainda 'scheduled'",
            solution: "Cron de campanhas roda a cada minuto. Aguarda 2-3min após data agendada.",
          },
          {
            problem: "Template foi rejeitado depois do agendamento",
            solution: "Se template virou 'rejected', campanha falha. Cria template novo aprovado e re-agenda.",
          },
          {
            problem: "Lista vazia",
            solution: "Confere se a lista tem contatos no momento do disparo. Listas dinâmicas recalculam na hora.",
          },
        ],
      },
      {
        id: "logo-quebrado",
        question: "Imagens do e-mail não aparecem",
        answer:
          "Hospeda imagens em CDN com URL absoluta https://. Não use caminho relativo. Bloqueio comum: Outlook bloqueia imagens externas por padrão — sempre coloca texto alternativo descritivo.",
      },
      {
        id: "links-utm-quebrados",
        question: "UTMs no link do botão estão erradas",
        answer:
          "O link-redirect sobrescreve UTMs do destino com as da campanha (utm_source=whatsapp, utm_medium=automation, utm_campaign=slug, utm_content=template). Se chegou outra UTM no Solomon/Yampi, é cache da loja ou parâmetros não-padrão do destino.",
      },
    ],
  },
];

export const FAQ_TOTAL_ENTRIES = FAQ_CATEGORIES.reduce(
  (sum, cat) => sum + cat.entries.length,
  0
);
