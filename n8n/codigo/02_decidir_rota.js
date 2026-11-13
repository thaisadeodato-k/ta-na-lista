/*__COMUM__*/
// DECIDIR ROTA: olha o estado da conversa e a mensagem, e escolhe o caminho.
//   rota = 'fixa'      -> resposta pronta (sem IA)
//   rota = 'extrair'   -> ler receita/texto com o Claude
//   rota = 'resultado' -> pessoa confirmou: dizer se está na lista
//   rota = 'cep'       -> procurar farmácias pelo CEP
//   rota = 'cidade'    -> procurar farmácias pelo nome da cidade (e bairro)
//   rota = 'lista'     -> mostrar os remédios da lista oficial (tudo ou de uma doença)
const ent = $('Entrada → formato padrão').first().json;
const conv = $input.first().json.r;

const d = {
  canal: ent.canal,
  usuario_hash: conv.usuario_hash,
  estado_atual: conv.estado,
  contexto: conv.contexto || {},
  texto: ent.texto || '',
  imagem_base64: ent.imagem_base64,
  imagem_mime: ent.imagem_mime,
  imagem_bytes: ent.imagem_bytes || 0,
  aviso: conv.expirou ? MSG.EXPIROU + '\n\n' : '',
};

const t = normCmd(d.texto);
const temImagem = !!d.imagem_base64;
const fixa = (o) => [{ json: { ...fim(d, o), rota: 'fixa' } }];
const seguir = (rota, extra = {}) => [{ json: { ...d, rota, ...extra } }];

const MAX_IMG = 3.7 * 1024 * 1024; // limite do Claude é 5 MB em base64 (vale para foto e PDF)
const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const ehSim = ['SIM', 'S', 'ISSO', 'ISSO MESMO', 'CERTO', 'TA CERTO', 'ESTA CERTO', 'CORRETO', 'OK', 'CONFIRMO'].includes(t) || t.startsWith('SIM ');
const ehNao = ['NAO', 'N', 'ERRADO', 'TA ERRADO', 'ESTA ERRADO'].includes(t) || t.startsWith('NAO ');
const ehSaudacao = ['OI', 'OIE', 'OLA', 'BOM DIA', 'BOA TARDE', 'BOA NOITE', 'AJUDA', 'INICIO', 'OI ZE', 'OLA ZE', 'ZE'].includes(t);

// Perguntas clínicas e dados sensíveis: resposta fixa, sem IA, em qualquer estado
const RE_CLINICA = /(QUAL A DOSE|QUAL DOSE|QUE DOSE|DOSE CERTA|DOSAGEM|AUMENTAR A DOSE|DIMINUIR A DOSE|QUANTOS? (COMPRIMIDOS?|GOTAS|VEZES)|POSSO TOMAR|PODE TOMAR|DA PRA TOMAR|EFEITO|COLATERA|INTERACAO|INTERAGE|MISTURAR|TROCAR|SUBSTITU|ALCOOL|CERVEJA|BEBIDA|GRAVIDA|AMAMENTA|PARAR DE TOMAR|ESQUECI DE TOMAR|SERVE PRA|SERVE PARA|PRA QUE SERVE|PARA QUE SERVE|CONTRAINDICA|ALERGIA|FAZ MAL|REACAO)/;
const RE_SENSIVEL = /\b(SENHA|CARTAO(?! (DO )?SUS)|PIX|CONTA BANCARIA|CONTA DO BANCO|AGENCIA|CVV|TOKEN|BOLETO|DADOS BANCARIOS)\b/;
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;

