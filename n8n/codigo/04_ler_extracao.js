/*__COMUM__*/
// LER EXTRAÇÃO: confere o JSON devolvido pelo Claude e prepara a consulta à base oficial.
// Importante: a foto NÃO segue adiante e nada daqui é salvo como texto livre.
const r = $input.first().json;
const d = $('Decidir rota').first().json;
// O lugar (cidade/bairro/CEP) que a pessoa disse vai junto para o banco achar as farmácias.
// Ele não é salvo como texto: só a cidade/bairro reconhecidos pela lista oficial.
const txt64 = (s) => Buffer.from((s || ' ').toString().slice(0, 200), 'utf8').toString('base64');
const parar = (o) => [{ json: { consultar: false, lista_b64: b64([]), local_b64: txt64(''), ...fim(d, o) } }];

const res = lerRespostaClaude(r);
if (!res.ok) return parar({ resposta: MSG.ERRO_TECNICO, evento: 'erro_claude', detalhe: { etapa: 'extracao', erro: res.erro } });

let ext;
try { ext = JSON.parse(res.texto); } catch (e) {
  return parar({ resposta: MSG.ERRO_TECNICO, evento: 'erro_claude', detalhe: { etapa: 'extracao', erro: 'json' } });
}

if (ext.assunto === 'pergunta_clinica') return parar({ resposta: MSG.FORA_CLINICO, evento: 'fora_clinico' });
if (ext.assunto === 'pergunta_lista') return parar({ resposta: MSG.DICA_LISTA, evento: 'dica_lista' });
// Só disse o lugar (ex.: corrigindo a cidade): o banco procura as farmácias e "Montar confirmação" responde
const local = typeof ext.local === 'string' ? ext.local.trim() : '';
if (ext.assunto === 'local' || (local && !(ext.medicamentos || []).length)) {
  return [{ json: { consultar: false, so_local: true, lista_b64: b64([]), local_b64: txt64(local) } }];
}
if (ext.assunto === 'fora_do_escopo') return parar({ resposta: MSG.FORA_ESCOPO, evento: 'fora_escopo' });

const meds = (ext.medicamentos || [])
  .filter((m) => m && typeof m.nome_escrito === 'string' && m.nome_escrito.trim())
  .slice(0, 8)
  .map((m, i) => ({
    ordem: i + 1,
    nome_escrito: m.nome_escrito.trim().slice(0, 60),
    concentracao: m.concentracao ? String(m.concentracao).trim().slice(0, 30) : null,
    confianca: m.confianca || 'media',
  }));

if (!ext.legivel || meds.length === 0) {
  return parar({ resposta: MSG.NAO_LEGIVEL, novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'receita_ilegivel' });
}

const data_receita = /^\d{4}-\d{2}-\d{2}$/.test(ext.data_receita || '') ? ext.data_receita : null;
return [{ json: { consultar: true, lista_b64: b64(meds), meds, data_receita, local_b64: txt64(local) } }];
