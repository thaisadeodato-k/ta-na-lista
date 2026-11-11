/*__COMUM__*/
// MONTAR RESPOSTA DAS FARMÁCIAS: lista as 3 mais próximas + o que levar. Texto fixo (sem IA),
// para nomes e endereços saírem exatamente como estão no banco.
const r = $input.first().json.r || {};
const d = $('Decidir rota').first().json;
const cep = $('Ler CEP').first().json;
const cepFmt = d.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
const DISTANCIA_MAX_KM = 30;

if (!cep.cep_encontrado) {
  return [{ json: fim(d, { resposta: MSG.CEP_NAO_ACHADO, evento: 'cep_nao_achado' }) }];
}

const farmacias = (r.farmacias || []).filter((f) => f.distancia_km == null || Number(f.distancia_km) <= DISTANCIA_MAX_KM);
const extra = (d.contexto.tem_insumo ? '\n' + MSG.INSUMO : '');

let resposta;
if (!farmacias.length) {
  resposta = `${MSG.SEM_FARMACIA_PERTO}\n\n${MSG.O_QUE_LEVAR}${extra}`;
} else {
  const linhas = farmacias.map((f, i) => {
    const dist = f.distancia_km != null ? ` (cerca de ${String(f.distancia_km).replace('.', ',')} km)` : '';
    return `${i + 1}) ${f.nome}${dist}\n   ${f.endereco} – ${f.municipio}`;
  });
  resposta = `Achei estas farmácias do Farmácia Popular perto do CEP ${cepFmt}:\n\n${linhas.join('\n')}\n\n${MSG.O_QUE_LEVAR}${extra}\n\n${MSG.CONFIRA_ESTOQUE}`;
}

return [{
  json: fim(d, {
    resposta,
    novo_estado: 'concluido',
    novo_contexto: {},
    evento: 'farmacias',
    detalhe: { modo: r.modo, encontradas: farmacias.length, municipio: cep.municipio || null },
  }),
}];
