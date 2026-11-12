/*__COMUM__*/
// MONTAR LISTA: responde "quais remédios são de graça?" com a lista oficial que veio do banco.
// Sem IA: o texto é montado aqui, a partir da consulta "Listar remédios da lista oficial".
// Não muda o estado da conversa (a pessoa pode continuar de onde estava).
const d = $('Decidir rota').first().json;
const grupos = $input.first().json.r || [];

const NOMES = {
  'HIPERTENSAO': 'Pressão alta',
  'DIABETES': 'Diabetes',
  'DIABETES MELLITUS DOENCA CARDIOVASCULAR': 'Diabetes com doença do coração',
  'DISLIPIDEMIA': 'Colesterol',
  'ASMA': 'Asma',
  'RINITE': 'Rinite',
  'DOENCA DE PARKINSON': 'Parkinson',
  'GLAUCOMA': 'Glaucoma',
  'OSTEOPOROSE': 'Osteoporose',
  'ANTICONCEPCAO': 'Anticoncepcional',
  'INCONTINENCIA URINARIA': 'Incontinência urinária',
  'DIGNIDADE MENSTRUAL': 'Dignidade menstrual',
};
const ORDEM = Object.keys(NOMES); // pressão e diabetes primeiro (as mais comuns)
const rotulo = (ind) => NOMES[normCmd(ind)] || cap((ind || '').toLowerCase());
const posicao = (ind) => { const i = ORDEM.indexOf(normCmd(ind)); return i < 0 ? 99 : i; };
const conc = (c) => String(c)
  .replace(/(\d)\s*(mg|mcg|ml|ui|g)\b/gi, '$1 $2')
  .replace(/\bui\b/gi, 'UI').replace(/\bml\b/gi, 'mL')
  .replace(/\s*\(.*?\)/g, '');
grupos.sort((a, b) => posicao(a.indicacao) - posicao(b.indicacao));

if (!grupos.length) {
  return [{ json: fim(d, { resposta: MSG.LISTA_VAZIA, evento: 'pergunta_lista', detalhe: { filtro: d.filtro_lista } }) }];
}

const EMOJI = {
  'HIPERTENSAO': '❤️', 'DIABETES': '🩸', 'DIABETES MELLITUS DOENCA CARDIOVASCULAR': '💗', 'DISLIPIDEMIA': '🧪',
  'ASMA': '🫁', 'RINITE': '👃', 'DOENCA DE PARKINSON': '🧠', 'GLAUCOMA': '👁️', 'OSTEOPOROSE': '🦴',
  'ANTICONCEPCAO': '💊', 'INCONTINENCIA URINARIA': '🩲', 'DIGNIDADE MENSTRUAL': '🌸',
};
const blocos = grupos.map((g) => {
  const itens = (g.itens || []).map((i) => {
    const cs = [...new Set((i.concentracoes || []).map(conc))];
    return `• ${i.nome}${cs.length ? ` _(${cs.join(', ')})_` : ''}`;
  });
  return `${EMOJI[normCmd(g.indicacao)] || '💊'} *${rotulo(g.indicacao)}*\n${itens.join('\n')}`;
});

const todos = d.filtro_lista === '-';
const resposta =
  (todos
    ? '💊 *Remédios e itens DE GRAÇA no Farmácia Popular*\n_Lista oficial do Ministério da Saúde_\n\n'
    : '💊 *Da lista oficial do Farmácia Popular, estes saem DE GRAÇA:*\n\n') +
  blocos.join('\n\n') +
  '\n\n━━━━━━━━━━\n' +
  '👨‍⚕️ _Quem indica o remédio é o médico._\n\n' +
  (todos ? '🔎 Pra ver só de uma doença, escreva por exemplo: *LISTA DIABETES*\n' : '') +
  '📸 Manda a foto da receita que eu confiro se o seu tá na lista.';

return [{ json: fim(d, { resposta, evento: 'pergunta_lista', detalhe: { filtro: d.filtro_lista } }) }];
