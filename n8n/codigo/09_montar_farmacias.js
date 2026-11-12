/*__COMUM__*/
// MONTAR RESPOSTA DAS FARMÁCIAS: até 3 farmácias da lista oficial + o que levar. Texto fixo (sem IA),
// para nomes e endereços saírem exatamente como estão no banco.
// modo (vem do banco): 'distancia' | 'bairro' | 'municipio' | 'sem_localizacao'
// Serve para os dois caminhos: por CEP ("Ler CEP" -> "Farmácias mais próximas")
// e pelo nome da cidade ("Farmácias pela cidade").
const r = $input.first().json.r || {};
const d = $('Decidir rota').first().json;
const porCidade = d.rota === 'cidade';
const DISTANCIA_MAX_KM = 30;

let cep = {};
if (porCidade) {
  if (r.modo === 'cidade_nao_achada') {
    return [{ json: fim(d, { resposta: MSG.CIDADE_NAO_ACHADA, evento: 'cidade_nao_achada' }) }];
  }
  cep = { cep_encontrado: true, municipio: r.cidade, uf: r.uf };
} else {
  cep = $('Ler CEP').first().json;
  if (!cep.cep_encontrado) {
    return [{ json: fim(d, { resposta: MSG.CEP_NAO_ACHADO, evento: 'cep_nao_achado' }) }];
  }
}
const cepFmt = porCidade ? '' : d.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
// A lista oficial vem em MAIÚSCULAS: cidade e bairro ficam "Vila Mariana", "São Paulo" (mais fácil de ler)
const titulo = (s) => (!s || s !== s.toUpperCase()) ? s : s.toLowerCase()
  .replace(/(^|[\s(\/-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\s(De|Da|Do|Das|Dos|E|D)(?=\s)/g, (m) => m.toLowerCase());
if (cep.municipio) cep.municipio = titulo(cep.municipio);
const cidadeUf = cep.municipio ? `${cep.municipio}${cep.uf && cep.uf !== '-' ? '/' + cep.uf : ''}` : 'sua cidade';

// O nome na lista oficial é a razão social: tira só os sufixos de empresa para ficar mais fácil de ler
const nomeLegivel = (n) => (n || '')
  .replace(/\s*[-–]?\s*\b(LTDA\.?|EIRELI|EPP|ME|S\/?A|S\.A\.?)\s*$/i, '')
  .replace(/\s*[-–]?\s*\b(LTDA\.?|EIRELI|EPP|ME)\s*$/i, '')
  .trim() || n;

const farmacias = (r.farmacias || []).filter((f) => f.distancia_km == null || Number(f.distancia_km) <= DISTANCIA_MAX_KM);
const extra = (d.contexto.tem_insumo ? '\n\n' + MSG.INSUMO : '');

let resposta;
if (!farmacias.length) {
  resposta = `${MSG.SEM_FARMACIA_PERTO}\n\n${MSG.O_QUE_LEVAR}${extra}`;
} else {
  const linhas = farmacias.map((f, i) => {
    const dist = f.distancia_km != null ? ` _(cerca de ${String(f.distancia_km).replace('.', ',')} km)_` : '';
    const local = [titulo(f.bairro), f.municipio && f.uf ? `${titulo(f.municipio)}/${f.uf}` : titulo(f.municipio)].filter(Boolean).join(', ');
    return `🏥 *${i + 1}. ${nomeLegivel(f.nome)}*${dist}\n📍 ${f.endereco}\n      ${local}`;
  });
  const total = Number(r.total_na_cidade) || farmacias.length;
  const qtd = `*${total} ${total === 1 ? 'farmácia' : 'farmácias'}* do Farmácia Popular`;
  let intro;
  if (r.modo === 'distancia') intro = `*Achei estas farmácias do Farmácia Popular perto do CEP ${cepFmt}:*`;
  else if (r.modo === 'bairro') {
    intro = porCidade
      ? `*Achei estas farmácias do Farmácia Popular nesse bairro, em ${cidadeUf}:*`
      : `*Achei estas farmácias do Farmácia Popular no seu bairro* (CEP ${cepFmt}):`;
  } else if (porCidade && !r.bairro_pedido) {
    intro = `*${cidadeUf}* tem ${qtd}. Algumas delas:`;
  } else {
    intro = `Não achei farmácia do programa nesse bairro, mas *${cidadeUf}* tem ${qtd}. Algumas delas:`;
  }
  // Cidade com o mesmo nome em outro estado (ex.: Santa Luzia MG/PB): ensina a escolher
  const outras = porCidade ? (r.outras_ufs || []) : [];
  const dicaUf = outras.length
    ? `\n\n💡 _Se não for essa, escreva a cidade com o estado. Ex.:_ *${cep.municipio} ${outras[0]}*`
    : '';
  const dicaBairro = (porCidade && r.modo === 'municipio' && total > 3)
    ? '\n\n💡 _Pra achar mais perto, me manda o seu_ *CEP* _ou o_ *bairro* _junto com a cidade._'
    : '';
  resposta = `${intro}\n\n${linhas.join('\n\n')}${dicaUf}${dicaBairro}\n\n${MSG.NOME_FACHADA}\n\n${MSG.O_QUE_LEVAR}${extra}\n\n${MSG.CONFIRA_ESTOQUE}`;
}

return [{
  json: fim(d, {
    resposta,
    novo_estado: 'concluido',
    novo_contexto: {},
    evento: 'farmacias',
    detalhe: { modo: r.modo, encontradas: farmacias.length, municipio: cep.municipio || null, uf: cep.uf || null },
  }),
}];
