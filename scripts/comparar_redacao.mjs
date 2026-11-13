// Compara a etapa "escrever a resposta do Zé" no Opus 5.5 e no Haiku 5.5, lado a lado.
// Usa o MESMO prompt (prompts/redacao_ze.md) e o MESMO corpo de chamada do n8n (_comum.js).
// Só usa FATOS de teste (remédios da lista oficial). Nenhum dado de paciente.
//
// Como rodar (custa alguns centavos de dólar na sua conta da Anthropic):
//   PowerShell:  $env:ANTHROPIC_API_KEY = "sua-chave";  node scripts/comparar_redacao.mjs
// O resultado sai em tests/comparacao_redacao.md
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const CHAVE = process.env.ANTHROPIC_API_KEY;
if (!CHAVE) {
  console.error('Falta a chave. No PowerShell: $env:ANTHROPIC_API_KEY = "sua-chave"');
  process.exit(1);
}

// Carrega as funções do n8n (_comum.js) sem copiar código
const comum = vm.runInNewContext(
  ler('n8n/codigo/_comum.js') +
    '\n;({ corpoClaude, lerRespostaClaude, modeloResultado, normCmd, MODELO_CLAUDE, MODELO_REDACAO })',
  { Buffer, console },
);
const PROMPT = ler('prompts/redacao_ze.md').trim();

// Preço por 1 milhão de tokens (US$): entrada, saída
const PRECO = { 'claude-opus-5-5': [4, 20], 'claude-haiku-5-5': [0.1, 0.5] };
const MODELOS = ['claude-opus-5-5', comum.MODELO_REDACAO];

// Casos de teste: um de cada situação, mais combinações
const CASOS = [
  { nome: '1 remédio de graça', fatos: { itens: [
    { numero: 1, situacao: 'na_lista', remedio_na_lista: 'glibenclamida', concentracao_da_receita: '5 mg', concentracoes_na_lista: ['5mg'] },
  ], proximo_passo: 'pedir_cep' } },
  { nome: 'Nome de marca (Aerolin)', fatos: { itens: [
    { numero: 1, situacao: 'na_lista', remedio_na_lista: 'sulfato de salbutamol', marca: 'Aerolin', concentracao_da_receita: '100 mcg', concentracoes_na_lista: ['100mcg', '5mg'] },
  ], proximo_passo: 'pedir_cep' } },
  { nome: 'Sem concentração na receita', fatos: { itens: [
    { numero: 1, situacao: 'na_lista_sem_concentracao', remedio_na_lista: 'dipropionato de beclometasona', concentracoes_na_lista: ['50mcg', '200mcg', '250mcg'] },
  ], proximo_passo: 'pedir_cep' } },
  { nome: 'Concentração fora da lista', fatos: { itens: [
    { numero: 1, situacao: 'concentracao_fora_da_lista', remedio_na_lista: 'cloridrato de metformina', concentracao_da_receita: '1000 mg', concentracoes_na_lista: ['500mg', '500mg - ação prolongada', '850mg'] },
  ], proximo_passo: 'encerrar' } },
  { nome: 'Não encontrado', fatos: { itens: [
    { numero: 1, situacao: 'nao_encontrado' },
  ], proximo_passo: 'encerrar' } },
  { nome: 'Receita com 4 itens misturados', fatos: { itens: [
    { numero: 1, situacao: 'na_lista', remedio_na_lista: 'cloridrato de metformina', marca: 'Glifage', concentracao_da_receita: '850 mg', concentracoes_na_lista: ['500mg', '500mg - ação prolongada', '850mg'] },
    { numero: 2, situacao: 'nao_encontrado' },
    { numero: 3, situacao: 'na_lista', remedio_na_lista: 'insulina humana regular', concentracao_da_receita: '100 UI/ml', concentracoes_na_lista: ['100ui/ml'] },
    { numero: 4, situacao: 'concentracao_fora_da_lista', remedio_na_lista: 'glibenclamida', concentracao_da_receita: '10 mg', concentracoes_na_lista: ['5mg'] },
  ], data_receita: '2026-11-01', proximo_passo: 'pedir_cep' } },
];

