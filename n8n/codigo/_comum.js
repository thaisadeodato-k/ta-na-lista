// ===== Trechos comuns (vêm de n8n/codigo/_comum.js) =====
const MODELO_CLAUDE = 'claude-opus-5-5';
// Se a API do Claude reclamar do campo "fallbacks", troque para false.
const USAR_FALLBACK = true;

// Mensagens fixas do Zé (não passam pela IA)
const MSG = {
  CONSENTIMENTO:
    'Oi, eu sou o Zé da Farma! 👋 Eu vejo se o remédio da sua receita é de graça no Farmácia Popular e onde retirar.\n\n' +
    'Antes, um combinado rápido:\n' +
    '• Sou um projeto voluntário. NÃO sou canal oficial do governo.\n' +
    '• A foto da receita é lida por uma inteligência artificial (Claude, da Anthropic) só pra achar o nome do remédio. Eu não guardo a foto, nem nome, nem CPF.\n' +
    '• Guardo só um código no lugar do seu número e em que passo a conversa está, por até 24 horas.\n' +
    '• Nunca peço senha nem dados de banco.\n' +
    '• Escreva APAGAR a qualquer hora e eu apago seus dados.\n\n' +
    'Pode ser? Responda SIM pra continuar.',
  CONSENTIMENTO_NAO: 'Tudo bem! Não guardei nada. Se mudar de ideia, é só mandar um oi.',
  BOAS_VINDAS: 'Oba! Manda a foto da receita que eu vejo se tá na lista. Se preferir, escreve o nome do remédio.',
  PEDIR_RECEITA: 'Oi, eu sou o Zé! Manda a foto da receita que eu vejo se tá na lista. Também pode escrever o nome do remédio.',
  APAGADO: 'Pronto, apaguei seus dados. Se quiser usar de novo, é só mandar um oi.',
  RECOMECAR: 'Beleza, vamos começar de novo. Manda a foto da receita ou escreve o nome do remédio.',
  EXPIROU: 'Faz mais de um dia que a gente conversou, então comecei do zero.',
  FORA_CLINICO:
    'Essa eu não posso responder: dose, efeito, troca ou mistura de remédios é com o médico ou o farmacêutico. ' +
    'Eu só vejo se o remédio tá na lista do Farmácia Popular e onde retirar.',
  FORA_ESCOPO: 'Eu só sei falar do Farmácia Popular 🙂 Manda a foto da receita ou o nome do remédio que eu vejo se tá na lista.',
  NUNCA_PEDIMOS:
    'Atenção: eu nunca peço senha, cartão, Pix ou dados de banco. Não mande isso aqui. ' +
    'Se alguém pedir isso em nome do Farmácia Popular, é golpe.',
  NAO_PRECISA_CPF: 'Não precisa me mandar CPF nem documento, e eu não guardo esses dados. O CPF você mostra só lá na farmácia.',
  AUDIO: 'Ainda não consigo ouvir áudio. Manda a foto da receita ou escreve o nome do remédio, por favor.',
  IMAGEM_GRANDE: 'A foto ficou pesada demais pra mim. Tenta mandar de novo (pode ser um print), ou escreve o nome do remédio.',
  IMAGEM_TIPO: 'Não consegui abrir esse arquivo. Manda uma foto (JPG ou PNG) ou escreve o nome do remédio.',
  NAO_LEGIVEL: 'Não consegui ler a receita direitinho. Tenta outra foto, com boa luz e bem de pertinho, ou escreve o nome do remédio.',
  ERRO_TECNICO: 'Ops, tive um probleminha agora. Tenta de novo daqui a pouco, ou escreve o nome do remédio.',
  CONFIRMACAO_NAO: 'Sem problema! Manda a foto de novo, bem de pertinho e com luz, ou escreve o nome certo do remédio.',
  CONFIRMAR_DE_NOVO: 'Tá certo o que eu li? Responda SIM, ou escreva o nome certo do remédio.',
  PEDIR_CEP: 'Me manda seu CEP, só os números, que eu mostro as farmácias mais perto.',
  CEP_INVALIDO: 'Não entendi o CEP. Manda só os 8 números, assim: 01310100.',
  CEP_NAO_ACHADO: 'Não achei esse CEP. Confere e manda de novo, só os 8 números.',
  SEM_CEP: 'Tudo bem! Procure uma farmácia com a placa "Aqui tem Farmácia Popular". Se precisar, é só mandar outra receita.',
  O_QUE_LEVAR:
    'Pra retirar, leve: receita válida, documento com foto e CPF. ' +
    'Outra pessoa pode retirar por você, levando uma procuração.',
  INSUMO: 'Pra fralda geriátrica e absorvente, confirme na farmácia o que levar, porque as regras podem ser diferentes.',
  CONFIRA_ESTOQUE: 'Vale confirmar na farmácia se o remédio tá em estoque. Se precisar de outra receita, é só mandar a foto.',
  SEM_FARMACIA_PERTO:
    'Ainda não tenho farmácias cadastradas perto desse CEP. ' +
    'Procure uma farmácia com a placa "Aqui tem Farmácia Popular".',
};

