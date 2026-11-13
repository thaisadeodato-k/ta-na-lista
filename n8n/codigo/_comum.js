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
    '🤝 O *Tá na Lista* é um projeto *voluntário*, não um canal oficial do governo.\n' +
    '🔒 Não guardo foto, áudio, nome nem CPF.\n' +
    '🚫 Nunca peço senha nem dados de banco.\n' +
    '🗑️ Escreva *APAGAR* quando quiser e eu apago tudo.\n\n' +
    'Pode ser? Toque no botão ou escreva *SIM*.',
  CONSENTIMENTO_NAO: 'Tudo bem! Não guardei nada. 👍\nSe mudar de ideia, é só mandar um *oi*.',
  BOAS_VINDAS: 'Oba! 🎉 Vamos lá:\n\n' + COMO_MANDAR + '\n\nQue eu vejo se tá na lista.\n\n💡 _Quer ver tudo o que é de graça? Escreva_ *LISTA*.',
  PEDIR_RECEITA: 'Oi, eu sou o *Zé da Farma*! 👋\n\n' + COMO_MANDAR + '\n\nQue eu vejo se tá na lista.',
  APAGADO: '🗑️ Pronto, *apaguei seus dados*.\nSe quiser usar de novo, é só mandar um *oi*.',
  RECOMECAR: '🔄 Beleza, vamos começar de novo.\n\n' + COMO_MANDAR,
  OUTRA_RECEITA: '📋 Pode mandar a receita:\n\n' + COMO_MANDAR,
  MENU: '📋 *O que você quer fazer?*\nToque em *Ver opções* 👇\n\n_Ou, se preferir, é só mandar a receita._',
  EXPIROU: '⏰ _Faz mais de um dia que a gente conversou, então comecei do zero._',
  FORA_CLINICO:
    '⚠️ *Essa eu não posso responder.*\n' +
    'Dose, efeito, troca ou mistura de remédios é com o *médico* ou o *farmacêutico*.\n\n' +
    'Eu só vejo se o remédio *tá na lista* do Farmácia Popular e *onde retirar*.',
  FORA_ESCOPO: 'Eu só sei falar do *Farmácia Popular* 🙂\n\n' + COMO_MANDAR + '\n\nQue eu vejo se tá na lista.\n\n📋 _Ou toque em_ *Ver opções* 👇',
  OPINIAO_OBRIGADO:
    '💚 *Obrigado pelo comentário!*\n' +
    'Anotei como sugestão pro time do Tá na Lista. É assim, com a participação de quem usa, que o projeto melhora.\n\n' +
    '🔒 _Guardei sem o seu número: ninguém sabe quem mandou._',
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
  DE_NADA: 'De nada! 😊\nPrecisando, é só mandar outra receita.\n\n_Quer conhecer o projeto? Escreva_ *SOBRE*.',
  SOBRE:
    '💚 *Sobre o Tá na Lista*\n\n' +
    'O *Tá na Lista* foi *idealizado e desenvolvido* por *Thaís Adeodato*. O Zé da Farma é quem atende você aqui.\n' +
    '🔗 https://www.linkedin.com/in/thais-morais-adeodato-porto/\n\n' +
    'A ideia foi submetida *em equipe* como projeto de *impacto social* no programa AI4Good, da Brazil Conference, junto com:\n' +
    '• *Jordean Amaro*: https://www.linkedin.com/in/jordean-amaro/\n' +
    '• *João Augusto Coelho*: https://www.linkedin.com/in/jo%C3%A3o-augusto-coelho-57b098228/\n\n' +
    '🤝 Projeto voluntário, não é canal oficial do governo.\n' +
    '_Dúvida sobre remédio é com o médico ou o farmacêutico._',
  SUGESTAO_PERFIL:
    '💡 *Que bom que você quer ajudar!*\n' +
    'Antes, rapidinho: *quem é você?* Toque em *Escolher* 👇\n\n' +
    '_Ou, se preferir, já escreva sua sugestão._',
  SUGESTAO_PEDIR:
    '💡 Me conta: *o que podia ser melhor*, ou o que você gostou?\n\n' +
    '✍️ Pode escrever\n🎤 Ou mandar um áudio\n\n' +
    '🔒 _Não precisa colocar nome, CPF nem telefone._',
  SUGESTAO_CURTA: '🤔 Não entendi a sugestão. Me conta com mais detalhes, por texto ou áudio.\n\n_Se mudou de ideia, escreva_ *MENU*.',
  SUGESTAO_CANCELADA: 'Tudo bem! 👍 Se quiser mandar depois, é só escrever *SUGESTÃO*.',
  SUGESTAO_OBRIGADO:
    '💚 *Obrigado!* Sua sugestão foi pro time do Tá na Lista.\n' +
    'É assim, com a participação de quem usa, que o projeto melhora.\n\n' +
    '🔒 _Ela foi guardada sem o seu número: ninguém sabe quem mandou._',
  CORRIGIR_LOCAL: '📍 _Não é esse lugar? Me manda a_ *cidade e o bairro* _certos, ou o_ *CEP*.',
  NOME_FACHADA: 'ℹ️ _O nome na fachada pode ser diferente: procure a placa_ *"Aqui tem Farmácia Popular"*.',
  SEM_FARMACIA_PERTO:
    '📍 Pela lista oficial, *não achei farmácia* do Farmácia Popular nessa cidade.\n\n' +
    'Procure uma farmácia com a placa *"Aqui tem Farmácia Popular"* ou pergunte na *UBS* (posto de saúde).',
};

