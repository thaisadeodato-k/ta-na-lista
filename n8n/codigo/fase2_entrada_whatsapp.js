// FASE 2 — substitui o código do nó "Entrada → formato padrão".
// ATENÇÃO: o nó precisa continuar com o nome EXATO "Entrada → formato padrão",
// porque o nó "Decidir rota" lê os dados por esse nome.
//
// Ele recebe a saída do nó "Meta: baixar mídia" (quando houve foto/áudio) ou
// direto do "WhatsApp: separar mensagem" (quando foi só texto).
const sep = $('WhatsApp: separar mensagem').first().json;
const item = $input.first();

let imagem_base64 = null, imagem_mime = null, imagem_bytes = 0;
const mime = (sep.media_mime || '').toLowerCase().split(';')[0];
const chave = Object.keys(item.binary || {})[0];

if (sep.tipo === 'image' && chave) {
  const buf = await this.helpers.getBinaryDataBuffer(0, chave);
  imagem_base64 = buf.toString('base64');
  imagem_mime = mime === 'image/jpg' ? 'image/jpeg' : mime;
  imagem_bytes = buf.length;
}

return [{
  json: {
    canal: 'whatsapp',
    id_bruto: 'wa:' + sep.de,
    para: sep.de, // usado SÓ pelo nó de saída para responder; nunca é salvo
    texto: (sep.texto || '').toString().trim(),
    imagem_base64, imagem_mime, imagem_bytes,
    tem_audio: sep.tipo === 'audio',
    outro_arquivo: !['text', 'image', 'audio'].includes(sep.tipo),
  },
}];