// Codifica em base64 para mandar ao Postgres sem problema com vírgulas e aspas
const b64 = (obj) => Buffer.from(JSON.stringify(obj ?? {}), 'utf8').toString('base64');

// Monta a saída padrão de cada ramo (vai para "Juntar resposta" -> "Salvar conversa")
function fim(d, o) {
  return {
    usuario_hash: d.usuario_hash,
    acao: o.acao || 'salvar',
    novo_estado: o.novo_estado || d.estado_atual || 'novo',
    novo_contexto_b64: b64(o.novo_contexto !== undefined ? o.novo_contexto : (d.contexto || {})),
    evento: o.evento || '-',
    detalhe_b64: b64({ ...(o.detalhe || {}), canal: d.canal }),
    resposta: o.resposta,
  };
}

// Lê a resposta da API do Claude com segurança
function lerRespostaClaude(r) {
  if (!r || r.error || r.type === 'error') return { ok: false, erro: 'api' };
  if (r.stop_reason === 'refusal') return { ok: false, erro: 'recusa' };
  if (r.stop_reason === 'max_tokens') return { ok: false, erro: 'max_tokens' };
  const texto = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!texto) return { ok: false, erro: 'vazio' };
  return { ok: true, texto };
}

// Monta o corpo da chamada ao Claude
function corpoClaude(system, content, max_tokens, schema) {
  const corpo = {
    model: MODELO_CLAUDE,
    max_tokens,
    system,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'low' },
  };
  if (schema) corpo.output_config.format = { type: 'json_schema', schema };
  if (USAR_FALLBACK) corpo.fallbacks = 'default';
  return corpo;
}

// Texto em MAIÚSCULAS, sem acento e sem pontuação (para comparar comandos)
const normCmd = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Resposta de reserva (sem IA) caso a redação do Claude falhe
function modeloResultado(fatos) {
  const linhas = fatos.itens.map((i) => {
    const nome = i.remedio_na_lista ? cap(i.remedio_na_lista) : `O remédio nº ${i.numero}`;
    const conc = i.concentracao_da_receita ? ' ' + i.concentracao_da_receita : '';
    switch (i.situacao) {
      case 'na_lista':
        return `✅ ${nome}${conc}: tá na lista e é de graça no Farmácia Popular.`;
      case 'na_lista_sem_concentracao':
        return `✅ ${nome}: tá na lista e é de graça (${(i.concentracoes_na_lista || []).join(', ')}). Confira se a da receita é essa.`;
      case 'concentracao_fora_da_lista':
        return `❌ ${nome}${conc}: nessa concentração não tá na lista. Procure a UBS (posto de saúde) ou a farmácia municipal.`;
      default:
        return `❌ ${nome}: não tá na lista. Procure a UBS (posto de saúde) ou a farmácia municipal.`;
    }
  });
  linhas.push(fatos.proximo_passo === 'pedir_cep' ? MSG.PEDIR_CEP : 'Se precisar de outra receita, é só mandar a foto.');
  return linhas.join('\n');
}
// ===== fim dos trechos comuns =====