// Pergunta "quais remédios são de graça?": responde com a lista oficial (consulta ao banco, sem IA)
const RE_LISTA = new RegExp([
  '^LISTA( |$)',
  '\\b(QUAIS|QUE|QUAL)( SAO| E)?( OS| AS)? (REMEDIOS?|MEDICAMENTOS?)\\b.*\\b(GRACA|GRATIS|GRATUIT\\w*|LISTA|FARMACIA POPULAR|COBR\\w*|PEGAR|RETIRAR|TEM|DISTRIBU\\w*)\\b',
  '\\b(REMEDIOS|MEDICAMENTOS) (DE GRACA|GRATIS|GRATUITOS|COBERTOS|DA LISTA|DO PROGRAMA)\\b',
  '\\bO QUE (TEM|E|DA)( DE)? (GRACA|GRATIS)\\b',
  '\\bTEM (ALGUM )?(REMEDIO|MEDICAMENTO) (PRA|PARA|DE) ',
].join('|'));
// Filtro opcional por doença (o valor é um pedaço do nome da "indicação" na lista oficial)
const FILTROS_LISTA = [
  [/DIABET|GLICOSE|ACUCAR NO SANGUE|INSULINA/, 'DIABETES'],
  [/PRESSAO|HIPERTENS/, 'HIPERTENSAO'],
  [/ASMA|BRONQUITE|BOMBINHA/, 'ASMA'],
  [/RINITE/, 'RINITE'],
  [/COLESTEROL|DISLIPIDEMIA|TRIGLICER/, 'DISLIPIDEMIA'],
  [/PARKINSON/, 'PARKINSON'],
  [/GLAUCOMA/, 'GLAUCOMA'],
  [/OSTEOPOROSE/, 'OSTEOPOROSE'],
  [/ANTICONCEP|EVITAR GRAVIDEZ|PILULA/, 'ANTICONCEPCAO'],
  [/FRALDA|INCONTINENCIA/, 'INCONTINENCIA'],
  [/ABSORVENTE|MENSTRUA/, 'MENSTRUAL'],
];
const filtroLista = () => (FILTROS_LISTA.find(([re]) => re.test(t)) || [null, '-'])[1];

// CEP falado em palavras (áudio transcrito): "zero um três um zero um zero zero" -> 01310100.
// Só vale quando a mensagem é quase toda de números, para não confundir "um" de nomes de cidade.
const NUM_FALADO = { ZERO: '0', UM: '1', UMA: '1', DOIS: '2', DUAS: '2', TRES: '3', QUATRO: '4', CINCO: '5',
  SEIS: '6', MEIA: '6', SETE: '7', OITO: '8', NOVE: '9' };
function cepFalado(txt) {
  const pal = txt.split(' ').filter((p) => p && !['CEP', 'MEU', 'E', 'O', 'TRACO', 'HIFEN', 'PONTO'].includes(p));
  if (!pal.length) return null;
  const nums = pal.map((p) => (NUM_FALADO[p] !== undefined ? NUM_FALADO[p] : (/^\d+$/.test(p) ? p : null)));
  if (nums.some((x) => x === null)) return null;
  return nums.join('').split('');
}

// Frases de quem está corrigindo o lugar: "não, é Santa Luzia PB", "outra cidade", "moro no Jardim..."
const RE_CORRIGE_LOCAL = /^(NAO|ERRADO|ERRADA)\b|\bNAO E (ESSA|ESSE|AQUI|ALI|LA)\b|\bOUTR[AO] (CIDADE|BAIRRO|LUGAR|ESTADO)\b|\bNA VERDADE\b|\bMORO\b|\bMORA\b|\bFICA (EM|NO|NA)\b|^E (EM|NO|NA) |\bCIDADE\b|\bBAIRRO\b|\bCEP\b/;
const txt64 = (s) => Buffer.from((s || ' ').toString().slice(0, 200), 'utf8').toString('base64');

function checarArquivo() {
  if (ent.tem_audio && !temImagem) return fixa({ resposta: MSG.AUDIO, evento: 'audio' });
  if (ent.outro_arquivo && !temImagem) return fixa({ resposta: MSG.IMAGEM_TIPO, evento: 'arquivo_invalido' });
  if (!temImagem) return null;
  if (!MIMES_OK.includes(d.imagem_mime)) return fixa({ resposta: MSG.IMAGEM_TIPO, evento: 'arquivo_invalido' });
  if (d.imagem_bytes > MAX_IMG) return fixa({ resposta: MSG.IMAGEM_GRANDE, evento: 'imagem_grande' });
  return null;
}

