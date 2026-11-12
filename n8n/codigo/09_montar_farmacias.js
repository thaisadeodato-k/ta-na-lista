/*__COMUM__*/
// MONTAR RESPOSTA DAS FARMÁCIAS: até 3 farmácias da lista oficial + o que levar. Texto fixo (sem IA),
// para nomes e endereços saírem exatamente como estão no banco.
// modo (vem do banco): 'distancia' | 'bairro' | 'municipio' | 'sem_localizacao'
const r = $input.first().json.r || {};
const d = $('Decidir rota').first().json;
const cep = $('Ler CEP').first().json;
const cepFmt = d.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
const DISTANCIA_MAX_KM = 30;

if (!cep.cep_encontrado) {
  return [{ json: fim(d, { resposta: MSG.CEP_NAO_ACHADO, evento: 'cep_nao_achado' }) }];
}

// O nome na lista oficial é a razão social: tira só os sufixos de empresa para ficar mais fácil de ler
const nomeLegivel = (n) => (n || '')
  .replace(/\s*[-–]?\s*\b(LTDA\.?|EIRELI|EPP|ME|S\/?A|S\.A\.?)\s*$/i, '')
  .replace(/\s*[-–]?\s*\b(LTDA\.?|EIRELI|EPP|ME)\s*$/i, '')
  .trim() || n;

const farmacias = (r.farmacias || []).filter((f) => f.distancia_km == null || Number(f.distancia_km) <= DISTANCIA_MAX_KM);
const extra = (d.contexto.tem_insumo ? '\n' + MSG.INSUMO : '');

let resposta;
if (!farmacias.length) {
  resposta = `${MSG.SEM_FARMACIA_PERTO}\n\n${MSG.O_QUE_LEVAR}${extra}`;
} else {
  const linhas = farmacias.map((f, i) => {
    const dist = f.distancia_km != null ? ` (cerca de ${String(f.distancia_km).replace('.', ',')} km)` : '';
    const local = [f.bairro, f.municipio && f.uf ? `${f.municipio}/${f.uf}` : f.municipio].filter(Boolean).join(', ');
    return `${i + 1}) ${nomeLegivel(f.nome)}${dist}\n   ${f.endereco} – ${local}`;
  });
  let intro;
  if (r.modo === 'distancia') intro = `Achei estas farmácias do Farmácia Popular perto do CEP ${cepFmt}:`;
  else if (r.modo === 'bairro') intro = `Achei estas farmácias do Farmácia Popular no seu bairro (CEP ${cepFmt}):`;
  else {
    const total = Number(r.total_na_cidade) || farmacias.length;
    intro = `Não achei farmácia do programa no seu bairro, mas ${cep.municipio} tem ${total} ` +
      `${total === 1 ? 'farmácia' : 'farmácias'} do Farmácia Popular. Algumas delas:`;
  }
  resposta = `${intro}\n\n${linhas.join('\n')}\n\n${MSG.NOME_FACHADA}\n\n${MSG.O_QUE_LEVAR}${extra}\n\n${MSG.CONFIRA_ESTOQUE}`;
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
