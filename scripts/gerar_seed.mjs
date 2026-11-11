// Gera db/seed.sql a partir dos CSVs em data/.
// Uso (na pasta do projeto):  node scripts/gerar_seed.mjs
// Rode de novo sempre que editar um CSV, e cole o novo seed.sql no Supabase.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Leitor de CSV simples (aceita campos entre aspas com vírgula dentro)
function lerCsv(nome) {
  const texto = readFileSync(join(raiz, 'data', nome), 'utf8').replace(/^﻿/, '');
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(v => v.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some(v => v.trim() !== '')) linhas.push(linha); }
  const [cab, ...dados] = linhas;
  return dados.map(l => Object.fromEntries(cab.map((k, i) => [k.trim(), (l[i] ?? '').trim()])));
}

const q = v => (v === '' || v == null) ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v === '' || v == null || isNaN(Number(v))) ? 'null' : String(Number(v));

const elenco = lerCsv('elenco_pfp.csv');
const marcas = lerCsv('marca_principio.csv');
const sinonimos = lerCsv('sinonimo.csv');
const farmacias = lerCsv('farmacias_exemplo.csv');

// Conferências básicas
const chaves = new Set(elenco.map(e => e.chave));
const erros = [];
for (const m of marcas) if (!chaves.has(m.chave)) erros.push(`marca "${m.marca}" aponta para chave inexistente "${m.chave}"`);
for (const s of sinonimos) if (!chaves.has(s.chave)) erros.push(`sinônimo "${s.termo}" aponta para chave inexistente "${s.chave}"`);
if (erros.length) { console.error('ERROS:\n' + erros.join('\n')); process.exit(1); }

let sql = `-- GERADO AUTOMATICAMENTE por scripts/gerar_seed.mjs a partir de data/*.csv
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run (depois do schema.sql).
-- Pode rodar de novo: atualiza os dados sem duplicar.
begin;

-- Lista oficial (${elenco.length} itens)
insert into public.elenco_pfp (id, chave, principio_ativo, concentracao, forma, indicacao, tipo) values
${elenco.map(e => `  (${num(e.id)}, ${q(e.chave)}, ${q(e.principio_ativo)}, ${q(e.concentracao)}, ${q(e.forma)}, ${q(e.indicacao)}, ${q(e.tipo || 'medicamento')})`).join(',\n')}
on conflict (id) do update set chave = excluded.chave, principio_ativo = excluded.principio_ativo,
  concentracao = excluded.concentracao, forma = excluded.forma, indicacao = excluded.indicacao, tipo = excluded.tipo;
delete from public.elenco_pfp where id not in (${elenco.map(e => num(e.id)).join(', ')});

-- Marcas comerciais (${marcas.length})
delete from public.marca_principio;
insert into public.marca_principio (marca, chave, status_revisao) values
${marcas.map(m => `  (${q(m.marca)}, ${q(m.chave)}, ${q(m.status_revisao || 'a revisar por farmacêutico')})`).join(',\n')};

-- Sinônimos / grafias comuns (${sinonimos.length})
delete from public.sinonimo;
insert into public.sinonimo (termo, chave) values
${sinonimos.map(s => `  (${q(s.termo)}, ${q(s.chave)})`).join(',\n')};

-- Farmácias (${farmacias.length})
delete from public.farmacia;
insert into public.farmacia (cnpj, nome, endereco, municipio, lat, lon) values
${farmacias.map(f => `  (${q(f.cnpj)}, ${q(f.nome)}, ${q(f.endereco)}, ${q(f.municipio)}, ${num(f.lat)}, ${num(f.lon)})`).join(',\n')};

commit;

-- Conferência: deve mostrar 41
select count(*) as itens_na_lista_oficial from public.elenco_pfp;
`;

writeFileSync(join(raiz, 'db', 'seed.sql'), sql, 'utf8');
console.log(`OK: db/seed.sql gerado (${elenco.length} itens, ${marcas.length} marcas, ${sinonimos.length} sinônimos, ${farmacias.length} farmácias).`);
