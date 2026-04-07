export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground mb-6">Termos de Uso</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 07 de abril de 2026</p>

      <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e utilizar a plataforma Martz, você concorda com estes Termos de Uso. Caso não
            concorde com algum dos termos, não utilize o serviço.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Descrição do Serviço</h2>
          <p>
            A Martz é uma plataforma de CRM e comunicação que permite gerenciar clientes, campanhas de
            marketing e atendimento via WhatsApp Business. O serviço é oferecido no modelo SaaS
            (Software como Serviço).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Cadastro e Conta</h2>
          <p>
            Para utilizar a plataforma, é necessário criar uma conta com informações verdadeiras e
            atualizadas. Você é responsável por manter a confidencialidade de suas credenciais de acesso.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Uso Adequado</h2>
          <p>
            Você se compromete a utilizar a plataforma de forma ética e em conformidade com a legislação
            vigente. É proibido o envio de spam, mensagens não solicitadas ou conteúdo ilegal por meio
            da integração com WhatsApp.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Propriedade Intelectual</h2>
          <p>
            Todo o conteúdo, design, código e funcionalidades da plataforma são de propriedade da Martz.
            É proibida a reprodução, distribuição ou modificação sem autorização prévia.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Limitação de Responsabilidade</h2>
          <p>
            A Martz não se responsabiliza por danos indiretos, incidentais ou consequenciais resultantes
            do uso da plataforma. O serviço é fornecido "como está", sem garantias de disponibilidade
            ininterrupta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Cancelamento</h2>
          <p>
            Você pode cancelar sua conta a qualquer momento. Após o cancelamento, seus dados serão
            retidos pelo período exigido por lei e então permanentemente excluídos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Alterações nos Termos</h2>
          <p>
            Reservamo-nos o direito de alterar estes termos a qualquer momento. Alterações significativas
            serão comunicadas por e-mail ou notificação na plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Foro</h2>
          <p>
            Fica eleito o foro da comarca da sede da empresa para dirimir quaisquer questões
            decorrentes destes Termos de Uso.
          </p>
        </section>
      </div>
    </div>
  );
}
