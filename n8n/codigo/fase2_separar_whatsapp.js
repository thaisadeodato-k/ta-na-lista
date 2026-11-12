// FASE 2 — nó "WhatsApp: separar mensagem" (logo depois do WhatsApp Trigger).
// Pega a mensagem que chegou da Meta e separa: quem mandou, texto, ID da mídia e
// o número do bot que recebeu (para responder pelo mesmo número).
// Avisos de "entregue/lido" (statuses) não são mensagens: o fluxo para aqui.
const v = $input.first().json || {};
const valor = v.value || v; // o WhatsApp Trigger às vezes entrega dentro de "value"
const m = (valor.messages || [])[0];
if (!m) return []; // não é mensagem nova (ex.: status de entrega)

const tipo = m.type; // text | image | audio | document | ...
return [{
  json: {
    de: m.from, // telefone: fica só na memória desta execução; no banco vira hash
    phone_number_id: (valor.metadata || {}).phone_number_id,
    tipo,
    texto: tipo === 'text' ? ((m.text || {}).body || '') : ((m.image || {}).caption || (m.document || {}).caption || ''),
    // Só fotos são baixadas (áudio e documentos recebem resposta pronta, sem download)
    media_id: (m.image || {}).id || null,
    media_mime: (m.image || {}).mime_type || null,
  },
}];
