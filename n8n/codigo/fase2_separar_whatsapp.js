// FASE 2 — nó "WhatsApp: separar mensagem" (logo depois do WhatsApp Trigger).
// Pega a mensagem que chegou da Meta e separa: quem mandou, texto e (se houver) o ID da mídia.
// Avisos de "entregue/lido" (statuses) não são mensagens: o fluxo para aqui.
const v = $input.first().json || {};
const valor = v.value || v; // o WhatsApp Trigger às vezes entrega dentro de "value"
const m = (valor.messages || [])[0];
if (!m) return []; // não é mensagem nova (ex.: status de entrega)

const tipo = m.type; // text | image | audio | document | ...
return [{
  json: {
    de: m.from, // telefone: fica só na memória desta execução; no banco vira hash
    tipo,
    texto: tipo === 'text' ? (m.text?.body || '') : (m.image?.caption || m.document?.caption || ''),
    media_id: m.image?.id || m.audio?.id || m.document?.id || null,
    media_mime: m.image?.mime_type || m.audio?.mime_type || m.document?.mime_type || null,
  },
}];
