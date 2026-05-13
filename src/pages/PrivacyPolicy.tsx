export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground mb-6">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 09 de maio de 2026</p>

      <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Identificação do Controlador</h2>
          <p>
            <strong>Maxfem Saúde Íntima Feminina</strong> — CNPJ 53.183.083/0001-99 — São Paulo, SP, Brasil.
            Email de contato: <a href="mailto:contato@maxfem.com.br" className="text-primary underline">contato@maxfem.com.br</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Informações que Coletamos</h2>
          <p>
            Coletamos informações que você nos fornece diretamente: nome, e-mail, telefone, endereço de
            entrega e dados de uso da plataforma. Também coletamos dados automaticamente via cookies e
            tecnologias similares (analytics, identificação de dispositivo).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Como Usamos suas Informações</h2>
          <p>
            Utilizamos seus dados para fornecer e melhorar nossos serviços, personalizar sua experiência,
            enviar comunicações relevantes (mediante consentimento), processar pedidos, oferecer suporte
            ao cliente e garantir a segurança da plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Compartilhamento de Dados</h2>
          <p>
            Não vendemos seus dados pessoais. Podemos compartilhar informações com parceiros de serviço
            (processadores de pagamento, transportadoras, provedores de hospedagem como Supabase, AWS) que
            nos auxiliam na operação da plataforma, sempre sob acordos de confidencialidade e tratamento
            de dados conforme a LGPD.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Integração com WhatsApp Business (Meta)</h2>
          <p>
            Nossa plataforma utiliza a WhatsApp Business Cloud API da Meta Platforms para comunicação
            com clientes. As mensagens enviadas e recebidas são armazenadas de forma criptografada em
            nossos servidores para fins de histórico e atendimento. O uso está sujeito aos
            <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noreferrer" className="text-primary underline mx-1">Termos da WhatsApp Business</a>
            e à
            <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noreferrer" className="text-primary underline mx-1">Política de Privacidade da Meta</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Integração com Instagram (Meta)</h2>
          <p>
            Para funcionalidades de atendimento via Instagram, integramos com a Instagram Graph API e
            Instagram Login for Business. Coletamos e armazenamos:
          </p>
          <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
            <li>Nome de usuário (@handle), foto de perfil e ID público da conta autorizada</li>
            <li>Conteúdo de mensagens diretas (DMs) recebidas e enviadas</li>
            <li>Comentários públicos em publicações da nossa conta</li>
            <li>Menções e respostas a stories direcionadas à nossa conta</li>
          </ul>
          <p className="mt-2">
            Esses dados são usados exclusivamente para responder mensagens, organizar atendimento e
            melhorar a comunicação. Não compartilhamos com terceiros nem usamos para perfil publicitário
            externo. O usuário pode revogar o acesso a qualquer momento em
            <a href="https://www.instagram.com/accounts/manage_access/" target="_blank" rel="noreferrer" className="text-primary underline mx-1">Configurações do Instagram → Apps e sites</a>
            ou solicitando exclusão pela
            <a href="/data-deletion" className="text-primary underline mx-1">página de exclusão de dados</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Segurança</h2>
          <p>
            Empregamos criptografia em trânsito (TLS 1.3) e em repouso (AES-256), controles de acesso
            baseados em papéis (RLS no banco), auditoria de acessos e práticas de SOC 2 para proteger
            seus dados contra acesso não autorizado, alteração, divulgação ou destruição.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Seus Direitos (LGPD)</h2>
          <p>
            Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:
          </p>
          <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
            <li>Confirmação da existência de tratamento</li>
            <li>Acesso aos dados pessoais armazenados</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade</li>
            <li>Portabilidade dos dados</li>
            <li>Eliminação dos dados pessoais tratados com consentimento</li>
            <li>Revogação do consentimento</li>
          </ul>
          <p className="mt-2">
            Para exercer esses direitos, envie email para <a href="mailto:contato@maxfem.com.br" className="text-primary underline">contato@maxfem.com.br</a>.
            Respondemos em até 15 dias.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Retenção de Dados</h2>
          <p>
            Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas nesta
            política. Mensagens de WhatsApp e Instagram são retidas por até 24 meses para fins de
            atendimento e auditoria. Pedidos e dados fiscais são retidos pelos prazos legais (até 5 anos
            conforme legislação tributária brasileira). Após esses prazos, os dados são anonimizados ou
            excluídos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. Cookies</h2>
          <p>
            Utilizamos cookies essenciais (autenticação, segurança), de desempenho (analytics) e de
            funcionalidade (preferências). Você pode gerenciar cookies pelas configurações do seu
            navegador.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">11. Alterações nesta Política</h2>
          <p>
            Esta política pode ser atualizada periodicamente. Mudanças significativas serão comunicadas
            por email ou aviso na plataforma. A data da última atualização aparece no topo deste
            documento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">12. Contato</h2>
          <p>
            Encarregado de Tratamento de Dados (DPO): <a href="mailto:contato@maxfem.com.br" className="text-primary underline">contato@maxfem.com.br</a>.
            Endereço postal disponível mediante solicitação.
          </p>
        </section>
      </div>
    </div>
  );
}
