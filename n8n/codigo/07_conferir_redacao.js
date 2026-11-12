/*__COMUM__*/
// CONFERIR REDAÇÃO: valida o texto do Claude. Se algo der errado, usa o modelo fixo (sem IA).
const r = $input.first().json;
const d = $('Decidir rota').first().json;
const prep = $('Preparar redação').first().json;
const fatos = prep.fatos;
const pedirCep = fatos.proximo_passo === 'pedir_cep';

const res = lerRespostaClaude(r);
let texto = res.ok ? res.texto.replace(/^["']+|["']+$/g, '').trim() : '';
// Ajusta formatação para o WhatsApp: **negrito** (markdown) -> *negrito*; tira títulos com #
texto = texto.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n');

// Travas: tamanho e palavras proibidas
const proibido = /(SENHA|CARTAO|PIX|DADOS BANCARIOS|CANAL OFICIAL|SOU DO GOVERNO)/.test(normCmd(texto));
const usouClaude = !!texto && texto.length <= 1200 && !proibido;
if (!usouClaude) texto = modeloResultado(fatos);
// Próximo passo sempre igual e já formatado (não depende da IA)
texto += '\n\n' + (pedirCep ? MSG.PEDIR_CEP : 'Precisa ver outra receita? É só mandar. 😉');

const conta = (s) => fatos.itens.filter((i) => i.situacao === s).length;
return [{
  json: fim(d, {
    resposta: texto,
    novo_estado: pedirCep ? 'aguardando_cep' : 'concluido',
    novo_contexto: pedirCep ? { tem_insumo: prep.tem_insumo } : {},
    evento: 'resultado',
    detalhe: {
      na_lista: conta('na_lista'),
      na_lista_sem_concentracao: conta('na_lista_sem_concentracao'),
      concentracao_fora_da_lista: conta('concentracao_fora_da_lista'),
      nao_encontrado: conta('nao_encontrado'),
      redacao: usouClaude ? 'claude' : 'modelo_fixo',
    },
  }),
}];
