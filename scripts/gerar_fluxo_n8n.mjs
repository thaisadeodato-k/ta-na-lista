// Gera os fluxos do n8n juntando o código de n8n/codigo/*.js e os prompts de prompts/:
//   n8n/ta_na_lista_fase1.json    -> entrada e saída pelo chat de teste do n8n
//   n8n/ta_na_lista_whatsapp.json -> entrada e saída pela WhatsApp Cloud API (Fase 2)
// O "meio" dos dois fluxos é idêntico; só mudam a entrada e a saída.
// Uso (na pasta do projeto):  node scripts/gerar_fluxo_n8n.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

// Versão da Graph API da Meta (WhatsApp). Atualize quando a Meta lançar uma nova.
const GRAPH = 'https://graph.facebook.com/v26.0';

const comum = ler('n8n/codigo/_comum.js');
const subst = {
  '/*__COMUM__*/': comum,
  '/*__PROMPT_EXTRACAO__*/': JSON.stringify(ler('prompts/extracao_receita.md').trim()),
  '/*__SCHEMA_EXTRACAO__*/': JSON.stringify(JSON.parse(ler('prompts/extracao_schema.json'))),
  '/*__PROMPT_REDACAO__*/': JSON.stringify(ler('prompts/redacao_ze.md').trim()),
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function codigo(arquivo) {
  let js = ler('n8n/codigo/' + arquivo);
  for (const [k, v] of Object.entries(subst)) js = js.split(k).join(v);
  if (/\/\*__[A-Z_]+__\*\//.test(js)) throw new Error('Marcador não substituído em ' + arquivo);
  try { new AsyncFunction('$', '$input', 'Buffer', js); } // confere a sintaxe
  catch (e) { throw new Error(`Erro de sintaxe em ${arquivo}: ${e.message}`); }
  return js;
}

let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

// LGPD: não guardar execuções bem-sucedidas nem manuais (teriam telefone, texto, áudio e foto da receita).
// Execuções com erro ficam salvas para diagnóstico e o n8n Cloud apaga sozinho em até 7 dias.
const CONFIG_LGPD = {
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'all',
  saveManualExecutions: false,
  saveExecutionProgress: false,
};

const CRED_PG = { postgres: { id: 'preencher-supabase', name: 'Supabase Postgres (Tá na Lista)' } };
const CRED_CLAUDE = { httpHeaderAuth: { id: 'preencher-claude', name: 'Claude API (x-api-key)' } };
const CRED_WA_TOKEN = { httpHeaderAuth: { id: 'preencher-wa-token', name: 'WhatsApp token (Bearer)' } };
const CRED_WA_TRIGGER = { whatsAppTriggerApi: { id: 'preencher-wa-trigger', name: 'WhatsApp Trigger (Tá na Lista)' } };
const CRED_GROQ = { httpHeaderAuth: { id: 'preencher-groq', name: 'Groq API (Bearer)' } };
// Transcrição de áudio (Fase 2). Nomes de remédio no "prompt" ajudam o Whisper a acertar a grafia.
const MODELO_TRANSCRICAO = 'whisper-large-v3-turbo';
const DICA_TRANSCRICAO = 'Receita de remédio do Farmácia Popular: losartana, metformina, sinvastatina, atenolol, captopril, glibenclamida, hidroclorotiazida, insulina, salbutamol, levodopa. CEP.';

const code = (name, arquivo, pos) => ({
  parameters: { jsCode: codigo(arquivo) },
  id: id(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
});
const pg = (name, query, replacement, pos, extra = {}) => ({
  parameters: { operation: 'executeQuery', query, options: { queryReplacement: replacement } },
  id: id(), name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: pos, credentials: CRED_PG, ...extra,
});
const claude = (name, pos) => ({
  parameters: {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'anthropic-version', value: '2026-10-21' },
      { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
    ] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.claude_body) }}',
    options: { timeout: 120000, response: { response: { neverError: true } } },
  },
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  credentials: CRED_CLAUDE, onError: 'continueRegularOutput',
});
const metaGet = (name, url, pos, arquivo = false) => ({
  parameters: {
    url,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    options: {
      timeout: 30000,
      response: { response: arquivo ? { responseFormat: 'file', outputPropertyName: 'data' } : { neverError: true } },
    },
  },
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  credentials: CRED_WA_TOKEN, onError: 'continueRegularOutput',
});
const nota = (content, pos, width, height, color) => ({
  parameters: { content, width, height, color },
  id: id(), name: 'Nota ' + seq, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos,
});
const regra = (valor, rotulo) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: id(), leftValue: '={{ $json.rota }}', rightValue: valor, operator: { type: 'string', operation: 'equals' } }],
    combinator: 'and',
  },
  renameOutput: true,
  outputKey: rotulo,
});
const liga = (...destinos) => ({ main: destinos.map((d) => (d ? [{ node: d, type: 'main', index: 0 }] : [])) });

