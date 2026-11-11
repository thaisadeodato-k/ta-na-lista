/*__COMUM__*/
// PREPARAR REDAÇÃO: junta os FATOS (já decididos pelo banco) e pede ao Claude o texto do Zé.
const PROMPT_REDACAO = /*__PROMPT_REDACAO__*/;

const d = $input.first().json;
const itens = d.contexto.itens || [];
const pedirCep = itens.some((i) => i.situacao === 'na_lista' || i.situacao === 'na_lista_sem_concentracao');

const fatos = {
  itens: itens.map(({ tipo, ...resto }) => resto),
  data_receita: d.contexto.data_receita || null,
  proximo_passo: pedirCep ? 'pedir_cep' : 'encerrar',
};

const content = [{ type: 'text', text: 'FATOS: ' + JSON.stringify(fatos) }];
return [{ json: { fatos, tem_insumo: itens.some((i) => i.tipo === 'insumo' && i.situacao === 'na_lista'), claude_body: corpoClaude(PROMPT_REDACAO, content, 2000) } }];