// 1) APAGAR vale em qualquer estado
if (t === 'APAGAR' || t === 'APAGAR MEUS DADOS') {
  return fixa({ resposta: MSG.APAGADO, acao: 'apagar', novo_estado: 'novo', novo_contexto: {}, evento: 'apagou' });
}

// 1b) SOBRE: quem fez o projeto, vale em qualquer estado e não muda nada
if (['SOBRE', 'QUEM FEZ', 'QUEM CRIOU', 'QUEM FEZ VOCE', 'QUEM TE FEZ', 'QUEM TE CRIOU', 'CRIADORA', 'CRIADOR', 'CONTATO'].includes(t)) {
  // Se estava no meio de uma sugestão, sai dela (a próxima mensagem não vira sugestão)
  const saiu = d.estado_atual === 'aguardando_sugestao' ? { novo_estado: 'aguardando_receita', novo_contexto: {} } : {};
  return fixa({ resposta: MSG.SOBRE, evento: 'sobre', botoes: [BT.OUTRA_RECEITA, BT.MENU], ...saiu });
}

// 2) Consentimento: usuário novo só segue depois de responder SIM
if (d.estado_atual === 'novo') {
  const pedido = d.contexto.consentimento_pedido === true;
  if (pedido && (t === 'SIM' || t === 'S' || t.startsWith('SIM '))) {
    return fixa({ resposta: MSG.BOAS_VINDAS, acao: 'consentir', novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'consentiu', lista: MENU_PRINCIPAL });
  }
  if (pedido && (t === 'NAO' || t === 'N' || t.startsWith('NAO '))) {
    return fixa({ resposta: MSG.CONSENTIMENTO_NAO, acao: 'apagar', novo_estado: 'novo', novo_contexto: {}, evento: 'recusou_consentimento' });
  }
  return fixa({ resposta: MSG.CONSENTIMENTO, novo_estado: 'novo', novo_contexto: { consentimento_pedido: true }, evento: pedido ? '-' : 'novo_usuario', botoes: [BT.CONSENTIR, BT.RECUSAR] });
}