// ---------- MEIO DO FLUXO (igual nas duas fases) ----------
function meio() {
  const nodes = [
    pg('Carregar conversa', 'select public.tnl_carregar_conversa($1) as r;', '={{ $json.id_bruto }}', [440, 300]),
    code('Decidir rota', '02_decidir_rota.js', [660, 300]),
    {
      parameters: { rules: { values: [
        regra('fixa', 'Resposta pronta'),
        regra('extrair', 'Ler receita'),
        regra('resultado', 'Dizer se está na lista'),
        regra('cep', 'Buscar farmácias'),
        regra('lista', 'Mostrar a lista'),
        regra('cidade', 'Buscar pela cidade'),
      ] }, options: {} },
      id: id(), name: 'Rota', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [880, 300],
    },
    nota('## 📷 LER RECEITA\nClaude só extrai os dados em JSON. Quem decide se está na lista é a consulta SQL **"Consultar base oficial"** (regra de ouro).', [1060, -160], 1100, 340, 5),
    code('Preparar extração', '03_preparar_extracao.js', [1100, 0]),
    claude('Claude: ler receita', [1320, 0]),
    code('Ler extração', '04_ler_extracao.js', [1540, 0]),
    pg('Consultar base oficial',
      "select public.verificar_medicamentos(convert_from(decode($1, 'base64'), 'UTF8')::jsonb) as r, " +
      "public.tnl_farmacias_para_texto(convert_from(decode($2, 'base64'), 'UTF8'), 3) as local;",
      '={{ $json.lista_b64 }},{{ $json.local_b64 }}', [1760, 0]),
    code('Montar confirmação', '05_montar_confirmacao.js', [1980, 0]),
    code('Preparar redação', '06_preparar_redacao.js', [1100, 300]),
    claude('Claude: redigir resposta do Zé', [1320, 300]),
    code('Conferir redação', '07_conferir_redacao.js', [1540, 300]),
    {
      parameters: {
        url: '=https://brasilapi.com.br/api/cep/v2/{{ $json.cep }}',
        options: { timeout: 15000, response: { response: { neverError: true } } },
      },
      id: id(), name: 'CEP → coordenadas', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 560],
      onError: 'continueRegularOutput',
    },
    code('Ler CEP', '08_ler_cep.js', [1320, 560]),
    pg('Farmácias mais próximas',
      "select public.tnl_farmacias_para_cep(public.tnl_num($1), public.tnl_num($2), trim(convert_from(decode($3, 'base64'), 'UTF8')), nullif($4, '-'), trim(convert_from(decode($5, 'base64'), 'UTF8')), 3) as r;",
      '={{ $json.lat }},{{ $json.lon }},{{ $json.municipio_b64 }},{{ $json.uf }},{{ $json.bairro_b64 }}', [1540, 560]),
    // Pessoa mandou o nome da cidade (e do bairro) em vez do CEP
    pg('Farmácias pela cidade',
      "select public.tnl_farmacias_para_texto(convert_from(decode($1, 'base64'), 'UTF8'), 3) as r;",
      '={{ $json.local_b64 }}', [1540, 700]),
    code('Montar resposta farmácias', '09_montar_farmacias.js', [1760, 560]),
    pg('Listar remédios da lista oficial', 'select public.tnl_listar_elenco($1) as r;', '={{ $json.filtro_lista }}', [1100, 800]),
    code('Montar lista', '11_montar_lista.js', [1320, 800]),
    { parameters: {}, id: id(), name: 'Juntar resposta', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [2200, 300] },
    pg('Salvar conversa',
      "select public.tnl_salvar_conversa($1, $2, $3, convert_from(decode($4, 'base64'), 'UTF8')::jsonb, nullif($5, '-'), convert_from(decode($6, 'base64'), 'UTF8')::jsonb) as r;",
      '={{ $json.usuario_hash }},{{ $json.acao }},{{ $json.novo_estado }},{{ $json.novo_contexto_b64 }},{{ $json.evento }},{{ $json.detalhe_b64 }}',
      [2420, 300], { onError: 'continueRegularOutput' }),
  ];
  const connections = {
    'Entrada → formato padrão': liga('Carregar conversa'),
    'Carregar conversa': liga('Decidir rota'),
    'Decidir rota': liga('Rota'),
    'Rota': liga('Juntar resposta', 'Preparar extração', 'Preparar redação', 'CEP → coordenadas', 'Listar remédios da lista oficial', 'Farmácias pela cidade'),
    'Farmácias pela cidade': liga('Montar resposta farmácias'),
    'Listar remédios da lista oficial': liga('Montar lista'),
    'Montar lista': liga('Juntar resposta'),
    'Preparar extração': liga('Claude: ler receita'),
    'Claude: ler receita': liga('Ler extração'),
    'Ler extração': liga('Consultar base oficial'),
    'Consultar base oficial': liga('Montar confirmação'),
    'Montar confirmação': liga('Juntar resposta'),
    'Preparar redação': liga('Claude: redigir resposta do Zé'),
    'Claude: redigir resposta do Zé': liga('Conferir redação'),
    'Conferir redação': liga('Juntar resposta'),
    'CEP → coordenadas': liga('Ler CEP'),
    'Ler CEP': liga('Farmácias mais próximas'),
    'Farmácias mais próximas': liga('Montar resposta farmácias'),
    'Montar resposta farmácias': liga('Juntar resposta'),
    'Juntar resposta': liga('Salvar conversa'),
  };
  return { nodes, connections };
}

