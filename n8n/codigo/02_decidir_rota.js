/*__COMUM__*/
// DECIDIR ROTA: olha o estado da conversa e a mensagem, e escolhe o caminho.
//   rota = 'fixa'      -> resposta pronta (sem IA)
//   rota = 'extrair'   -> ler receita/texto com o Claude
//   rota = 'resultado' -> pessoa confirmou: dizer se está na lista
//   rota = 'cep'       -> procurar farmácias pelo CEP
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

const MAX_IMG = 3.7 * 1024 * 1024; // limite do Claude é 5 MB em base64
const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ehSim = ['SIM', 'S', 'ISSO', 'ISSO MESMO', 'CERTO', 'TA CERTO', 'ESTA CERTO', 'CORRETO', 'OK', 'CONFIRMO'].includes(t) || t.startsWith('SIM ');
const ehNao = ['NAO', 'N', 'ERRADO', 'TA ERRADO', 'ESTA ERRADO'].includes(t) || t.startsWith('NAO ');
const ehSaudacao = ['OI', 'OIE', 'OLA', 'BOM DIA', 'BOA TARDE', 'BOA NOITE', 'AJUDA', 'INICIO', 'OI ZE', 'OLA ZE', 'ZE'].includes(t);

// Perguntas clínicas e dados sensíveis: resposta fixa, sem IA, em qualquer estado
const RE_CLINICA = /(QUAL A DOSE|QUAL DOSE|QUE DOSE|DOSE CERTA|DOSAGEM|AUMENTAR A DOSE|DIMINUIR A DOSE|QUANTOS? (COMPRIMIDOS?|GOTAS|VEZES)|POSSO TOMAR|PODE TOMAR|DA PRA TOMAR|EFEITO|COLATERA|INTERACAO|INTERAGE|MISTURAR|TROCAR|SUBSTITU|ALCOOL|CERVEJA|BEBIDA|GRAVIDA|AMAMENTA|PARAR DE TOMAR|ESQUECI DE TOMAR|SERVE PRA|SERVE PARA|PRA QUE SERVE|PARA QUE SERVE|CONTRAINDICA|ALERGIA|FAZ MAL|REACAO)/;
const RE_SENSIVEL = /\b(SENHA|CARTAO(?! (DO )?SUS)|PIX|CONTA BANCARIA|CONTA DO BANCO|AGENCIA|CVV|TOKEN|BOLETO|DADOS BANCARIOS)\b/;
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;

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

// 2) Consentimento: usuário novo só segue depois de responder SIM
if (d.estado_atual === 'novo') {
  const pedido = d.contexto.consentimento_pedido === true;
  if (pedido && (t === 'SIM' || t === 'S' || t.startsWith('SIM '))) {
    return fixa({ resposta: MSG.BOAS_VINDAS, acao: 'consentir', novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'consentiu' });
  }
  if (pedido && (t === 'NAO' || t === 'N' || t.startsWith('NAO '))) {
    return fixa({ resposta: MSG.CONSENTIMENTO_NAO, acao: 'apagar', novo_estado: 'novo', novo_contexto: {}, evento: 'recusou_consentimento' });
  }
  return fixa({ resposta: MSG.CONSENTIMENTO, novo_estado: 'novo', novo_contexto: { consentimento_pedido: true }, evento: pedido ? '-' : 'novo_usuario' });
}

// 3) Proteções (não mudam o estado)
if (RE_SENSIVEL.test(t)) return fixa({ resposta: MSG.NUNCA_PEDIMOS, evento: 'alerta_dado_sensivel' });
if (RE_CPF.test(d.texto)) return fixa({ resposta: MSG.NAO_PRECISA_CPF, evento: 'alerta_cpf' });
if (RE_CLINICA.test(t)) return fixa({ resposta: MSG.FORA_CLINICO, evento: 'fora_clinico' });
if (['RECOMECAR', 'CANCELAR', 'MENU', 'SAIR'].includes(t)) {
  return fixa({ resposta: MSG.RECOMECAR, novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'recomecou' });
}
{ const x = checarArquivo(); if (x) return x; }

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
      return fixa({ resposta: MSG.CONFIRMACAO_NAO, novo_estado: 'aguardando_receita', novo_contexto: {}, evento: 'confirmacao_nao' });
    }
    if (temImagem || (t && !ehSaudacao)) return seguir('extrair'); // correção: lê de novo
    return fixa({ resposta: MSG.CONFIRMAR_DE_NOVO });
  }

  case 'aguardando_cep': {
    const digitos = (d.texto.match(/\d/g) || []).join('');
    if (!temImagem && digitos.length === 8) return seguir('cep', { cep: digitos });
    if (temImagem) return seguir('extrair'); // mandou outra receita
    if (ehNao) return fixa({ resposta: MSG.SEM_CEP, novo_estado: 'concluido', novo_contexto: {}, evento: 'sem_cep' });
    return fixa({ resposta: MSG.CEP_INVALIDO });
  }

  default: { // aguardando_receita ou concluido
    if (temImagem) return seguir('extrair');
    if (!t || ehSaudacao || ehSim || ehNao) {
      return fixa({ resposta: d.aviso + MSG.PEDIR_RECEITA, novo_estado: 'aguardando_receita', novo_contexto: {} });
    }
    return seguir('extrair');
  }
}
