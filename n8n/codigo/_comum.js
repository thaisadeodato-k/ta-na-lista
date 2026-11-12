// ===== Trechos comuns (vêm de n8n/codigo/_comum.js) =====
const MODELO_CLAUDE = 'claude-opus-5-5';
// Se a API do Claude reclamar do campo "fallbacks", troque para false.
const USAR_FALLBACK = true;

// Mensagens fixas do Zé (não passam pela IA).
// Formatação do WhatsApp: *negrito*, _itálico_, linhas em branco entre blocos, poucos emojis com função.
const COMO_MANDAR =
  '📸 Manda a *foto* ou o *PDF* da receita\n' +
  '✍️ Ou *escreve* o nome do remédio\n' +
  '🎤 Ou manda um *áudio* falando o nome';
const MSG = {
  CONSENTIMENTO:
    'Oi! Eu sou o *Zé da Farma* 👋\n' +
    'Eu vejo se o remédio da sua receita é *de graça no Farmácia Popular* e onde retirar.\n\n' +
    '*Antes, um combinado rápido:*\n\n' +
    '🤝 Sou um projeto *voluntário*. *Não* sou canal oficial do governo.\n\n' +
    '🤖 A receita é lida por uma inteligência artificial (Claude, da Anthropic), só pra achar o nome do remédio. ' +
    'Áudio vira texto por outro serviço (Groq).\n\n' +
    '🔒 Não guardo foto, áudio, nome nem CPF. Guardo só um código no lugar do seu número, por até 24 horas.\n\n' +
    '🚫 Nunca peço senha nem dados de banco.\n\n' +
    '🗑️ Escreva *APAGAR* a qualquer hora e eu apago seus dados.\n\n' +
    'Pode ser? Escreva *SIM* pra continuar.',
  CONSENTIMENTO_NAO: 'Tudo bem! Não guardei nada. 👍\nSe mudar de ideia, é só mandar um *oi*.',
  BOAS_VINDAS: 'Oba! 🎉 Vamos lá:\n\n' + COMO_MANDAR + '\n\nQue eu vejo se tá na lista.\n\n💡 _Quer ver tudo o que é de graça? Escreva_ *LISTA*.',
  PEDIR_RECEITA: 'Oi, eu sou o *Zé da Farma*! 👋\n\n' + COMO_MANDAR + '\n\nQue eu vejo se tá na lista.',
  APAGADO: '🗑️ Pronto, *apaguei seus dados*.\nSe quiser usar de novo, é só mandar um *oi*.',
  RECOMECAR: '🔄 Beleza, vamos começar de novo.\n\n' + COMO_MANDAR,
  EXPIROU: '⏰ _Faz mais de um dia que a gente conversou, então comecei do zero._',
  FORA_CLINICO:
    '⚠️ *Essa eu não posso responder.*\n' +
    'Dose, efeito, troca ou mistura de remédios é com o *médico* ou o *farmacêutico*.\n\n' +
    'Eu só vejo se o remédio *tá na lista* do Farmácia Popular e *onde retirar*.',
  FORA_ESCOPO: 'Eu só sei falar do *Farmácia Popular* 🙂\n\n' + COMO_MANDAR + '\n\nQue eu vejo se tá na lista.',
  NUNCA_PEDIMOS:
    '🚨 *Atenção!*\n' +
    'Eu *nunca* peço senha, cartão, Pix ou dados de banco. Não mande isso aqui.\n\n' +
    'Se alguém pedir isso em nome do Farmácia Popular, *é golpe*.',
  NAO_PRECISA_CPF: '🔒 *Não precisa me mandar CPF* nem documento, e eu não guardo esses dados.\nO CPF você mostra só lá na farmácia.',
  AUDIO: '🎤 *Não consegui entender o áudio.*\nTenta gravar de novo, falando com calma.\n\n📸 Ou manda a foto da receita\n✍️ Ou escreve o nome do remédio',
  IMAGEM_GRANDE: '📦 *O arquivo ficou pesado demais pra mim.*\nTenta mandar uma *foto* ou um *print* da receita, ou escreve o nome do remédio.',
  IMAGEM_TIPO: '📄 *Não consegui abrir esse arquivo.*\nManda uma *foto* ou o *PDF* da receita, ou escreve o nome do remédio.',
  DICA_LISTA:
    '💊 Quer ver os remédios que saem *de graça* no Farmácia Popular?\n\n' +
    '👉 Escreva *LISTA* pra ver tudo\n' +
    '👉 Ou *LISTA PRESSÃO*, *LISTA DIABETES*… pra ver de uma doença',
  LISTA_VAZIA: 'Não achei remédio dessa doença na lista do Farmácia Popular. 🤔\n\n👉 Escreva *LISTA* pra ver tudo o que é de graça\n📸 Ou manda a foto da receita',
  NAO_LEGIVEL:
    '🔍 *Não consegui ler a receita direitinho.*\n\n' +
    'Tenta outra foto:\n• com *boa luz*\n• *bem de pertinho*\n• a receita *inteira* na foto\n\n✍️ Ou escreve o nome do remédio.',
  ERRO_TECNICO: '😕 Ops, tive um probleminha agora.\nTenta de novo daqui a pouco, ou escreve o nome do remédio.',
  CONFIRMACAO_NAO: 'Sem problema! 👍\n\n📸 Manda a foto de novo, bem de pertinho e com luz\n✍️ Ou escreve o *nome certo* do remédio',
  CONFIRMAR_DE_NOVO: 'Tá certo o que eu li?\n\n✅ Responda *SIM*\n✍️ Ou escreva o *nome certo* do remédio',
  PEDIR_CEP:
    '📍 *Agora me diz onde você está*, que eu mostro as farmácias mais perto:\n\n' +
    '• o *CEP* (só os números)\n• ou a *cidade e o bairro*\n\n_Pode ser por áudio também._ 🎤',
  CEP_INVALIDO:
    'Não entendi 🤔 Me manda:\n\n' +
    '• o *CEP* com 8 números (ex.: _01310100_)\n• ou a *cidade e o bairro* (ex.: _Vila Mariana, São Paulo_)',
  CEP_NAO_ACHADO: '📍 *Não achei esse CEP.*\nConfere e manda de novo (só os 8 números), ou escreve a *cidade e o bairro*.',
  CIDADE_NAO_ACHADA:
    '📍 *Não achei essa cidade* na lista do Farmácia Popular.\n\n' +
    '• Confere o nome da cidade\n• Ou manda o *CEP* (só os números)\n\n' +
    '_Se a cidade tem o mesmo nome em outro estado, escreva com o estado. Ex.: Santa Luzia PB._',
  SEM_CEP: 'Tudo bem! 👍\nProcure uma farmácia com a placa *"Aqui tem Farmácia Popular"*.\n\nSe precisar, é só mandar outra receita.',
  O_QUE_LEVAR:
    '🧾 *Pra retirar, leve:*\n' +
    '• Receita válida\n• Documento com foto\n• CPF\n\n' +
    '👥 Outra pessoa pode retirar por você, levando uma *procuração*.',
  INSUMO: '🩲 _Pra fralda geriátrica e absorvente, confirme na farmácia o que levar, porque as regras podem ser diferentes._',
  CONFIRA_ESTOQUE: '📞 Vale *confirmar na farmácia* se o remédio tá em estoque.\n\nPrecisa ver outra receita? É só mandar. 😉',
  NOME_FACHADA: 'ℹ️ _O nome na fachada pode ser diferente: procure a placa_ *"Aqui tem Farmácia Popular"*.',
  SEM_FARMACIA_PERTO:
    '📍 Pela lista oficial, *não achei farmácia* do Farmácia Popular nessa cidade.\n\n' +
    'Procure uma farmácia com a placa *"Aqui tem Farmácia Popular"* ou pergunte na *UBS* (posto de saúde).',
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
  const blocos = fatos.itens.map((i) => {
    const nome = i.remedio_na_lista ? `*${cap(i.remedio_na_lista)}*` : `*O remédio nº ${i.numero}*`;
    const conc = i.concentracao_da_receita ? ' ' + i.concentracao_da_receita : '';
    const marca = i.marca ? `\n_${i.marca} é nome de marca; o genérico é ${i.remedio_na_lista}._` : '';
    switch (i.situacao) {
      case 'na_lista':
        return `✅ ${nome}${conc}${marca}\nTá na lista e é *de graça* no Farmácia Popular.`;
      case 'na_lista_sem_concentracao':
        return `✅ ${nome}${marca}\nTá na lista e é *de graça* em: ${(i.concentracoes_na_lista || []).join(', ')}.\nConfira se a da receita é uma dessas.`;
      case 'concentracao_fora_da_lista':
        return `❌ ${nome}${conc}${marca}\nNessa concentração *não* tá na lista. Procure a *UBS* (posto de saúde) ou a farmácia municipal.`;
      default:
        return `❌ ${nome}\n*Não* tá na lista. Procure a *UBS* (posto de saúde) ou a farmácia municipal.`;
    }
  });
  return blocos.join('\n\n'); // o próximo passo (pedir CEP/cidade) é colocado por "Conferir redação"
}
// ===== fim dos trechos comuns =====
