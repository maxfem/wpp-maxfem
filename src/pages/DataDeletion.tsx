export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground mb-6">
        Exclusão de Dados (Data Deletion Instructions)
      </h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 09 de maio de 2026</p>

      <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
        <section>
          <p>
            A Maxfem respeita seu direito à exclusão de dados pessoais conforme a LGPD (Lei 13.709/2018)
            e os requisitos da Meta Platforms (Facebook, Instagram, WhatsApp).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Como solicitar a exclusão dos seus dados
          </h2>

          <h3 className="font-semibold mt-4 mb-1">Opção 1 — Por email (recomendado)</h3>
          <p>
            Envie um email para <a href="mailto:contato@maxfem.com.br" className="text-primary underline">contato@maxfem.com.br</a>
            com o assunto <strong>"Exclusão de dados"</strong> contendo:
          </p>
          <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
            <li>Nome completo</li>
            <li>Email cadastrado</li>
            <li>Telefone (se cliente WhatsApp)</li>
            <li>@handle do Instagram (se conectado)</li>
            <li>Confirmação de que deseja excluir todos os dados</li>
          </ul>
          <p className="mt-2">
            Processamos sua solicitação em até <strong>15 dias úteis</strong>. Você receberá email de
            confirmação assim que a exclusão for concluída.
          </p>

          <h3 className="font-semibold mt-4 mb-1">Opção 2 — Pelo WhatsApp</h3>
          <p>
            Envie a mensagem <strong>"Quero excluir meus dados"</strong> para o WhatsApp oficial
            cadastrado na Maxfem. Nossa equipe seguirá com o processo após validar sua identidade.
          </p>

          <h3 className="font-semibold mt-4 mb-1">Opção 3 — Revogar acesso pelo Instagram/Facebook</h3>
          <p>
            Para parar imediatamente o recebimento de dados via Meta, revogue o acesso da nossa
            aplicação:
          </p>
          <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
            <li>
              Instagram: <a href="https://www.instagram.com/accounts/manage_access/" target="_blank" rel="noreferrer" className="text-primary underline">instagram.com/accounts/manage_access</a>
            </li>
            <li>
              Facebook: <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noreferrer" className="text-primary underline">facebook.com/settings → Apps e Sites</a>
            </li>
          </ul>
          <p className="mt-2">
            Após revogar, complete a exclusão dos dados já armazenados pelas opções 1 ou 2.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">O que é excluído</h2>
          <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
            <li>Cadastro pessoal (nome, email, telefone, endereço)</li>
            <li>Histórico completo de mensagens WhatsApp e Instagram</li>
            <li>Comentários e menções importadas do Instagram</li>
            <li>Tags, segmentos e atributos personalizados</li>
            <li>Histórico de campanhas e cliques associados</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">O que NÃO pode ser excluído</h2>
          <p>
            Por exigência legal, mantemos dados fiscais (notas fiscais, registros financeiros)
            associados a pedidos pelos seguintes prazos:
          </p>
          <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
            <li>Até 5 anos para registros fiscais e tributários (Lei 5.172/1966)</li>
            <li>Até 5 anos para defesa em eventuais processos (CDC art. 27)</li>
          </ul>
          <p className="mt-2">
            Esses dados são anonimizados sempre que possível e não vinculam mais sua identidade pessoal
            após a exclusão.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Confirmação por código</h2>
          <p>
            Ao processar sua solicitação, geramos um <strong>código de confirmação único</strong>. Você
            pode usá-lo pra rastrear o status da exclusão (Meta App Review pode pedir esse fluxo). O
            código é entregue no email de confirmação.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Contato</h2>
          <p>
            DPO: <a href="mailto:contato@maxfem.com.br" className="text-primary underline">contato@maxfem.com.br</a>
            <br />
            Empresa: Maxfem Saúde Íntima Feminina (CNPJ 53.183.083/0001-99)
            <br />
            Endereço: São Paulo, SP — Brasil
          </p>
        </section>
      </div>
    </div>
  );
}
