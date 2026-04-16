/**
 * Complete Meta WhatsApp Template validation based on Graph API v22-25 documentation.
 * Maps all known error subcodes to user-friendly Portuguese messages.
 */

export interface TemplateValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string;
}

interface TemplateFormInput {
  name: string;
  category: string;
  language: string;
  header_type: string;
  header_content: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  sample_values?: string[];
}

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{200D}\u{FE0E}\u{FE0F}\u{20E3}]/gu;
const MARKDOWN_REGEX = /[*_~]/;
const VARIABLE_REGEX = /\{\{(\d+)\}\}/g;

// ── Limits ──────────────────────────────────────────────────────
const MAX_NAME = 512;
const MAX_HEADER_TEXT = 60;
const MAX_BODY = 1024;
const MAX_FOOTER = 60;
const MAX_BUTTON_LABEL = 25;
const MAX_BUTTON_URL = 2000;
const MAX_BUTTON_PHONE = 20;
const MAX_COPY_CODE_EXAMPLE = 15;
const MAX_BUTTONS_TOTAL = 10;
const MAX_URL_BUTTONS = 2;
const MAX_PHONE_BUTTONS = 1;
const MAX_COPY_CODE_BUTTONS = 1;

export function validateTemplate(form: TemplateFormInput): TemplateValidationError[] {
  const errors: TemplateValidationError[] = [];

  // ── Name ────────────────────────────────────────────────────
  if (!form.name.trim()) {
    errors.push({ field: "name", message: "Nome é obrigatório.", severity: "error" });
  } else {
    if (!/^[a-z][a-z0-9_]*$/.test(form.name)) {
      errors.push({
        field: "name",
        message: "Nome deve começar com letra minúscula e conter apenas letras minúsculas, números e underscore (_).",
        severity: "error",
      });
    }
    if (form.name.length > MAX_NAME) {
      errors.push({ field: "name", message: `Nome excede ${MAX_NAME} caracteres.`, severity: "error" });
    }
  }

  // ── Header ──────────────────────────────────────────────────
  if (form.header_type === "text" && form.header_content) {
    if (form.header_content.length > MAX_HEADER_TEXT) {
      errors.push({ field: "header_content", message: `Cabeçalho excede ${MAX_HEADER_TEXT} caracteres.`, severity: "error" });
    }
    if (EMOJI_REGEX.test(form.header_content)) {
      errors.push({ field: "header_content", message: "Cabeçalho não pode conter emojis.", severity: "error" });
    }
    if (MARKDOWN_REGEX.test(form.header_content)) {
      errors.push({ field: "header_content", message: "Cabeçalho não pode conter formatação (* _ ~).", severity: "error" });
    }
    if (/[\n\r]/.test(form.header_content)) {
      errors.push({ field: "header_content", message: "Cabeçalho não pode conter quebras de linha.", severity: "error" });
    }
    const headerVars = form.header_content.match(VARIABLE_REGEX) || [];
    if (headerVars.length > 1) {
      errors.push({ field: "header_content", message: "Cabeçalho permite no máximo 1 variável.", severity: "error" });
    }
  }

  if (["image", "video", "document"].includes(form.header_type) && !form.header_content?.trim()) {
    errors.push({ field: "header_content", message: "URL de mídia é obrigatória para cabeçalho de mídia.", severity: "error" });
  }

  // ── Body ────────────────────────────────────────────────────
  if (!form.body.trim()) {
    errors.push({ field: "body", message: "Corpo da mensagem é obrigatório.", severity: "error" });
  } else {
    if (form.body.length > MAX_BODY) {
      errors.push({ field: "body", message: `Corpo excede ${MAX_BODY} caracteres.`, severity: "error" });
    }

    // Variables at edges
    const trimmedBody = form.body.trim();
    if (/^[^a-zA-Z0-9]*\{\{\d+\}\}/.test(trimmedBody) || /\{\{\d+\}\}[^a-zA-Z0-9]*$/.test(trimmedBody)) {
      errors.push({
        field: "body",
        message: "Variáveis não podem estar no início ou no fim do corpo. Adicione texto fixo antes e depois.",
        severity: "error",
      });
    }

    // Sequential variables
    const bodyVars = [...form.body.matchAll(VARIABLE_REGEX)].map((m) => parseInt(m[1], 10));
    if (bodyVars.length > 0) {
      const sorted = [...new Set(bodyVars)].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] !== i + 1) {
          errors.push({
            field: "body",
            message: `Variáveis devem ser sequenciais: {{1}}, {{2}}, {{3}}... Encontrado {{${sorted[i]}}} mas esperado {{${i + 1}}}.`,
            severity: "error",
          });
          break;
        }
      }

      // Variable proportion — fixed text should have more words than variables
      const fixedText = form.body.replace(VARIABLE_REGEX, "").trim();
      const fixedWords = fixedText.split(/\s+/).filter(Boolean).length;
      if (fixedWords < bodyVars.length) {
        errors.push({
          field: "body",
          message: "O corpo deve conter mais texto fixo do que variáveis. Adicione mais conteúdo entre as variáveis.",
          severity: "warning",
        });
      }
    }
  }

  // ── Footer ──────────────────────────────────────────────────
  if (form.footer) {
    if (form.footer.length > MAX_FOOTER) {
      errors.push({ field: "footer", message: `Rodapé excede ${MAX_FOOTER} caracteres.`, severity: "error" });
    }
    if (VARIABLE_REGEX.test(form.footer)) {
      errors.push({ field: "footer", message: "Rodapé não pode conter variáveis.", severity: "error" });
    }
    if (EMOJI_REGEX.test(form.footer)) {
      errors.push({ field: "footer", message: "Rodapé não pode conter emojis.", severity: "error" });
    }
    if (MARKDOWN_REGEX.test(form.footer)) {
      errors.push({ field: "footer", message: "Rodapé não pode conter formatação (* _ ~).", severity: "error" });
    }
  }

  // ── Buttons ─────────────────────────────────────────────────
  if (form.buttons.length > MAX_BUTTONS_TOTAL) {
    errors.push({ field: "buttons", message: `Máximo de ${MAX_BUTTONS_TOTAL} botões permitidos.`, severity: "error" });
  }

  const urlCount = form.buttons.filter((b) => b.type === "URL").length;
  const phoneCount = form.buttons.filter((b) => b.type === "PHONE_NUMBER").length;
  const copyCodeCount = form.buttons.filter((b) => b.type === "COPY_CODE").length;

  if (urlCount > MAX_URL_BUTTONS) {
    errors.push({ field: "buttons", message: `Máximo de ${MAX_URL_BUTTONS} botões de URL permitidos.`, severity: "error" });
  }
  if (phoneCount > MAX_PHONE_BUTTONS) {
    errors.push({ field: "buttons", message: `Máximo de ${MAX_PHONE_BUTTONS} botão de telefone permitido.`, severity: "error" });
  }
  if (copyCodeCount > MAX_COPY_CODE_BUTTONS) {
    errors.push({ field: "buttons", message: `Máximo de ${MAX_COPY_CODE_BUTTONS} botão "Copiar código" permitido.`, severity: "error" });
  }

  form.buttons.forEach((btn, i) => {
    const label = `Botão ${i + 1}`;

    if (!btn.text?.trim() && btn.type !== "COPY_CODE") {
      errors.push({ field: `button_${i}`, message: `${label}: texto é obrigatório.`, severity: "error" });
    }
    if (btn.text && btn.text.length > MAX_BUTTON_LABEL) {
      errors.push({ field: `button_${i}`, message: `${label}: texto excede ${MAX_BUTTON_LABEL} caracteres.`, severity: "error" });
    }

    if (btn.type === "URL") {
      if (!btn.url?.trim()) {
        errors.push({ field: `button_${i}`, message: `${label}: URL é obrigatória.`, severity: "error" });
      } else {
        if (btn.url.length > MAX_BUTTON_URL) {
          errors.push({ field: `button_${i}`, message: `${label}: URL excede ${MAX_BUTTON_URL} caracteres.`, severity: "error" });
        }
        const urlWithoutVars = btn.url.replace(/\{\{\d+\}\}/g, "");
        if (!/^https?:\/\//i.test(urlWithoutVars)) {
          errors.push({ field: `button_${i}`, message: `${label}: URL deve começar com https://`, severity: "error" });
        }
      }
    }

    if (btn.type === "PHONE_NUMBER") {
      if (!btn.phone_number?.trim()) {
        errors.push({ field: `button_${i}`, message: `${label}: número de telefone é obrigatório.`, severity: "error" });
      } else if (btn.phone_number.length > MAX_BUTTON_PHONE) {
        errors.push({ field: `button_${i}`, message: `${label}: telefone excede ${MAX_BUTTON_PHONE} caracteres.`, severity: "error" });
      }
    }

    if (btn.type === "COPY_CODE") {
      if (btn.example && btn.example.length > MAX_COPY_CODE_EXAMPLE) {
        errors.push({
          field: `button_${i}`,
          message: `${label}: exemplo do código excede ${MAX_COPY_CODE_EXAMPLE} caracteres. A Meta limita este campo a ${MAX_COPY_CODE_EXAMPLE} caracteres.`,
          severity: "error",
        });
      }
    }
  });

  // ── Sample values ───────────────────────────────────────────
  const allBodyVars = [...(form.body.matchAll(VARIABLE_REGEX) || [])].map((m) => parseInt(m[1], 10));
  const uniqueBodyVars = [...new Set(allBodyVars)];
  if (uniqueBodyVars.length > 0 && form.sample_values) {
    const missing = uniqueBodyVars.filter((n) => !form.sample_values?.[n - 1]?.trim());
    if (missing.length > 0) {
      errors.push({
        field: "sample_values",
        message: `Preencha os valores de exemplo para: ${missing.map((n) => `{{${n}}}`).join(", ")}. A Meta exige exemplos para aprovar.`,
        severity: "warning",
      });
    }
  }

  return errors;
}

