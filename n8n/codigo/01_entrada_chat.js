// ENTRADA (FASE 1): converte a mensagem do chat de teste do n8n para o FORMATO PADRÃO.
// Na Fase 2, um nó "Entrada WhatsApp → formato padrão" faz o mesmo e o resto do fluxo não muda.
//
// FORMATO PADRÃO:
//   canal, id_bruto (vira hash no banco), texto, imagem_base64, imagem_mime, imagem_bytes,
//   ("imagem" aqui é a foto OU o PDF da receita)
//   tem_audio, outro_arquivo
const item = $input.first();
const j = item.json || {};

let imagem_base64 = null, imagem_mime = null, imagem_bytes = 0;
let tem_audio = false, outro_arquivo = false;

for (const chave of Object.keys(item.binary || {})) {
  const mime = (item.binary[chave].mimeType || '').toLowerCase();
  if ((mime.startsWith('image/') || mime === 'application/pdf') && !imagem_base64) {
    const buf = await this.helpers.getBinaryDataBuffer(0, chave);
    imagem_base64 = buf.toString('base64');
    imagem_mime = mime === 'image/jpg' ? 'image/jpeg' : mime;
    imagem_bytes = buf.length;
  } else if (mime.startsWith('audio/')) {
    tem_audio = true;
  } else if (!mime.startsWith('image/') && mime !== 'application/pdf') {
    outro_arquivo = true;
  }
}

return [{
  json: {
    canal: 'chat_n8n',
    id_bruto: 'chat:' + (j.sessionId || 'sem-sessao'),
    texto: (j.chatInput || '').toString().trim(),
    imagem_base64, imagem_mime, imagem_bytes, tem_audio, outro_arquivo,
  },
}];
