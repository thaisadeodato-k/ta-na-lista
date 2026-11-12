// ATUALIZAR FARMÁCIAS — nó "Validar planilha".
// Recebe as linhas da planilha oficial "Farmácias participantes do PFPB" (Ministério da Saúde)
// e confere se ela está do jeito esperado ANTES de mexer no banco. Se algo estiver estranho
// (o Ministério mudou o link, o formato ou a lista veio pela metade), devolve ok=false e
// o fluxo só manda o e-mail de aviso: o banco continua com a lista anterior.
const MINIMO_FARMACIAS = 20000;   // a lista de 02/10/2026 tinha 27.538
const POR_LOTE = 3000;            // farmácias por gravação no banco

const linhas = $input.all().map((i) => i.json || {});
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const erro = (motivo) => [{ json: { ok: false, motivo, linhas_lidas: linhas.length } }];

if (!linhas.length) return erro('A planilha veio vazia (o link pode ter mudado ou o download falhou).');

// 1) Acha o cabeçalho (CNPJ | Razão Social | Endereço | Bairro | Município | UF).
//    Pode estar nos nomes das colunas ou numa das primeiras linhas (a planilha tem um título em cima).
function mapaDe(pares) {
  const m = {};
  for (const [chave, valor] of pares) {
    const n = norm(valor);
    if (n === 'CNPJ') m.cnpj = chave;
    else if (n.startsWith('RAZAO')) m.nome = chave;
    else if (n.startsWith('ENDERECO')) m.endereco = chave;
    else if (n.startsWith('BAIRRO')) m.bairro = chave;
    else if (n.startsWith('MUNICIPIO')) m.municipio = chave;
    else if (n === 'UF') m.uf = chave;
  }
  return m;
}
const completo = (m) => m.cnpj && m.nome && m.endereco && m.municipio && m.uf;

let mapa = mapaDe(Object.keys(linhas[0]).map((k) => [k, k]));
let inicio = 0;
if (!completo(mapa)) {
  mapa = null;
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const m = mapaDe(Object.entries(linhas[i]));
    if (completo(m)) { mapa = m; inicio = i + 1; break; }
  }
}
if (!mapa) return erro('Não achei as colunas esperadas (CNPJ, Razão Social, Endereço, Bairro, Município, UF). O Ministério pode ter mudado o formato da planilha.');

// 2) Data da lista ("Data : 02/10/2026"), procurada nas primeiras linhas e nos nomes das colunas
let dataLista = null;
const textosTopo = [...Object.keys(linhas[0]), ...linhas.slice(0, inicio || 5).flatMap((l) => Object.values(l))];
for (const t of textosTopo) {
  const m = String(t ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) { dataLista = `${m[3]}-${m[2]}-${m[1]}`; break; }
}
if (!dataLista) dataLista = new Date().toISOString().slice(0, 10);

// 3) Lê as farmácias
const limpa = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const vistos = new Set();
const farmacias = [];
let cnpjInvalido = 0;
for (const l of linhas.slice(inicio)) {
  const cnpj = limpa(l[mapa.cnpj]);
  if (!cnpj) continue;
  if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(cnpj)) { cnpjInvalido++; continue; }
  if (vistos.has(cnpj)) continue;
  vistos.add(cnpj);
  farmacias.push({
    cnpj, nome: limpa(l[mapa.nome]), endereco: limpa(l[mapa.endereco]),
    bairro: mapa.bairro ? limpa(l[mapa.bairro]) : '', municipio: limpa(l[mapa.municipio]), uf: limpa(l[mapa.uf]).toUpperCase(),
  });
}

// 4) Conferências de segurança
if (farmacias.length < MINIMO_FARMACIAS) {
  return erro(`A lista veio com só ${farmacias.length} farmácias (o mínimo esperado é ${MINIMO_FARMACIAS}). Pode estar incompleta: não atualizei o banco.`);
}
if (cnpjInvalido > farmacias.length * 0.05) {
  return erro(`${cnpjInvalido} linhas com CNPJ em formato estranho. O formato da planilha pode ter mudado: não atualizei o banco.`);
}
const semCidade = farmacias.filter((f) => !f.municipio || !/^[A-Z]{2}$/.test(f.uf)).length;
if (semCidade > farmacias.length * 0.02) {
  return erro(`${semCidade} farmácias sem cidade ou UF válida. O formato da planilha pode ter mudado: não atualizei o banco.`);
}

// 5) Divide em lotes para gravar (cada lote vai em base64, sem problema com vírgulas e aspas)
const lotes = [];
for (let i = 0; i < farmacias.length; i += POR_LOTE) {
  const lote = farmacias.slice(i, i + POR_LOTE);
  lotes.push({ json: {
    ok: true, lista_de: dataLista, total: farmacias.length, lote: lotes.length + 1,
    lote_b64: Buffer.from(JSON.stringify(lote), 'utf8').toString('base64'),
  } });
}
return lotes;
