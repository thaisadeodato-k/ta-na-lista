// Gera n8n/ta_na_lista_fase1.json juntando o código de n8n/codigo/*.js e os prompts de prompts/.
// Uso (na pasta do projeto):  node scripts/gerar_fluxo_n8n.mjs
// Assim os prompts do fluxo ficam sempre iguais aos arquivos da pasta /prompts.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

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

const CRED_PG = { postgres: { id: 'preencher-supabase', name: 'Supabase Postgres (Tá na Lista)' } };
const CRED_CLAUDE = { httpHeaderAuth: { id: 'preencher-claude', name: 'Claude API (x-api-key)' } };

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

const nodes = [
  nota('## 🔌 ENTRADA (Fase 1)\nNa **Fase 2**, troque estes 2 nós pelo **WhatsApp Trigger** + nó "Entrada WhatsApp → formato padrão" (ver docs/configuracao.md). O resto do fluxo não muda.', [-60, 120], 480, 360, 4),
  {
    parameters: { public: false, options: { allowFileUploads: true, allowedFilesMimeTypes: 'image/*,audio/*' } },
    id: id(), name: 'Chat de teste (Fase 1)', type: '@n8n/n8n-nodes-langchain.chatTrigger', typeVersion: 1.1,
    position: [0, 300], webhookId: '7a1e0c55-4d1f-4b7e-9a51-7a6e11a0c001',
  },
  code('Entrada → formato padrão', '01_entrada_chat.js', [220, 300]),
  pg('Carregar conversa', 'select public.tnl_carregar_conversa($1) as r;', '={{ $json.id_bruto }}', [440, 300]),
  code('Decidir rota', '02_decidir_rota.js', [660, 300]),
  {
    parameters: { rules: { values: [
      regra('fixa', 'Resposta pronta'),
      regra('extrair', 'Ler receita'),
      regra('resultado', 'Dizer se está na lista'),
      regra('cep', 'Buscar farmácias'),
    ] }, options: {} },
    id: id(), name: 'Rota', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [880, 300],
  },

  nota('## 📷 LER RECEITA\nClaude só extrai os dados em JSON. Quem decide se está na lista é a consulta SQL **"Consultar base oficial"** (regra de ouro).', [1060, -160], 1100, 340, 5),
  code('Preparar extração', '03_preparar_extracao.js', [1100, 0]),
  claude('Claude: ler receita', [1320, 0]),
  code('Ler extração', '04_ler_extracao.js', [1540, 0]),
  pg('Consultar base oficial', "select public.verificar_medicamentos(convert_from(decode($1, 'base64'), 'UTF8')::jsonb) as r;", '={{ $json.lista_b64 }}', [1760, 0]),
  code('Montar confirmação', '05_montar_confirmacao.js', [1980, 0]),

  code('Preparar redação', '06_preparar_redacao.js', [1100, 300]),
  claude('Claude: redigir resposta do Zé', [1320, 300]),
  code('Conferir redação', '07_conferir_redacao.js', [1540, 300]),

  {
    parameters: {
      url: '=https://cep.awesomeapi.com.br/json/{{ $json.cep }}',
      options: { timeout: 15000, response: { response: { neverError: true } } },
    },
    id: id(), name: 'CEP → coordenadas', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 560],
    onError: 'continueRegularOutput',
  },
  code('Ler CEP', '08_ler_cep.js', [1320, 560]),
  pg('Farmácias mais próximas',
    "select public.tnl_farmacias_para_cep(public.tnl_num($1), public.tnl_num($2), trim(convert_from(decode($3, 'base64'), 'UTF8')), 3) as r;",
    '={{ $json.lat }},{{ $json.lon }},{{ $json.municipio_b64 }}', [1540, 560]),
  code('Montar resposta farmácias', '09_montar_farmacias.js', [1760, 560]),

  { parameters: {}, id: id(), name: 'Juntar resposta', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [2200, 300] },
  pg('Salvar conversa',
    "select public.tnl_salvar_conversa($1, $2, $3, convert_from(decode($4, 'base64'), 'UTF8')::jsonb, nullif($5, '-'), convert_from(decode($6, 'base64'), 'UTF8')::jsonb) as r;",
    '={{ $json.usuario_hash }},{{ $json.acao }},{{ $json.novo_estado }},{{ $json.novo_contexto_b64 }},{{ $json.evento }},{{ $json.detalhe_b64 }}',
    [2420, 300], { onError: 'continueRegularOutput' }),
  nota('## 📤 SAÍDA (Fase 1)\nNa **Fase 2**, troque este nó por um envio à WhatsApp Cloud API (ver docs/configuracao.md).', [2580, 120], 300, 360, 4),
  code('Saída → chat (Fase 1)', '10_saida_chat.js', [2640, 300]),
];

const liga = (...destinos) => ({ main: destinos.map((d) => (d ? [{ node: d, type: 'main', index: 0 }] : [])) });
const connections = {
  'Chat de teste (Fase 1)': liga('Entrada → formato padrão'),
  'Entrada → formato padrão': liga('Carregar conversa'),
  'Carregar conversa': liga('Decidir rota'),
  'Decidir rota': liga('Rota'),
  'Rota': liga('Juntar resposta', 'Preparar extração', 'Preparar redação', 'CEP → coordenadas'),
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
  'Salvar conversa': liga('Saída → chat (Fase 1)'),
};

// Confere se toda ligação aponta para um nó que existe
const nomes = new Set(nodes.map((n) => n.name));
for (const [de, c] of Object.entries(connections)) {
  if (!nomes.has(de)) throw new Error('Nó inexistente: ' + de);
  for (const saida of c.main) for (const l of saida) if (!nomes.has(l.node)) throw new Error('Nó inexistente: ' + l.node);
}

const fluxo = {
  name: 'Tá na Lista — Fase 1 (chat de teste)',
  nodes,
  connections,
  pinData: {},
  settings: { executionOrder: 'v1' },
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

writeFileSync(join(raiz, 'n8n', 'ta_na_lista_fase1.json'), JSON.stringify(fluxo, null, 2), 'utf8');
console.log(`OK: n8n/ta_na_lista_fase1.json gerado (${nodes.length} nós).`);
