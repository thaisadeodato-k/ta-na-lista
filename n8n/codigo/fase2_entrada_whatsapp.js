// FASE 2 — nó "Entrada → formato padrão" do fluxo do WhatsApp.
// ATENÇÃO: o nó precisa ter o nome EXATO "Entrada → formato padrão",
// porque o nó "Decidir rota" lê os dados por esse nome.
//
// Recebe a saída do nó "Meta: baixar mídia" (quando houve foto ou PDF), do
// "Transcrever áudio (Groq)" (quando foi áudio) ou direto do "Tem mídia?" (só texto).
const sep = $('WhatsApp: separar mensagem').first().json;
const item = $input.first();

let imagem_base64 = null, imagem_mime = null, imagem_bytes = 0;
const chave = Object.keys(item.binary || {})[0];

if ((sep.tipo === 'image' || sep.eh_pdf) && chave) {
  const buf = await this.helpers.getBinaryDataBuffer(0, chave);
  const mime = ((sep.media_mime || item.binary[chave].mimeType || '') + '').toLowerCase().split(';')[0].trim();
  imagem_base64 = buf.toString('base64');
  imagem_mime = mime === 'image/jpg' ? 'image/jpeg' : mime;
  imagem_bytes = buf.length;
}

// Áudio: o texto falado vira a mensagem, como se a pessoa tivesse digitado.
// Se a transcrição falhar (ou vier vazia), o Zé pede para mandar de outro jeito.
// Quem ainda não respondeu SIM não tem o áudio transcrito (o Zé só pede o consentimento).
let texto = (sep.texto || '').toString().trim();
let tem_audio = false;
if (sep.tipo === 'audio') {
  let falado = '';
  try { falado = ((($('Transcrever áudio (Groq)').first() || {}).json || {}).text || '').toString().trim(); } catch (e) { falado = ''; }
  // O Whisper às vezes "inventa" legendas quando o áudio é silêncio ou ruído
  if (/amara\.org|legendas? (pela|por)|obrigad[oa] por assistir|inscreva-se/i.test(falado)) falado = '';
  if (falado) texto = falado.slice(0, 1000); else tem_audio = true;
}

return [{
  json: {
    canal: 'whatsapp',
    id_bruto: sep.id_bruto, // o 9 dos celulares já foi corrigido no "WhatsApp: separar mensagem"
    para: sep.para, // usado SÓ pelo nó de saída para responder; nunca é salvo
    texto,
    imagem_base64, imagem_mime, imagem_bytes,
    tem_audio, // true só quando o áudio não pôde ser entendido
    outro_arquivo: !['text', 'image', 'audio'].includes(sep.tipo) && !sep.eh_pdf,
  },
}];
