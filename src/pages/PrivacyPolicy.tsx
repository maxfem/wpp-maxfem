export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground mb-6">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 07 de abril de 2026</p>

      <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Informações que Coletamos</h2>
          <p>
            Coletamos informações que você nos fornece diretamente, como nome, e-mail, telefone e dados
            de uso da plataforma. Também coletamos dados automaticamente por meio de cookies e
            tecnologias similares.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Como Usamos suas Informações</h2>
          <p>
            Utilizamos seus dados para fornecer e melhorar nossos serviços, personalizar sua experiência,
            enviar comunicações relevantes e garantir a segurança da plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Compartilhamento de Dados</h2>
          <p>
            Não vendemos seus dados pessoais. Podemos compartilhar informações com parceiros de serviço
            que nos auxiliam na operação da plataforma, sempre sob acordos de confidencialidade.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Integração com WhatsApp</h2>
          <p>
            Nossa plataforma utiliza a API do WhatsApp Business para comunicação com clientes. As
            mensagens enviadas e recebidas são armazenadas de forma segura em nossos servidores para
            fins de histórico e atendimento. O uso está sujeito aos termos da Meta Platforms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Segurança</h2>
          <p>
            Empregamos medidas técnicas e organizacionais para proteger seus dados contra acesso não
            autorizado, alteração, divulgação ou destruição.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Seus Direitos (LGPD)</h2>
          <p>
            Conforme a Lei Geral de Proteção de Dados (LGPD), você tem direito a acessar, corrigir,
            excluir e portar seus dados pessoais. Para exercer esses direitos, entre em contato conosco.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Retenção de Dados</h2>
          <p>
            Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas nesta
            política, salvo quando exigido por lei para retenção por período maior.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Contato</h2>
          <p>
            Para dúvidas sobre esta política ou sobre o tratamento dos seus dados, entre em contato
            pelo e-mail disponível na plataforma.
          </p>
        </section>
      </div>
    </div>
  );
}
