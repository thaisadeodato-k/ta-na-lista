/*__COMUM__*/
// MONTAR CONFIRMAÇÃO: mostra o que foi lido e pede SIM.
// O resultado da base oficial já fica guardado (só referências à lista), mas só é contado depois do SIM.
const ext = $('Ler extração').first().json;
if (!ext.consultar) return [{ json: ext }]; // já veio com resposta pronta

const d = $('Decidir rota').first().json;
const resultados = $input.first().json.r || [];
const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const linhas = ext.meds.map((m) => {
  const v = resultados.find((x) => x.ordem === m.ordem) || {};
  let l = `${m.ordem}) ${m.nome_escrito}${m.concentracao ? ' ' + m.concentracao : ''}`;
  if (v.marca_reconhecida && v.principio_ativo) {
    l += ` (é nome de marca; o genérico é ${v.principio_ativo})`;
  } else if (v.principio_ativo && semAcento(v.principio_ativo) !== semAcento(m.nome_escrito)) {
    l += ` (entendi como: ${v.principio_ativo})`;
  }
  if (m.confianca === 'baixa') l += ' (não tenho certeza dessa leitura)';
  return l;
});

// Contexto salvo: SEM nome escrito, SEM texto livre. Só referências à lista oficial.
const itens = ext.meds.map((m) => {
  const v = resultados.find((x) => x.ordem === m.ordem) || { status: 'nao_encontrado' };
  if (v.status === 'nao_encontrado') return { numero: m.ordem, situacao: 'nao_encontrado' };
  return {
    numero: m.ordem,
    situacao: v.status,
    remedio_na_lista: v.principio_ativo,
    marca: v.marca_reconhecida || undefined, // nome da tabela de marcas (não é o texto escrito pela pessoa)
    tipo: v.tipo,
    concentracoes_na_lista: v.concentracoes_oficiais || [],
    concentracao_da_receita: m.concentracao,
  };
});

const resposta = `${d.aviso}Li isso aqui:\n${linhas.join('\n')}\n\nTá certo? Responda SIM. Se algo estiver errado, escreva o nome certo do remédio.`;

return [{
  json: fim(d, {
    resposta,
    novo_estado: 'aguardando_confirmacao',
    novo_contexto: { itens, data_receita: ext.data_receita },
    evento: 'receita_lida',
    detalhe: { via: d.imagem_mime === 'application/pdf' ? 'pdf' : (d.imagem_mime ? 'foto' : 'texto'), itens: itens.length },
  }),
}];