/** Map Meta API error subcodes to user-friendly Portuguese messages */
export function mapMetaSubcodeToMessage(subcode: number | undefined): string | null {
  if (!subcode) return null;

  const map: Record<number, string> = {
    2388023: "Não é possível criar template neste idioma enquanto o conteúdo anterior está sendo excluído. Tente novamente em 4 semanas ou crie com nome diferente.",
    2388024: "Template já existe na Meta com este nome e idioma. Renomeie o template ou altere o idioma.",
    2388019: "Limite de 250 templates atingido na conta WABA. Exclua templates antigos antes de criar novos.",
    2388040: "Um ou mais campos excedem o limite de caracteres da Meta. Verifique cabeçalho (60), corpo (1024), rodapé (60) e botões (25).",
    2388047: "O cabeçalho contém conteúdo inválido. Remova emojis, formatação e quebras de linha.",
    2388072: "O corpo do template contém formatação ou estrutura inválida. Verifique a ordem das variáveis e remova caracteres especiais.",
    2388073: "O rodapé contém conteúdo inválido. Use apenas texto simples, sem variáveis, emojis ou formatação.",
    2388293: "O corpo tem muitas variáveis em relação ao texto fixo. Adicione mais conteúdo fixo entre as variáveis.",
    2388299: "Variáveis não podem estar no início ou no fim do corpo do template. Adicione texto fixo antes e depois.",
    80008: "Limite de requisições atingido (100 templates/hora). Aguarde alguns minutos e tente novamente.",
  };

  return map[subcode] || null;
}
