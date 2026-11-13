// FASE 2 — nó "WhatsApp: separar mensagem" (logo depois do WhatsApp Trigger).
// Pega a mensagem que chegou da Meta e separa: quem mandou, texto, ID da mídia e
// o número do bot que recebeu (para responder pelo mesmo número).
// Avisos de "entregue/lido" (statuses) não são mensagens: o fluxo para aqui.
const v = $input.first().json || {};
const valor = v.value || v; // o WhatsApp Trigger às vezes entrega dentro de "value"
const m = (valor.messages || [])[0];
if (!m) return []; // não é mensagem nova (ex.: status de entrega)

// Celulares do Brasil: às vezes a Meta entrega o número sem o 9 (55 + DDD + 8 dígitos).
// Para responder, colocamos o 9 de volta; senão o envio é recusado.
let para = String(m.from || '');
if (/^55\d{10}$/.test(para) && /[6-9]/.test(para[4])) para = para.slice(0, 4) + '9' + para.slice(4);

// Toque num botão ou numa opção do menu: vira texto, como se a pessoa tivesse escrito o comando
const it = m.interactive || {};
const toque = (it.button_reply || it.list_reply || {}).id || (m.button || {}).payload || (m.button || {}).text || null;
const tipo = toque ? 'text' : m.type; // text | image | audio | document | ...
const doc = m.document || {};
const ehPdf = tipo === 'document' && (doc.mime_type || '').toLowerCase().startsWith('application/pdf');
return [{
  json: {
    para, // telefone: fica só na memória desta execução; no banco vira hash
    id_bruto: 'wa:' + para,
    phone_number_id: (valor.metadata || {}).phone_number_id,
    tipo,
    texto: toque ? String(toque).slice(0, 200) : tipo === 'text' ? ((m.text || {}).body || '') : ((m.image || {}).caption || (m.document || {}).caption || ''),
    // Fotos, PDFs e áudios são baixados (outros arquivos recebem resposta pronta, sem download)
    media_id: (m.image || {}).id || (ehPdf ? doc.id : null) || (m.audio || {}).id || null,
    media_mime: (m.image || {}).mime_type || (ehPdf ? doc.mime_type : null) || (m.audio || {}).mime_type || null,
    eh_pdf: ehPdf,
  },
}];
