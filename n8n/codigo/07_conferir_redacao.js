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
// Próximo passo sempre igual e já formatado (não depende da IA).
// Se a pessoa já disse o lugar (junto com o remédio), só pede um SIM.
const local = (d.contexto || {}).local || null;
let proximo = 'Precisa ver outra receita? É só mandar. 😉';
if (pedirCep) {
  proximo = local
    ? `📍 Quer ver as farmácias perto de *${local.cep ? 'CEP ' + local.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : localTexto(local)}*?\n\n` +
      '✅ Responda *SIM*\n✍️ Ou mande outro *CEP* ou a *cidade e o bairro*'
    : MSG.PEDIR_CEP;
}
texto += '\n\n' + proximo;

// Botões: ver as farmácias do lugar já dito, ou seguir em frente
const botoes = pedirCep
  ? (local ? [BT.VER_FARMACIAS, BT.OUTRO_LUGAR] : [BT.SEM_FARMACIA])
  : [BT.OUTRA_RECEITA, BT.MENU];

const conta = (s) => fatos.itens.filter((i) => i.situacao === s).length;
return [{
  json: fim(d, {
    resposta: texto,
    novo_estado: pedirCep ? 'aguardando_cep' : 'concluido',
    novo_contexto: pedirCep ? { tem_insumo: prep.tem_insumo, ...(local ? { local } : {}) } : {},
    evento: 'resultado',
    botoes,
    detalhe: {
      na_lista: conta('na_lista'),
      na_lista_sem_concentracao: conta('na_lista_sem_concentracao'),
      concentracao_fora_da_lista: conta('concentracao_fora_da_lista'),
      nao_encontrado: conta('nao_encontrado'),
      redacao: usouClaude ? 'claude' : 'modelo_fixo',
    },
  }),
}];