// 2b) SUGESTÕES (participação popular). Vem antes das proteções porque a sugestão é texto livre
//     (ex.: "seria bom explicar a dose" não deve cair na resposta de dose).
//     Guardada SEM número e sem o código da pessoa; dados pessoais no texto viram [removido].
const RE_PEDE_SUGESTAO = /^(SUGESTAO|SUGESTOES|DAR SUGESTAO|DAR UMA SUGESTAO|QUERO DAR UMA SUGESTAO|TENHO UMA SUGESTAO|IDEIA|TENHO UMA IDEIA|RECLAMACAO|RECLAMAR|ELOGIO|OPINIAO|FEEDBACK)$/;
const SAIR_DA_SUGESTAO = ['MENU', 'OPCOES', 'VER OPCOES', 'RECOMECAR', 'CANCELAR', 'SAIR', 'NAO', 'N', 'DESISTI', 'DEIXA PRA LA', 'LISTA', 'OUTRA RECEITA'];
// Quem escreve o perfil em vez de tocar no menu ("sou farmacêutica")
function perfilEscrito(txt) {
  if (txt.split(' ').length > 6) return null;
  if (/FARMAC|BALCON/.test(txt)) return 'farmacia';
  if (/MEDIC|ENFERM|AGENTE|SAUDE|UBS|POSTO/.test(txt)) return 'saude';
  if (/MAE|PAI|AVO|FILH|ESPOS|MARIDO|MULHER|FAMILI|PARENTE|AJUDO|CUIDO/.test(txt)) return 'familia';
  if (/PRA MIM|PARA MIM|EU TOMO|EU USO|PACIENTE|APOSENTAD|IDOS/.test(txt)) return 'paciente';
  if (/PREFIRO NAO|NAO QUERO DIZER/.test(txt)) return 'nao_informado';
  return null;
}
if (RE_PEDE_SUGESTAO.test(t)) {
  return fixa({ resposta: MSG.SUGESTAO_PERFIL, novo_estado: 'aguardando_sugestao', novo_contexto: {}, evento: 'sugestao_iniciada', lista: MENU_PERFIL });
}
// Toque num perfil do menu de sugestão, mesmo se o passo não foi salvo (ou a conversa expirou): segue a sugestão
if (PERFIS[t] && d.estado_atual !== 'aguardando_sugestao') {
  return fixa({ resposta: MSG.SUGESTAO_PEDIR, novo_estado: 'aguardando_sugestao', novo_contexto: { perfil: PERFIS[t] }, evento: '-' });
}
if (d.estado_atual === 'aguardando_sugestao' && !temImagem && !ent.tem_audio && !ent.outro_arquivo) {
  const ctx = d.contexto || {};
  if (SAIR_DA_SUGESTAO.includes(t)) {
    if (['NAO', 'N', 'DESISTI', 'DEIXA PRA LA', 'CANCELAR', 'SAIR'].includes(t)) {
      return fixa({ resposta: MSG.SUGESTAO_CANCELADA, novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'sugestao_cancelada' });
    }
    // outros comandos (MENU, LISTA...) seguem o caminho normal mais abaixo, já fora da sugestão
    d.estado_atual = 'aguardando_receita';
    d.contexto = {};
  } else {
    // 1º passo: o perfil (tocado no menu ou escrito)
    const perfil = PERFIS[t] || (!ctx.perfil ? perfilEscrito(t) : null);
    if (perfil && !ctx.perfil) {
      return fixa({ resposta: MSG.SUGESTAO_PEDIR, novo_contexto: { perfil }, evento: '-' });
    }
    // 2º passo: a sugestão em si
    const texto = semDadosPessoais(d.texto);
    if (!texto || t.length < 4 || ehSaudacao || ehSim || PERFIS[t]) {
      return fixa({ resposta: ctx.perfil ? MSG.SUGESTAO_CURTA : MSG.SUGESTAO_PEDIR, evento: '-' });
    }
    return fixa({
      resposta: MSG.SUGESTAO_OBRIGADO, acao: 'sugestao', novo_estado: 'aguardando_receita', novo_contexto: {},
      evento: 'sugestao', detalhe: { perfil: ctx.perfil || 'nao_informado', via: ent.via_audio ? 'audio' : 'texto', texto },
      botoes: [BT.OUTRA_RECEITA, BT.MENU],
    });
  }
}

// 3) Proteções (não mudam o estado)
if (RE_SENSIVEL.test(t)) return fixa({ resposta: MSG.NUNCA_PEDIMOS, evento: 'alerta_dado_sensivel' });
if (RE_CPF.test(d.texto)) return fixa({ resposta: MSG.NAO_PRECISA_CPF, evento: 'alerta_cpf' });
if (RE_CLINICA.test(t)) return fixa({ resposta: MSG.FORA_CLINICO, evento: 'fora_clinico' });
if (!temImagem && RE_LISTA.test(t)) return seguir('lista', { filtro_lista: filtroLista() }); // não muda o estado
if (['RECOMECAR', 'CANCELAR', 'SAIR'].includes(t)) {
  return fixa({ resposta: MSG.RECOMECAR, novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'recomecou' });
}
if (['MENU', 'OPCOES', 'VER OPCOES'].includes(t)) {
  return fixa({ resposta: MSG.MENU, novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'menu', lista: MENU_PRINCIPAL });
}
// Botão "Outra receita": pede a próxima receita (o lugar já dito continua valendo)
if (['OUTRA RECEITA', 'NOVA RECEITA', 'MANDAR RECEITA', 'MANDAR UMA RECEITA'].includes(t)) {
  const local = d.contexto.local ? { local: d.contexto.local } : {};
  return fixa({ resposta: MSG.OUTRA_RECEITA, novo_estado: 'aguardando_receita', novo_contexto: local, evento: 'outra_receita' });
}
{ const x = checarArquivo(); if (x) return x; }
// Agradecimento: responde com carinho e não muda nada
if (!temImagem && /^(MUITO )?(OBRIGAD[OA]|BRIGAD[OA]|VALEU|GRATO|GRATA|DEUS TE PAGUE|DEUS LHE PAGUE)\b/.test(t) && t.split(' ').length <= 6) {
  return fixa({ resposta: MSG.DE_NADA, evento: 'agradeceu', botoes: [BT.OUTRA_RECEITA, BT.SUGESTAO, BT.SOBRE] });
}

