// FASE 2 — nó "Entrada → formato padrão" do fluxo do WhatsApp.
// ATENÇÃO: o nó precisa ter o nome EXATO "Entrada → formato padrão",
// porque o nó "Decidir rota" lê os dados por esse nome.
//
// Recebe a saída do nó "Meta: baixar mídia" (quando houve foto/áudio) ou
// direto do "Tem mídia?" (quando foi só texto).
const sep = $('WhatsApp: separar mensagem').first().json;
const item = $input.first();

let imagem_base64 = null, imagem_mime = null, imagem_bytes = 0;
const chave = Object.keys(item.binary || {})[0];

if (sep.tipo === 'image' && chave) {
  const buf = await this.helpers.getBinaryDataBuffer(0, chave);
  const mime = ((sep.media_mime || item.binary[chave].mimeType || '') + '').toLowerCase().split(';')[0].trim();
  imagem_base64 = buf.toString('base64');
  imagem_mime = mime === 'image/jpg' ? 'image/jpeg' : mime;
  imagem_bytes = buf.length;
}

// Celulares do Brasil: às vezes a Meta entrega o número sem o 9 (55 + DDD + 8 dígitos).
// Para responder, colocamos o 9 de volta; senão o número de teste recusa o envio.
let para = String(sep.de || '');
if (/^55\d{10}$/.test(para) && /[6-9]/.test(para[4])) para = para.slice(0, 4) + '9' + para.slice(4);

return [{
  json: {
    canal: 'whatsapp',
    id_bruto: 'wa:' + para,
    para, // usado SÓ pelo nó de saída para responder; nunca é salvo
    texto: (sep.texto || '').toString().trim(),
    imagem_base64, imagem_mime, imagem_bytes,
    tem_audio: sep.tipo === 'audio',
    outro_arquivo: !['text', 'image', 'audio'].includes(sep.tipo),
  },
}];