// ---------- FASE 1: chat de teste ----------
function fase1() {
  const m = meio();
  const nodes = [
    nota('## 🔌 ENTRADA (Fase 1)\nChat de teste do n8n. A versão para WhatsApp é o fluxo **ta_na_lista_whatsapp.json** (mesmo meio, outra entrada e saída).', [-60, 120], 480, 360, 4),
    {
      parameters: { public: false, options: { allowFileUploads: true, allowedFilesMimeTypes: 'image/*,audio/*' } },
      id: id(), name: 'Chat de teste (Fase 1)', type: '@n8n/n8n-nodes-langchain.chatTrigger', typeVersion: 1.1,
      position: [0, 300], webhookId: '7a1e0c55-4d1f-4b7e-9a51-7a6e11a0c001',
    },
    code('Entrada → formato padrão', '01_entrada_chat.js', [220, 300]),
    ...m.nodes,
    nota('## 📤 SAÍDA (Fase 1)\nDevolve a resposta para o chat de teste.', [2580, 120], 300, 360, 4),
    code('Saída → chat (Fase 1)', '10_saida_chat.js', [2640, 300]),
  ];
  const connections = {
    'Chat de teste (Fase 1)': liga('Entrada → formato padrão'),
    ...m.connections,
    'Salvar conversa': liga('Saída → chat (Fase 1)'),
  };
  return { name: 'Tá na Lista — Fase 1 (chat de teste)', nodes, connections, settings: CONFIG_LGPD };
}

