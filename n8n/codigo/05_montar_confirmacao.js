/*__COMUM__*/
// MONTAR CONFIRMAÇÃO: mostra o que foi lido e pede SIM.
// O resultado da base oficial já fica guardado (só referências à lista), mas só é contado depois do SIM.
// Também cuida do LUGAR que a pessoa disse (cidade/bairro/CEP), junto com o remédio ou sozinho.
const ext = $('Ler extração').first().json;
const d = $('Decidir rota').first().json;
const consulta = $input.first().json;
const rLocal = consulta.local || {};
const localTxt = Buffer.from(ext.local_b64 || '', 'base64').toString('utf8').trim();
const cepDito = ((localTxt.match(/\d/g) || []).join('').match(/^\d{8}$/) || [])[0] || null;
// O que fica guardado do lugar: só o CEP (números) ou a cidade/bairro reconhecidos na lista oficial
const local = cepDito ? { cep: cepDito } : localReconhecido(rLocal);
const ctx = d.contexto || {};

// 1) A pessoa só disse o lugar (ex.: "não, é Santa Luzia PB")
if (ext.so_local) {
  if (!local) {
    return [{ json: fim(d, { resposta: MSG.CIDADE_NAO_ACHADA, evento: 'cidade_nao_achada' }) }];
  }
  if (cepDito) {
    return [{ json: fim(d, {
      resposta: `📍 Procuro farmácias perto do CEP *${cepDito.replace(/(\d{5})(\d{3})/, '$1-$2')}*?\n\n✅ Responda *SIM*`,
      novo_estado: 'aguardando_cep', novo_contexto: { ...ctx, local }, evento: 'local_informado',
      botoes: [BT.SIM, BT.OUTRO_LUGAR],
    }) }];
  }
  // Ainda falta a receita: anota o lugar e segue de onde estava
  if (d.estado_atual === 'aguardando_receita' || d.estado_atual === 'novo') {
    return [{ json: fim(d, {
      resposta: `📍 Anotei: *${localTexto(local)}*\n\nAgora é só mandar a receita:\n\n${COMO_MANDAR}`,
      novo_estado: 'aguardando_receita', novo_contexto: { ...ctx, local }, evento: 'local_informado',
    }) }];
  }
  if (d.estado_atual === 'aguardando_confirmacao') {
    return [{ json: fim(d, {
      resposta: `📍 Anotei: *${localTexto(local)}*\n\n${MSG.CONFIRMAR_DE_NOVO}`,
      novo_contexto: { ...ctx, local }, evento: 'local_informado',
      botoes: [BT.TA_CERTO, BT.TA_ERRADO],
    }) }];
  }
  // Depois do resultado ou das farmácias: mostra as farmácias do lugar novo (sem recomeçar)
  const out = respostaFarmacias({ d, r: rLocal, porCidade: true, municipio: rLocal.cidade, uf: rLocal.uf, cepFmt: '' });
  return [{ json: fim(d, {
    resposta: out.resposta, novo_estado: 'concluido', novo_contexto: contextoPosFarmacias(d), evento: 'farmacias',
    detalhe: { modo: rLocal.modo, encontradas: out.encontradas, municipio: local.cidade, uf: local.uf, via: 'correcao_local' },
    botoes: BOTOES_POS_FARMACIAS,
  }) }];
}

if (!ext.consultar) return [{ json: ext }]; // já veio com resposta pronta

// 2) Remédios lidos (talvez com o lugar junto)
const resultados = consulta.r || [];
const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const NUM = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const linhas = ext.meds.map((m) => {
  const v = resultados.find((x) => x.ordem === m.ordem) || {};
  let l = `${NUM[m.ordem] || m.ordem + ')'} *${m.nome_escrito}*${m.concentracao ? ' ' + m.concentracao : ''}`;
  if (v.marca_reconhecida && v.principio_ativo) {
    l += `\n      _é nome de marca; o genérico é ${v.principio_ativo}_`;
  } else if (v.principio_ativo && semAcento(v.principio_ativo) !== semAcento(m.nome_escrito)) {
    l += `\n      _entendi como: ${v.principio_ativo}_`;
  }
  if (m.confianca === 'baixa') l += '\n      ⚠️ _não tenho certeza dessa leitura_';
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

// Lugar: o que veio agora, ou o que a pessoa já tinha dito antes
const localFinal = local || ctx.local || null;
const linhaLocal = localFinal
  ? `\n\n📍 *Farmácias perto de:* ${localFinal.cep ? 'CEP ' + localFinal.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : localTexto(localFinal)}`
  : '';

const resposta = `${d.aviso}📋 *Li isso aqui:*\n\n${linhas.join('\n\n')}${linhaLocal}\n\n` +
  `Tá certo?\n✅ Responda *SIM*\n✍️ Se algo estiver errado, escreva o *nome certo* do remédio` +
  (localFinal ? ' ou o lugar certo' : '');

return [{
  json: fim(d, {
    resposta,
    novo_estado: 'aguardando_confirmacao',
    novo_contexto: { itens, data_receita: ext.data_receita, ...(localFinal ? { local: localFinal } : {}) },
    evento: 'receita_lida',
    botoes: [BT.TA_CERTO, BT.TA_ERRADO],
    detalhe: { via: d.imagem_mime === 'application/pdf' ? 'pdf' : (d.imagem_mime ? 'foto' : 'texto'), itens: itens.length, com_local: !!localFinal },
  }),
}];
