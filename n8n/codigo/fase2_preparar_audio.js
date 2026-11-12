// FASE 2 — nó "Preparar áudio" (só para mensagens de voz).
// O serviço de transcrição descobre o formato pela extensão do arquivo, e o arquivo
// que a Meta entrega pode vir sem nome. Aqui damos um nome com a extensão certa.
// Só chega aqui quem já respondeu SIM ao consentimento.
// O áudio fica só na memória desta execução; nada é salvo.
const baixado = $('Meta: baixar mídia').first();
const item = { json: {}, binary: baixado.binary || {} };
const b = item.binary.data;
if (b) {
  const sep = $('WhatsApp: separar mensagem').first().json;
  const mime = ((b.mimeType || sep.media_mime || '') + '').toLowerCase().split(';')[0].trim();
  const ext = {
    'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/amr': 'amr',
  }[mime] || 'ogg';
  b.fileName = 'audio.' + ext;
}
return [item];