// ---------- FASE 2: WhatsApp Cloud API ----------
function fase2() {
  const m = meio();
  const nodes = [
    nota('## 🔌 ENTRADA (WhatsApp)\nRecebe a mensagem da Meta. Se vier foto ou PDF, baixa o arquivo; se vier áudio, baixa e transforma a fala em texto (Groq). Tudo fica só na memória desta execução; nada é salvo.', [-1760, -200], 2180, 740, 4),
    {
      parameters: { updates: ['messages'] },
      id: id(), name: 'WhatsApp Trigger', type: 'n8n-nodes-base.whatsAppTrigger', typeVersion: 1,
      position: [-1700, 300], webhookId: '7a1e0c55-4d1f-4b7e-9a51-7a6e11a0c002', credentials: CRED_WA_TRIGGER,
    },
    code('WhatsApp: separar mensagem', 'fase2_separar_whatsapp.js', [-1500, 300]),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: id(), leftValue: '={{ $json.media_id || "" }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
      id: id(), name: 'Tem mídia?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-1300, 300],
    },
    metaGet('Meta: pegar URL da mídia', `=${GRAPH}/{{ $json.media_id }}`, [-1100, 200]),
    metaGet('Meta: baixar mídia', '={{ $json.url }}', [-900, 200], true),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: id(), leftValue: "={{ $('WhatsApp: separar mensagem').first().json.tipo }}", rightValue: 'audio', operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        options: {},
      },
      id: id(), name: 'É áudio?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-700, 200],
    },
    // LGPD: o áudio só vai para a transcrição se a pessoa já respondeu SIM ao consentimento
    pg('Já aceitou os termos?',
      'select exists(select 1 from public.usuario where usuario_hash = public.tnl_hash($1) and consentiu_em is not null) as ok;',
      "={{ $('WhatsApp: separar mensagem').first().json.id_bruto }}", [-500, 40]),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: id(), leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
      id: id(), name: 'Pode transcrever?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-300, 40],
    },
    code('Preparar áudio', 'fase2_preparar_audio.js', [-100, -60]),
    {
      parameters: {
        method: 'POST',
        url: 'https://api.groq.com/openai/v1/audio/transcriptions',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        contentType: 'multipart-form-data',
        bodyParameters: { parameters: [
          { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' },
          { name: 'model', value: MODELO_TRANSCRICAO },
          { name: 'language', value: 'pt' },
          { name: 'response_format', value: 'json' },
          { name: 'temperature', value: '0' },
          { name: 'prompt', value: DICA_TRANSCRICAO },
        ] },
        options: { timeout: 60000, response: { response: { neverError: true } } },
      },
      id: id(), name: 'Transcrever áudio (Groq)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [100, -60],
      credentials: CRED_GROQ, onError: 'continueRegularOutput',
    },
    code('Entrada → formato padrão', 'fase2_entrada_whatsapp.js', [260, 300]),
    ...m.nodes,
    nota('## 📤 SAÍDA (WhatsApp)\nResponde pelo mesmo número que recebeu a mensagem, com botões quando houver. O telefone da pessoa só existe na memória da execução; no banco ele é sempre hash.', [2580, 120], 520, 400, 4),
    code('Montar envio WhatsApp', 'fase2_montar_envio.js', [2640, 300]),
    {
      parameters: {
        method: 'POST',
        url: `=${GRAPH}/{{ $('WhatsApp: separar mensagem').first().json.phone_number_id }}/messages`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.corpo) }}',
        // Um envio por vez, na ordem (texto longo primeiro, botões depois)
        options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 600 } } },
      },
      id: id(), name: 'Saída → WhatsApp', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2880, 300],
      credentials: CRED_WA_TOKEN,
    },
  ];
  const connections = {
    'WhatsApp Trigger': liga('WhatsApp: separar mensagem'),
    'WhatsApp: separar mensagem': liga('Tem mídia?'),
    'Tem mídia?': liga('Meta: pegar URL da mídia', 'Entrada → formato padrão'),
    'Meta: pegar URL da mídia': liga('Meta: baixar mídia'),
    'Meta: baixar mídia': liga('É áudio?'),
    'É áudio?': liga('Já aceitou os termos?', 'Entrada → formato padrão'),
    'Já aceitou os termos?': liga('Pode transcrever?'),
    'Pode transcrever?': liga('Preparar áudio', 'Entrada → formato padrão'),
    'Preparar áudio': liga('Transcrever áudio (Groq)'),
    'Transcrever áudio (Groq)': liga('Entrada → formato padrão'),
    ...m.connections,
    'Salvar conversa': liga('Montar envio WhatsApp'),
    'Montar envio WhatsApp': liga('Saída → WhatsApp'),
  };
  return { name: 'Tá na Lista — WhatsApp', nodes, connections, settings: CONFIG_LGPD };
}