// Conferências automáticas (as mesmas travas do "Conferir redação", mais algumas de formato)
function conferir(texto, fatos) {
  const prob = [];
  if (!texto) return ['sem texto (recusa ou erro): usaria o texto fixo'];
  if (texto.length > 1200) prob.push('passou de 1200 caracteres: usaria o texto fixo');
  if (/(SENHA|CARTAO|PIX|DADOS BANCARIOS|CANAL OFICIAL|SOU DO GOVERNO)/.test(comum.normCmd(texto))) prob.push('palavra proibida: usaria o texto fixo');
  const verdes = fatos.itens.filter((i) => i.situacao.startsWith('na_lista')).length;
  const vermelhos = fatos.itens.length - verdes;
  const nV = (texto.match(/✅/g) || []).length, nX = (texto.match(/❌/g) || []).length;
  if (nV !== verdes || nX !== vermelhos) prob.push(`✅/❌ não batem com os fatos (esperado ${verdes}✅ ${vermelhos}❌, veio ${nV}✅ ${nX}❌)`);
  if (/\*\*|^#/m.test(texto)) prob.push('usou ** ou # (formato errado para WhatsApp)');
  if (/\b(CEP|BAIRRO)\b/.test(comum.normCmd(texto))) prob.push('pediu CEP/lugar (isso é colocado depois)');
  if (/\b(DOSE|TOMAR|EFEITO|SERVE PARA|SUBSTITU|TROCAR)\b/.test(comum.normCmd(texto))) prob.push('pode ter falado de dose/uso/troca: conferir');
  return prob;
}

async function chamar(modelo, fatos) {
  const content = [{ type: 'text', text: 'FATOS: ' + JSON.stringify(fatos) }];
  const corpo = comum.corpoClaude(PROMPT, content, 2000, null, modelo);
  const t0 = Date.now();
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CHAVE,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
  const r = await resp.json();
  const ms = Date.now() - t0;
  const res = comum.lerRespostaClaude(r);
  const u = r.usage || {};
  const [pe, ps] = PRECO[modelo] || [0, 0];
  const custo = ((u.input_tokens || 0) * pe + (u.output_tokens || 0) * ps) / 1e6;
  let texto = res.ok ? res.texto.replace(/^["']+|["']+$/g, '').trim() : '';
  texto = texto.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n');
  return { texto, erro: res.ok ? null : (r.error?.message || res.erro), ms, custo, entrada: u.input_tokens, saida: u.output_tokens };
}

const linhas = ['# Comparação: escrever a resposta do Zé', '',
  `Gerado em ${new Date().toLocaleString('pt-BR')}. Só FATOS de teste.`, ''];
const total = Object.fromEntries(MODELOS.map((m) => [m, { custo: 0, problemas: 0, ms: 0 }]));

for (const caso of CASOS) {
  console.log('Caso:', caso.nome);
  linhas.push(`## ${caso.nome}`, '');
  for (const m of MODELOS) {
    const r = await chamar(m, caso.fatos);
    const prob = conferir(r.texto, caso.fatos);
    total[m].custo += r.custo; total[m].ms += r.ms; total[m].problemas += prob.length;
    linhas.push(`### ${m}  ·  US$ ${r.custo.toFixed(5)}  ·  ${(r.ms / 1000).toFixed(1)} s  ·  ${r.entrada ?? '?'} → ${r.saida ?? '?'} tokens`, '');
    if (r.erro) linhas.push(`**Erro:** ${r.erro}`, '');
    linhas.push('```', r.texto || '(vazio: o n8n usaria o texto fixo abaixo)', '```', '');
    linhas.push(prob.length ? prob.map((p) => '- ⚠️ ' + p).join('\n') : '- ✔️ passou nas conferências', '');
  }
  linhas.push('<details><summary>Texto fixo (sem IA), para comparar</summary>', '', '```', comum.modeloResultado(caso.fatos), '```', '</details>', '');
}

linhas.splice(4, 0, '## Resumo', '', '| Modelo | Custo total | Tempo médio | Avisos |', '|---|---|---|---|',
  ...MODELOS.map((m) => `| ${m} | US$ ${total[m].custo.toFixed(4)} | ${(total[m].ms / CASOS.length / 1000).toFixed(1)} s | ${total[m].problemas} |`), '');

writeFileSync(join(raiz, 'tests/comparacao_redacao.md'), linhas.join('\n'));
console.log('\nPronto: tests/comparacao_redacao.md');
for (const m of MODELOS) console.log(`${m}: US$ ${total[m].custo.toFixed(4)}, ${total[m].problemas} aviso(s)`);