// Botões e menus clicáveis do WhatsApp. O "id" volta como se a pessoa tivesse escrito aquele texto,
// então escrever continua funcionando igual. Limites da Meta: até 3 botões (título até 20 letras);
// menu em lista com até 10 opções (título até 24 letras, descrição até 72).
const BT = {
  SIM: { id: 'SIM', title: '✅ Sim' },
  CONSENTIR: { id: 'SIM', title: '✅ Sim, pode ser' },
  RECUSAR: { id: 'NAO', title: '❌ Agora não' },
  TA_CERTO: { id: 'SIM', title: '✅ Tá certo' },
  TA_ERRADO: { id: 'NAO', title: '✏️ Tá errado' },
  VER_FARMACIAS: { id: 'SIM', title: '📍 Ver farmácias' },
  OUTRO_LUGAR: { id: 'NAO', title: '✏️ Outro lugar' },
  SEM_FARMACIA: { id: 'NAO', title: '🙅 Agora não' },
  OUTRA_RECEITA: { id: 'OUTRA RECEITA', title: '📸 Outra receita' },
  LISTA: { id: 'LISTA', title: '💊 O que é de graça' },
  LISTA_TODA: { id: 'LISTA', title: '💊 Ver lista toda' },
  SOBRE: { id: 'SOBRE', title: '💬 Sobre o projeto' },
  SUGESTAO: { id: 'SUGESTAO', title: '💡 Dar sugestão' },
  MENU: { id: 'MENU', title: '📋 Menu' },
};
const MENU_PRINCIPAL = {
  botao: '📋 Ver opções',
  secoes: [{
    title: 'O que você quer fazer?',
    rows: [
      { id: 'OUTRA RECEITA', title: '📸 Mandar uma receita', description: 'Foto, PDF, texto ou áudio' },
      { id: 'LISTA', title: '💊 O que é de graça', description: 'A lista oficial do Farmácia Popular' },
      { id: 'LISTA PRESSAO', title: '❤️ Remédios de pressão' },
      { id: 'LISTA DIABETES', title: '🩸 Remédios de diabetes' },
      { id: 'SUGESTAO', title: '💡 Dar uma sugestão', description: 'Ajude a melhorar o Tá na Lista' },
      { id: 'SOBRE', title: '💬 Sobre o projeto', description: 'Quem fez o Tá na Lista' },
      { id: 'APAGAR', title: '🗑️ Apagar meus dados', description: 'Apaga tudo o que eu guardei' },
    ],
  }],
};
// Perfil de quem manda sugestão (só o tipo de pessoa; nada que identifique)
const PERFIS = { 'PERFIL PACIENTE': 'paciente', 'PERFIL FAMILIA': 'familia', 'PERFIL FARMACIA': 'farmacia', 'PERFIL SAUDE': 'saude', 'PERFIL NAO DISSE': 'nao_informado' };
const MENU_PERFIL = {
  botao: '👤 Escolher',
  secoes: [{
    title: 'Quem é você?',
    rows: [
      { id: 'PERFIL PACIENTE', title: '👵 Uso pra mim', description: 'Tomo remédio e uso o Tá na Lista' },
      { id: 'PERFIL FAMILIA', title: '👨‍👩‍👧 Ajudo alguém', description: 'Uso pra alguém da família ou amigo' },
      { id: 'PERFIL FARMACIA', title: '💊 Sou da farmácia', description: 'Farmacêutico(a) ou balconista' },
      { id: 'PERFIL SAUDE', title: '🩺 Trabalho na saúde', description: 'Médico(a), enfermagem, agente de saúde…' },
      { id: 'PERFIL NAO DISSE', title: '🙊 Prefiro não dizer' },
    ],
  }],
};
const MENU_DOENCAS = {
  botao: '🔎 Escolher doença',
  secoes: [{
    title: 'Remédios de graça para',
    rows: [
      ['PRESSAO', '❤️ Pressão alta'], ['DIABETES', '🩸 Diabetes'], ['COLESTEROL', '🧪 Colesterol'],
      ['ASMA', '🫁 Asma'], ['RINITE', '👃 Rinite'], ['PARKINSON', '🧠 Parkinson'], ['GLAUCOMA', '👁️ Glaucoma'],
      ['OSTEOPOROSE', '🦴 Osteoporose'], ['ANTICONCEPCIONAL', '💊 Anticoncepcional'], ['FRALDA', '🩲 Fralda geriátrica'],
    ].map(([id, title]) => ({ id: 'LISTA ' + id, title })),
  }],
};