function salvar(arquivo, { name, nodes, connections, settings = {} }) {
  const nomes = new Set(nodes.map((n) => n.name));
  if (nomes.size !== nodes.length) throw new Error('Nomes de nós repetidos em ' + arquivo);
  for (const [de, c] of Object.entries(connections)) {
    if (!nomes.has(de)) throw new Error('Nó inexistente: ' + de);
    for (const saida of c.main) for (const l of saida) if (!nomes.has(l.node)) throw new Error('Nó inexistente: ' + l.node);
  }
  const fluxo = { name, nodes, connections, pinData: {}, settings: { executionOrder: 'v1', ...settings }, meta: { templateCredsSetupCompleted: false }, tags: [] };
  writeFileSync(join(raiz, 'n8n', arquivo), JSON.stringify(fluxo, null, 2), 'utf8');
  console.log(`OK: n8n/${arquivo} gerado (${nodes.length} nós).`);
}

// ---------- ATUALIZAR FARMÁCIAS (a cada 15 dias) ----------
// Baixa a planilha oficial do Ministério, confere, grava no banco e avisa por e-mail se algo der errado.
const URL_LISTA_FARMACIAS =
  'https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/publicacoes/farmacias-participante-do-programa-farmacia-popular/@@download/file';
function atualizarFarmacias() {
  const AVISO = 'Avisar por e-mail';
  const nodes = [
    nota('## 🔄 ATUALIZAR FARMÁCIAS\nA cada 15 dias baixa a lista oficial "Farmácias participantes do PFPB" (Ministério da Saúde), confere se veio certinha e atualiza o banco.\n\nSe algo der errado (link mudou, formato mudou, lista pela metade, erro no banco), **não mexe no banco** e manda um e-mail de aviso.', [-60, -120], 1700, 280, 4),
    {
      parameters: { rule: { interval: [{ field: 'days', daysInterval: 15, triggerAtHour: 6 }] } },
      id: id(), name: 'A cada 15 dias', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 300],
    },
    {
      parameters: {
        url: URL_LISTA_FARMACIAS,
        options: { timeout: 120000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
      },
      id: id(), name: 'Baixar lista oficial', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 300],
      onError: 'continueErrorOutput',
    },
    {
      parameters: { operation: 'xlsx', binaryPropertyName: 'data', options: { includeEmptyCells: true } },
      id: id(), name: 'Ler planilha', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: [440, 300],
      onError: 'continueErrorOutput',
    },
    code('Validar planilha', '20_validar_farmacias.js', [660, 300]),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: id(), leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
      id: id(), name: 'Planilha ok?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [880, 300],
    },
    pg('Gravar farmácias',
      "insert into public.farmacia (cnpj, nome, endereco, bairro, municipio, uf, ativo, lista_de) " +
      "select x.cnpj, x.nome, x.endereco, nullif(x.bairro, ''), x.municipio, x.uf, true, $2::date " +
      "from jsonb_to_recordset(convert_from(decode($1, 'base64'), 'UTF8')::jsonb) " +
      "as x(cnpj text, nome text, endereco text, bairro text, municipio text, uf text) " +
      "on conflict (cnpj) do update set nome = excluded.nome, endereco = excluded.endereco, bairro = excluded.bairro, " +
      "municipio = excluded.municipio, uf = excluded.uf, ativo = true, lista_de = excluded.lista_de;",
      '={{ $json.lote_b64 }},{{ $json.lista_de }}', [1100, 200], { onError: 'continueErrorOutput' }),
    pg('Desativar quem saiu',
      // Trava: só desativa se TODAS as farmácias da lista nova foram gravadas (nenhum lote falhou)
      "with ok as (select (select count(*) from public.farmacia where lista_de = $1::date) >= $2::int as tudo_gravado), " +
      "d as (update public.farmacia set ativo = false where ativo and lista_de is distinct from $1::date " +
      "and (select tudo_gravado from ok) returning 1) " +
      // se a trava segurar, gera um erro com mensagem clara (vai para o e-mail de aviso)
      // (a mensagem fica dentro de uma subconsulta para o Postgres não "calcular o erro" antes da hora)
      "select count(*) as desativadas, cast(nullif((select case when tudo_gravado then '' " +
      "else 'Nem todas as farmácias da lista nova foram gravadas; não desativei nenhuma' end from ok), '') as int) as trava from d;",
      "={{ $('Validar planilha').first().json.lista_de }},{{ $('Validar planilha').first().json.total }}", [1320, 200], { onError: 'continueErrorOutput', executeOnce: true }),
    pg('Padronizar busca',
      "select public.tnl_farmacias_normalizar() as padronizadas, (select count(*) from public.farmacia where ativo) as ativas;",
      '', [1540, 200], { onError: 'continueErrorOutput', executeOnce: true }),
    {
      parameters: {
        resource: 'message', operation: 'send',
        sendTo: 'PREENCHER_EMAIL', // o e-mail de aviso é preenchido só no n8n (não vai para o GitHub)
        subject: '⚠️ Tá na Lista: a atualização das farmácias não rodou',
        emailType: 'text',
        options: { appendAttribution: false },
        message: "=A atualização automática da lista de farmácias do Farmácia Popular não foi feita.\n\n" +
          "Motivo: {{ $json.motivo || ($json.error && ($json.error.message || $json.error)) || 'erro inesperado (veja a aba Executions do fluxo no n8n)' }}\n\n" +
          "O banco continua com a lista anterior, então o Zé segue funcionando.\n\n" +
          "O que fazer: abra a página da lista no site do Ministério da Saúde e confira se o arquivo mudou de lugar ou de formato:\n" +
          "https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/publicacoes/farmacias-participante-do-programa-farmacia-popular/view\n\n" +
          "Passo a passo para atualizar à mão: docs/configuracao.md, Parte 4.",
      },
      id: id(), name: AVISO, type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [1100, 520],
      executeOnce: true,
      credentials: { gmailOAuth2: { id: 'preencher-gmail', name: 'Gmail (avisos Tá na Lista)' } },
    },
  ];
  const liga2 = (ok, erro) => ({ main: [[{ node: ok, type: 'main', index: 0 }], [{ node: erro, type: 'main', index: 0 }]] });
  const connections = {
    'A cada 15 dias': liga('Baixar lista oficial'),
    'Baixar lista oficial': liga2('Ler planilha', AVISO),
    'Ler planilha': liga2('Validar planilha', AVISO),
    'Validar planilha': liga('Planilha ok?'),
    'Planilha ok?': liga2('Gravar farmácias', AVISO),
    'Gravar farmácias': liga2('Desativar quem saiu', AVISO),
    'Desativar quem saiu': liga2('Padronizar busca', AVISO),
    'Padronizar busca': { main: [[], [{ node: AVISO, type: 'main', index: 0 }]] },
  };
  return { name: 'Tá na Lista — Atualizar farmácias (a cada 15 dias)', nodes, connections, settings: CONFIG_LGPD };
}

salvar('ta_na_lista_fase1.json', fase1());
salvar('ta_na_lista_whatsapp.json', fase2());
salvar('ta_na_lista_atualizar_farmacias.json', atualizarFarmacias());
