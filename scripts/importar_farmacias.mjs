// Importa a lista oficial de farmácias do Programa Farmácia Popular (Ministério da Saúde).
//
// 1. Baixe a planilha em:
//    https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/publicacoes/farmacias-participante-do-programa-farmacia-popular/view
// 2. Rode:  node scripts/importar_farmacias.mjs "caminho/da/planilha.xlsx"
// 3. No Supabase (SQL Editor), rode em ordem os arquivos db/farmacias_pfpb_1.sql, _2.sql, ...
//
// Gera:
//   data/farmacias_pfpb.csv      -> cópia da lista oficial (CNPJ, nome, endereço, bairro, município, UF)
//   db/farmacias_pfpb_N.sql      -> carga em partes (o editor do Supabase não aceita um arquivo gigante)
// Não instala nada: lê o .xlsx (que é um .zip) com o próprio Node.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = process.argv[2];
if (!arquivo) { console.error('Uso: node scripts/importar_farmacias.mjs planilha.xlsx'); process.exit(1); }
const POR_PARTE = 7000;

// ---------- ler o .zip ----------
function lerZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Arquivo não parece ser .xlsx');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const arquivos = {};
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nLen);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamComp);
    arquivos[nome] = () => (metodo === 8 ? inflateRawSync(dados) : dados).toString('utf8');
    p += 46 + nLen + xLen + cLen;
  }
  return arquivos;
}

// ---------- ler a planilha ----------
const zip = lerZip(readFileSync(arquivo));
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const textos = [...zip['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
const coluna = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const linhas = [];
for (const r of zip['xl/worksheets/sheet1.xml']().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const l = [];
  for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = (c[2].match(/t="(\w+)"/) || [])[1];
    const v = ((c[3] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const is = ((c[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
    l[coluna(c[1])] = (t === 's' ? textos[+v] : t === 'inlineStr' ? dec(is || '') : dec(v || '')).trim();
  }
  linhas.push(l);
}

// Cabeçalho esperado: CNPJ | Razão Social | Endereço | Bairro | Município | UF
const iCab = linhas.findIndex((l) => (l[0] || '').toUpperCase() === 'CNPJ');
if (iCab < 0) throw new Error('Não achei a linha de cabeçalho com "CNPJ"');
const cab = linhas[iCab].map((x) => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase());
const pos = (nome) => { const i = cab.findIndex((x) => x.startsWith(nome)); if (i < 0) throw new Error('Coluna não encontrada: ' + nome); return i; };
const C = { cnpj: pos('CNPJ'), nome: pos('RAZAO'), endereco: pos('ENDERECO'), bairro: pos('BAIRRO'), municipio: pos('MUNICIPIO'), uf: pos('UF') };

// Data da lista ("Data : 02/10/2026" nas primeiras linhas)
const txtData = linhas.slice(0, iCab).flat().find((x) => /\d{2}\/\d{2}\/\d{4}/.test(x || '')) || '';
const [, dd, mm, aaaa] = txtData.match(/(\d{2})\/(\d{2})\/(\d{4})/) || [];
const dataLista = aaaa ? `${aaaa}-${mm}-${dd}` : new Date().toISOString().slice(0, 10);

const vistos = new Set();
const farmacias = [];
for (const l of linhas.slice(iCab + 1)) {
  const cnpj = l[C.cnpj] || '';
  if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(cnpj) || vistos.has(cnpj)) continue;
  vistos.add(cnpj);
  const limpa = (s) => (s || '').replace(/\s+/g, ' ').trim();
  farmacias.push({
    cnpj, nome: limpa(l[C.nome]), endereco: limpa(l[C.endereco]), bairro: limpa(l[C.bairro]),
    municipio: limpa(l[C.municipio]), uf: limpa(l[C.uf]).toUpperCase(),
  });
}
if (farmacias.length < 1000) throw new Error(`Só ${farmacias.length} farmácias: confira a planilha.`);

// ---------- CSV ----------
const csv = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
writeFileSync(join(raiz, 'data/farmacias_pfpb.csv'),
  'cnpj,nome,endereco,bairro,municipio,uf\n' +
  farmacias.map((f) => [f.cnpj, f.nome, f.endereco, f.bairro, f.municipio, f.uf].map(csv).join(',')).join('\n') + '\n');

// ---------- SQL em partes ----------
for (const a of readdirSync(join(raiz, 'db'))) if (/^farmacias_pfpb_\d+\.sql$/.test(a)) unlinkSync(join(raiz, 'db', a));
const q = (s) => (s ? "'" + s.replace(/'/g, "''") + "'" : 'null');
const partes = Math.ceil(farmacias.length / POR_PARTE);
for (let p = 0; p < partes; p++) {
  const bloco = farmacias.slice(p * POR_PARTE, (p + 1) * POR_PARTE);
  let sql = `-- Farmácias do PFPB (lista oficial de ${dataLista}) — parte ${p + 1} de ${partes}. Gerado por scripts/importar_farmacias.mjs\n`;
  if (p === 0) sql += `-- Remove as farmácias fictícias usadas no protótipo\ndelete from public.farmacia where cnpj like '00.000.000/%';\n`;
  sql += `insert into public.farmacia (cnpj, nome, endereco, bairro, municipio, uf, ativo, lista_de) values\n`;
  sql += bloco.map((f) => `(${q(f.cnpj)},${q(f.nome)},${q(f.endereco)},${q(f.bairro)},${q(f.municipio)},${q(f.uf)},true,'${dataLista}')`).join(',\n');
  sql += `\non conflict (cnpj) do update set nome = excluded.nome, endereco = excluded.endereco, bairro = excluded.bairro,\n` +
    `  municipio = excluded.municipio, uf = excluded.uf, ativo = true, lista_de = excluded.lista_de;\n`;
  if (p === partes - 1) {
    sql += `\n-- Quem saiu da lista oficial deixa de aparecer\nupdate public.farmacia set ativo = false where lista_de is distinct from '${dataLista}';\n` +
      `-- Preenche os campos padronizados usados na busca\nselect public.tnl_farmacias_normalizar() as normalizadas,\n` +
      `  (select count(*) from public.farmacia where ativo) as ativas;\n`;
  }
  writeFileSync(join(raiz, `db/farmacias_pfpb_${p + 1}.sql`), sql);
}
console.log(`OK: ${farmacias.length} farmácias (lista de ${dataLista}) -> data/farmacias_pfpb.csv e ${partes} arquivos db/farmacias_pfpb_N.sql`);