// Tira CPF, telefone, e-mail e números longos do texto de uma sugestão antes de guardar
function semDadosPessoais(s) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[removido]')                         // e-mail
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[removido]')                 // CPF
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\s?\d{4}[\s.-]?\d{4}\b/g, '[removido]')   // telefone
    .replace(/\d{8,}/g, '[removido]')                                           // outros números longos
    .trim().slice(0, 1000);
}

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
    // Só a saída do WhatsApp usa (não vão para o banco)
    botoes: o.botoes || null,
    lista: o.lista || null,
    menu_texto: o.menu_texto || null, // se vier, os botões vão numa 2ª mensagem curta com este texto
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
// A lista oficial vem em MAIÚSCULAS: cidade e bairro ficam "Vila Mariana", "São Paulo" (mais fácil de ler)
const titulo = (s) => (!s || s !== s.toUpperCase()) ? s : s.toLowerCase()
  .replace(/(^|[\s(\/-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\s(De|Da|Do|Das|Dos|E|D)(?=\s)/g, (m) => m.toLowerCase());

// O nome na lista oficial é a razão social: tira só os sufixos de empresa para ficar mais fácil de ler
const nomeLegivel = (n) => (n || '')
  .replace(/\s*[-–]?\s*\b(LTDA\.?|EIRELI|EPP|ME|S\/?A|S\.A\.?)\s*$/i, '')
  .replace(/\s*[-–]?\s*\b(LTDA\.?|EIRELI|EPP|ME)\s*$/i, '')
  .trim() || n;

// Lugar reconhecido pelo banco (tnl_farmacias_para_texto), para mostrar e guardar.
// Guarda só cidade/UF/bairro da lista oficial — nunca o texto que a pessoa escreveu.
function localReconhecido(r) {
  if (!r || !r.cidade || r.modo === 'cidade_nao_achada') return null;
  const bairro = r.modo === 'bairro' && r.bairro_pedido ? titulo(String((r.farmacias || [])[0]?.bairro || '')) || null : null;
  return { cidade: titulo(r.cidade), uf: r.uf || null, bairro };
}
const localTexto = (l) => [l.bairro, l.cidade && l.uf ? `${l.cidade}/${l.uf}` : l.cidade].filter(Boolean).join(', ');

// Monta a resposta com até 3 farmácias + o que levar (usada pelo CEP, pela cidade e pela correção do lugar).
//   r: resultado do banco ({modo, farmacias, total_na_cidade, cidade, uf, bairro_pedido, outras_ufs})
//   porCidade: true quando veio do nome da cidade (não do CEP); cepFmt: "01310-100" quando veio do CEP
function respostaFarmacias({ d, r, porCidade, municipio, uf, cepFmt }) {
  const DISTANCIA_MAX_KM = 30;
  municipio = titulo(municipio);
  const cidadeUf = municipio ? `${municipio}${uf && uf !== '-' ? '/' + uf : ''}` : 'sua cidade';
  const farmacias = (r.farmacias || []).filter((f) => f.distancia_km == null || Number(f.distancia_km) <= DISTANCIA_MAX_KM);
  const extra = ((d.contexto || {}).tem_insumo ? '\n\n' + MSG.INSUMO : '');
  if (!farmacias.length) {
    return { resposta: `${MSG.SEM_FARMACIA_PERTO}\n\n${MSG.CORRIGIR_LOCAL}\n\n${MSG.O_QUE_LEVAR}${extra}`, encontradas: 0 };
  }
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
  const dicaLocal = outras.length
    ? `💡 _Se não for essa, escreva a cidade com o estado. Ex.:_ *${municipio} ${outras[0]}*`
    : MSG.CORRIGIR_LOCAL;
  const dicaBairro = (porCidade && r.modo === 'municipio' && total > 3)
    ? '\n\n💡 _Pra achar mais perto, me manda o seu_ *CEP* _ou o_ *bairro* _junto com a cidade._'
    : '';
  return {
    resposta: `${intro}\n\n${linhas.join('\n\n')}\n\n${dicaLocal}${dicaBairro}\n\n${MSG.NOME_FACHADA}\n\n${MSG.O_QUE_LEVAR}${extra}\n\n${MSG.CONFIRA_ESTOQUE}`,
    encontradas: farmacias.length,
  };
}
// Depois de mostrar farmácias: a conversa fica "concluída", mas aceita corrigir o lugar sem recomeçar
const BOTOES_POS_FARMACIAS = [BT.OUTRA_RECEITA, BT.LISTA, BT.SOBRE];
const contextoPosFarmacias = (d) => ({ farmacias_mostradas: true, tem_insumo: !!(d.contexto || {}).tem_insumo });
// ===== fim dos trechos comuns =====