// 4) Cada estado
switch (d.estado_atual) {
  case 'aguardando_confirmacao': {
    if (ehSim) {
      if (!(d.contexto.itens || []).length) {
        return fixa({ resposta: MSG.PEDIR_RECEITA, novo_estado: 'aguardando_receita', novo_contexto: {} });
      }
      return seguir('resultado');
    }
    if (ehNao) {
      const local = d.contexto.local ? { local: d.contexto.local } : {}; // o lugar já dito continua valendo
      return fixa({ resposta: MSG.CONFIRMACAO_NAO, novo_estado: 'aguardando_receita', novo_contexto: local, evento: 'confirmacao_nao' });
    }
    if (temImagem || (t && !ehSaudacao)) return seguir('extrair'); // correção: lê de novo
    return fixa({ resposta: MSG.CONFIRMAR_DE_NOVO, botoes: [BT.TA_CERTO, BT.TA_ERRADO] });
  }

  case 'aguardando_cep': {
    // Aceita CEP (digitado ou falado: "zero um três...") OU o nome da cidade/bairro
    const digitos = (cepFalado(t) || d.texto.match(/\d/g) || []).join('');
    if (!temImagem && digitos.length === 8) return seguir('cep', { cep: digitos });
    if (temImagem) return seguir('extrair'); // mandou outra receita
    const local = d.contexto.local;
    // A pessoa já tinha dito o lugar (junto com o remédio) e confirmou com SIM
    if (ehSim && local) {
      if (local.cep) return seguir('cep', { cep: local.cep });
      return seguir('cidade', { local_b64: txt64([local.bairro, local.cidade, local.uf].filter(Boolean).join(' ')) });
    }
    if (ehNao && local) {
      const { local: _, ...resto } = d.contexto;
      return fixa({ resposta: MSG.PEDIR_CEP, novo_contexto: resto, evento: 'local_recusado' });
    }
    if (ehNao) return fixa({ resposta: MSG.SEM_CEP, novo_estado: 'concluido', novo_contexto: {}, evento: 'sem_cep' });
    if (/[A-Z]{3,}/.test(t) && !ehSim) {
      // Texto com letras: tenta achar a cidade (e o bairro). O texto vai só para a consulta; não é salvo.
      return seguir('cidade', { local_b64: txt64(d.texto) });
    }
    return fixa({ resposta: ehSim ? MSG.PEDIR_CEP : MSG.CEP_INVALIDO });
  }

  default: { // aguardando_receita ou concluido
    if (temImagem) return seguir('extrair');
    // Depois de ver as farmácias, a pessoa pode corrigir o lugar sem recomeçar
    if (d.contexto.farmacias_mostradas && t) {
      const digitos = (cepFalado(t) || d.texto.match(/\d/g) || []).join('');
      if (digitos.length === 8) return seguir('cep', { cep: digitos });
      if (RE_CORRIGE_LOCAL.test(t) && !/\d+\s*(MG|MCG|ML|UI)\b/.test(t)) return seguir('cidade', { local_b64: txt64(d.texto) });
      // Sem pista clara: o Claude decide se é um remédio novo ou um lugar
    }
    if (!t || ehSaudacao || ehSim || ehNao) {
      return fixa({ resposta: d.aviso + MSG.PEDIR_RECEITA, novo_estado: 'aguardando_receita', novo_contexto: {}, lista: MENU_PRINCIPAL });
    }
    return seguir('extrair');
  }
}
