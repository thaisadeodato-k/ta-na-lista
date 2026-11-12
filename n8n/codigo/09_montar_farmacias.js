/*__COMUM__*/
// MONTAR RESPOSTA DAS FARMÁCIAS: até 3 farmácias da lista oficial + o que levar. Texto fixo (sem IA),
// para nomes e endereços saírem exatamente como estão no banco (ver respostaFarmacias nos trechos comuns).
// Serve para os dois caminhos: por CEP ("Ler CEP" -> "Farmácias mais próximas")
// e pelo nome da cidade ("Farmácias pela cidade").
const r = $input.first().json.r || {};
const d = $('Decidir rota').first().json;
const porCidade = d.rota === 'cidade';

let municipio, uf;
if (porCidade) {
  if (r.modo === 'cidade_nao_achada') {
    return [{ json: fim(d, { resposta: MSG.CIDADE_NAO_ACHADA, evento: 'cidade_nao_achada' }) }];
  }
  municipio = r.cidade; uf = r.uf;
} else {
  const cep = $('Ler CEP').first().json;
  if (!cep.cep_encontrado) {
    return [{ json: fim(d, { resposta: MSG.CEP_NAO_ACHADO, evento: 'cep_nao_achado' }) }];
  }
  municipio = cep.municipio; uf = cep.uf;
}
const cepFmt = porCidade ? '' : d.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
const out = respostaFarmacias({ d, r, porCidade, municipio, uf, cepFmt });

return [{
  json: fim(d, {
    resposta: out.resposta,
    novo_estado: 'concluido',
    novo_contexto: contextoPosFarmacias(d), // permite corrigir o lugar sem recomeçar
    evento: 'farmacias',
    detalhe: { modo: r.modo, encontradas: out.encontradas, municipio: titulo(municipio) || null, uf: uf || null, via: porCidade ? 'cidade' : 'cep' },
  }),
}];
