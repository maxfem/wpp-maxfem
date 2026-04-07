import { MessageSquare, FileText, Send } from "lucide-react";

interface PreviewButton {
  type: string;
  text: string;
}

interface WhatsAppPhonePreviewProps {
  companyName: string;
  headerType: string;
  headerContent: string;
  body: string;
  footer: string;
  buttons: PreviewButton[];
  sampleValues?: string[];
}

export function WhatsAppPhonePreview({
  companyName,
  headerType,
  headerContent,
  body,
  footer,
  buttons,
  sampleValues = [],
}: WhatsAppPhonePreviewProps) {
  // Replace {{1}}, {{2}}, etc. with sample values
  const renderedBody = body.replace(/\{\{(\d+)\}\}/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    return sampleValues[idx] || match;
  });
  return (
    <div className="mx-auto w-[280px] shrink-0">
      <div className="rounded-[2rem] border-[5px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
        {/* Status bar */}
        <div className="bg-[#075e54] h-5 flex items-center justify-center">
          <div className="w-14 h-2.5 bg-gray-900 rounded-full" />
        </div>
        {/* WhatsApp Header */}
        <div className="bg-[#075e54] px-3 py-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#25d366]/30 flex items-center justify-center">
            <MessageSquare className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-xs leading-tight">{companyName || "Empresa"}</p>
            <p className="text-green-200 text-[10px]">online</p>
          </div>
        </div>
        {/* Chat Area */}
        <div
          className="min-h-[320px] p-3 flex flex-col justify-end"
          style={{
            backgroundColor: "#e5ddd5",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c3ba' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className="max-w-[220px]">
            {/* Message Bubble */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* Header */}
              {headerType === "text" && headerContent && (
                <div className="px-2.5 pt-2.5">
                  <p className="font-semibold text-xs text-gray-900">{headerContent}</p>
                </div>
              )}
              {headerType === "image" && (
                <div className="bg-gray-200 h-28 flex items-center justify-center">
                  <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                </div>
              )}
              {headerType === "video" && (
                <div className="bg-gray-200 h-28 flex items-center justify-center">
                  <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
                </div>
              )}
              {headerType === "document" && (
                <div className="bg-gray-200 h-16 flex items-center justify-center gap-2">
                  <FileText className="h-6 w-6 text-gray-400" />
                  <span className="text-[10px] text-gray-500">Documento</span>
                </div>
              )}
              {/* Body */}
              <div className="px-2.5 py-1.5">
                <p className="text-[12px] text-gray-900 whitespace-pre-wrap leading-relaxed">
                  {body || "Corpo da mensagem..."}
                </p>
              </div>
              {/* Footer */}
              {footer && (
                <div className="px-2.5 pb-1.5">
                  <p className="text-[10px] text-gray-500 italic">{footer}</p>
                </div>
              )}
            </div>
            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="mt-1 space-y-[2px]">
                {buttons.map((btn, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg py-1.5 text-center text-[11px] text-[#00a5f4] font-medium shadow-sm flex items-center justify-center gap-1"
                  >
                    {btn.type === "URL" && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L9.75 14.25" /></svg>
                    )}
                    {btn.type === "PHONE_NUMBER" && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                    )}
                    {btn.type === "QUICK_REPLY" && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                    )}
                    {btn.text || "Botão"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Bottom bar */}
        <div className="bg-[#f0f0f0] px-2 py-1.5 flex items-center gap-2">
          <div className="flex-1 bg-white rounded-full px-3 py-1 text-[10px] text-gray-400">
            Mensagem
          </div>
          <div className="w-7 h-7 rounded-full bg-[#25d366] flex items-center justify-center">
            <Send className="h-3 w-3 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
