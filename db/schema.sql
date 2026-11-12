-- =====================================================================
--  TÁ NA LISTA — schema do banco (Supabase / Postgres)
--  Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
--  Pode rodar de novo sem problema (o script é "idempotente").
--  Depois rode o arquivo db/seed.sql para carregar os dados.
-- =====================================================================

-- Extensões (já vêm disponíveis no Supabase)
create extension if not exists unaccent with schema extensions;  -- tira acentos
create extension if not exists pg_trgm  with schema extensions;  -- busca aproximada (erros de digitação)
create extension if not exists pgcrypto with schema extensions;  -- hash HMAC e números aleatórios

-- =====================================================================
-- 1) TABELAS DE REFERÊNCIA (dados públicos)
-- =====================================================================

-- Lista oficial do Farmácia Popular (41 itens, todos gratuitos)
create table if not exists public.elenco_pfp (
  id               integer primary key,
  chave            text not null,      -- nome curto usado na busca (ex.: 'losartana')
  principio_ativo  text not null,      -- como está no PDF oficial
  concentracao     text not null,      -- como está no PDF oficial ('-' para insumos)
  forma            text,               -- NÃO está no PDF: conferir com farmacêutico
  indicacao        text not null,
  tipo             text not null default 'medicamento' check (tipo in ('medicamento','insumo')),
  gratuito         boolean not null default true
);
create index if not exists elenco_pfp_chave_idx on public.elenco_pfp (chave);

-- Nomes comerciais -> chave do princípio ativo
create table if not exists public.marca_principio (
  marca            text primary key,
  chave            text not null,
  status_revisao   text not null default 'a revisar por farmacêutico'
);

-- Grafias comuns em receitas -> chave
create table if not exists public.sinonimo (
  termo            text primary key,
  chave            text not null
);

-- Farmácias credenciadas
-- Farmácias do Programa (lista oficial "Farmácias participantes do PFPB", Ministério da Saúde).
-- Carregada por scripts/importar_farmacias.mjs. lat/lon ficam vazios (a lista oficial não traz).
create table if not exists public.farmacia (
  cnpj             text primary key,
  nome             text not null,
  endereco         text not null,
  municipio        text not null,
  lat              double precision,
  lon              double precision,
  ativo            boolean not null default true
);
alter table public.farmacia add column if not exists bairro text;
alter table public.farmacia add column if not exists uf text;
alter table public.farmacia add column if not exists municipio_norm text;
alter table public.farmacia add column if not exists bairro_norm text;
alter table public.farmacia add column if not exists lista_de date;  -- data da lista oficial de onde veio
create index if not exists farmacia_cidade_idx on public.farmacia (municipio_norm, uf) where ativo;

-- =====================================================================
-- 2) TABELAS DE USO (dados pessoais mínimos — LGPD)
--    Nunca guardamos: foto, nome do paciente, nome do médico, CPF, texto livre.
-- =====================================================================

-- Configuração interna (guarda a chave secreta do hash)
create table if not exists public.app_config (
  chave  text primary key,
  valor  text not null
);
-- Gera a chave secreta UMA vez (se rodar de novo, mantém a existente)
insert into public.app_config (chave, valor)
values ('pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (chave) do nothing;

-- Usuário: só o hash do telefone/ID e a data do consentimento
create table if not exists public.usuario (
  usuario_hash   text primary key,
  consentiu_em   timestamptz,
  criado_em      timestamptz not null default now()
);

-- Conversa: estado atual + contexto mínimo (referências à lista oficial). Expira em 24 h.
create table if not exists public.conversa (
  usuario_hash   text primary key references public.usuario(usuario_hash) on delete cascade,
  estado         text not null default 'novo'
                 check (estado in ('novo','aguardando_receita','aguardando_confirmacao','aguardando_cep','concluido')),
  contexto       jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

-- Lembretes (para uma fase futura: "hora de buscar o remédio")
create table if not exists public.lembrete (
  id             bigserial primary key,
  usuario_hash   text not null references public.usuario(usuario_hash) on delete cascade,
  elenco_id      integer references public.elenco_pfp(id),
  proxima_data   date not null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

-- Métricas ANÔNIMAS (não ligam a nenhuma pessoa; hora arredondada)
create table if not exists public.metrica (
  id         bigserial primary key,
  evento     text not null,
  detalhe    jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default date_trunc('hour', now())
);

-- Segurança: liga RLS em todas as tabelas SEM políticas.
-- Resultado: a API pública do Supabase (chave "anon") não lê nem grava nada.
-- O n8n conecta direto no Postgres com o usuário do banco, que não é afetado.
alter table public.elenco_pfp      enable row level security;
alter table public.marca_principio enable row level security;
alter table public.sinonimo        enable row level security;
alter table public.farmacia        enable row level security;
alter table public.app_config      enable row level security;
alter table public.usuario         enable row level security;
alter table public.conversa        enable row level security;
alter table public.lembrete        enable row level security;
alter table public.metrica         enable row level security;

-- =====================================================================
-- 3) FUNÇÕES AUXILIARES DE TEXTO
-- =====================================================================

-- Minúsculas, sem acento, só letras/números/espaço
create or replace function public.tnl_normaliza(t text)
returns text language sql stable
set search_path = public, extensions as $$
  select nullif(trim(regexp_replace(
           regexp_replace(lower(extensions.unaccent(coalesce(t, ''))), '[^a-z0-9 ]', ' ', 'g'),
           '\s+', ' ', 'g')), '')
$$;

-- Extrai os números de uma concentração ("0,03mg + 0,15mg" -> {0.03,0.15}).
-- Percentual vira mg/ml (0,5% = 5 mg/ml), comum em colírios.
create or replace function public.tnl_numeros_conc(t text)
returns numeric[] language sql immutable as $$
  select coalesce(array_agg(distinct
           case when position('%' in coalesce(t, '')) > 0
                then replace(m[1], ',', '.')::numeric * 10
                else replace(m[1], ',', '.')::numeric end), '{}')
  from regexp_matches(coalesce(t, ''), '(\d+(?:[.,]\d+)?)', 'g') as m
$$;

-- Converte texto em número (ou NULL se não for número). Usado com parâmetros do n8n.
create or replace function public.tnl_num(t text)
returns double precision language sql immutable as $$
  select case when trim(coalesce(t, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then trim(t)::double precision end
$$;

-- Hash do identificador (telefone/sessão) com chave secreta: HMAC-SHA256
create or replace function public.tnl_hash(p_id text)
returns text language sql stable
set search_path = public, extensions as $$
  select encode(extensions.hmac(convert_to(p_id, 'UTF8'),
                                convert_to((select valor from public.app_config where chave = 'pepper'), 'UTF8'),
                                'sha256'), 'hex')
$$;

-- =====================================================================
-- 4) REGRA DE OURO: quem decide se está na lista é ESTA função, não a IA.
-- =====================================================================
-- Entrada: nome como escrito na receita + concentração lida (pode ser vazia).
-- Saída (jsonb):
--   status: 'na_lista' | 'na_lista_sem_concentracao' | 'concentracao_fora_da_lista' | 'nao_encontrado'
--   chave, principio_ativo, tipo, concentracoes_oficiais[], como_encontrado, similaridade,
--   marca_reconhecida (nome de marca da tabela marca_principio, quando o nome escrito era uma marca)
create or replace function public.verificar_medicamento(p_nome text, p_concentracao text)
returns jsonb language plpgsql stable
set search_path = public, extensions as $$
declare
  n          text;
  v_chave    text;
  v_como     text;
  v_sim      real;
  v_nums     numeric[];
  v_tipo     text;
  v_princ    text;
  v_concs    jsonb;
  v_status   text;
  v_marca    text;
begin
  -- 1. Limpa o nome: tira números/unidades e palavras que não são nome de remédio
  n := regexp_replace(coalesce(p_nome, ''), '\d+([.,]\d+)?\s*(mg|mcg|g|ml|ui|%)?', ' ', 'gi');
  n := tnl_normaliza(n);
  n := tnl_normaliza(regexp_replace(coalesce(n, ''),
         '\m(comprimidos?|comp|cp|cpr|caps|capsulas?|gotas|xarope|frasco|caixa|ampolas?|uso|oral|continuo|generico|mg|mcg|ml|ui|dose)\M',
         ' ', 'g'));

  if n is null then
    return jsonb_build_object('status', 'nao_encontrado', 'como_encontrado', 'vazio');
  end if;

  -- 2. Busca a chave em 3 níveis: exato > contém todas as palavras > aproximado
  with termos as (
    select tnl_normaliza(chave) as termo, chave, 1 as prio, null::text as marca from elenco_pfp
    union all select tnl_normaliza(principio_ativo), chave, 1, null from elenco_pfp
    union all select tnl_normaliza(termo), chave, 2, null from sinonimo
    union all select tnl_normaliza(marca), chave, 3, marca from marca_principio
  )
  select t.chave, 'exato', t.marca into v_chave, v_como, v_marca
  from termos t where t.termo = n
  order by t.prio limit 1;

  if v_chave is null then
    with termos as (
      select tnl_normaliza(chave) as termo, chave, null::text as marca from elenco_pfp
      union all select tnl_normaliza(principio_ativo), chave, null from elenco_pfp
      union all select tnl_normaliza(termo), chave, null from sinonimo
      union all select tnl_normaliza(marca), chave, marca from marca_principio
    )
    select t.chave, 'contem', t.marca into v_chave, v_como, v_marca
    from termos t
    where string_to_array(t.termo, ' ') <@ string_to_array(n, ' ')
    order by cardinality(string_to_array(t.termo, ' ')) desc, length(t.termo) desc
    limit 1;
  end if;

  if v_chave is null then
    -- Aproximado: precisa ser bem parecido E começar com a mesma letra
    -- (evita confundir rosuvastatina com sinvastatina, por exemplo)
    with termos as (
      select tnl_normaliza(chave) as termo, chave, null::text as marca from elenco_pfp
      union all select tnl_normaliza(principio_ativo), chave, null from elenco_pfp
      union all select tnl_normaliza(termo), chave, null from sinonimo
      union all select tnl_normaliza(marca), chave, marca from marca_principio
    )
    select t.chave, 'aproximado', similarity(n, t.termo), t.marca
      into v_chave, v_como, v_sim, v_marca
    from termos t
    where left(t.termo, 1) = left(n, 1)
      and similarity(n, t.termo) >= 0.5
    order by similarity(n, t.termo) desc
    limit 1;
  end if;

  if v_chave is null then
    return jsonb_build_object('status', 'nao_encontrado', 'como_encontrado', 'nenhum');
  end if;

  -- 3. Dados oficiais da chave encontrada
  select (array_agg(principio_ativo order by id))[1],
         (array_agg(tipo order by id))[1],
         coalesce(jsonb_agg(distinct concentracao) filter (where concentracao <> '-'), '[]'::jsonb)
    into v_princ, v_tipo, v_concs
  from elenco_pfp where chave = v_chave;

  -- 4. Confere a concentração
  -- (se a concentração veio vazia, usa números escritos junto do nome: "Metformina 850")
  v_nums := tnl_numeros_conc(coalesce(nullif(trim(coalesce(p_concentracao, '')), ''), p_nome));
  if v_tipo = 'insumo' then
    v_status := 'na_lista';
  elsif cardinality(v_nums) = 0 then
    v_status := 'na_lista_sem_concentracao';
  elsif exists (
    select 1 from elenco_pfp e
    where e.chave = v_chave
      and cardinality(tnl_numeros_conc(e.concentracao)) > 0
      and tnl_numeros_conc(e.concentracao) <@ v_nums
  ) then
    v_status := 'na_lista';
  else
    v_status := 'concentracao_fora_da_lista';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'gratuito', v_status in ('na_lista', 'na_lista_sem_concentracao'),
    'chave', v_chave,
    'principio_ativo', v_princ,
    'tipo', v_tipo,
    'concentracoes_oficiais', v_concs,
    'como_encontrado', v_como,
    'similaridade', v_sim,
    'marca_reconhecida', v_marca
  );
end;
$$;

-- Lista oficial agrupada por indicação, para responder "quais remédios são de graça?".
-- p_filtro: '-' (tudo) ou um pedaço do nome da indicação, ex.: 'DIABETES', 'HIPERTENSAO'.
create or replace function public.tnl_listar_elenco(p_filtro text)
returns jsonb language sql stable
set search_path = public, extensions as $$
  with base as (
    select indicacao, principio_ativo, tipo, min(id) as ordem,
           coalesce(jsonb_agg(concentracao order by id) filter (where concentracao <> '-'), '[]'::jsonb) as concentracoes
    from elenco_pfp
    where coalesce(p_filtro, '-') = '-'
       or tnl_normaliza(indicacao) like '%' || tnl_normaliza(p_filtro) || '%'
    group by indicacao, principio_ativo, tipo
  )
  select coalesce(jsonb_agg(g order by g->>'indicacao'), '[]'::jsonb)
  from (
    select jsonb_build_object('indicacao', indicacao,
             'itens', jsonb_agg(jsonb_build_object('nome', principio_ativo, 'tipo', tipo, 'concentracoes', concentracoes) order by ordem)) as g
    from base group by indicacao
  ) x
$$;

-- Versão para uma lista inteira: [{ordem, nome_escrito, concentracao}, ...]
create or replace function public.verificar_medicamentos(p_lista jsonb)
returns jsonb language sql stable
set search_path = public, extensions as $$
  select coalesce(jsonb_agg(
           verificar_medicamento(x.e->>'nome_escrito', x.e->>'concentracao')
           || jsonb_build_object('ordem', coalesce((x.e->>'ordem')::int, x.i::int))
           order by x.i), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) with ordinality as x(e, i)
$$;

-- =====================================================================
-- 5) FARMÁCIAS DO PROGRAMA (lista oficial do Ministério da Saúde)
--    A lista oficial traz endereço, bairro, município e UF, mas não traz
--    coordenadas. Por isso a busca é: distância (se um dia houver coordenadas)
--    > mesmo bairro > mesma cidade.
-- =====================================================================

-- Bairro "padronizado": sem acento e com abreviações comuns por extenso (JD -> jardim...)
create or replace function public.tnl_bairro_norm(t text)
returns text language sql stable
set search_path = public, extensions as $$
  select nullif(trim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      ' ' || coalesce(tnl_normaliza(t), '') || ' ',
      '\m(jd|jdm)\M', 'jardim', 'g'),
      '\m(vl)\M', 'vila', 'g'),
      '\m(pq|pqe|prq)\M', 'parque', 'g'),
      '\m(cj|conj|cjto)\M', 'conjunto', 'g'),
      '\m(res|resid)\M', 'residencial', 'g'),
      '\m(hab)\M', 'habitacional', 'g'),
      '\m(sta)\M', 'santa', 'g'),
      '\m(sto)\M', 'santo', 'g'),
      '\m(n sra|nsa sra|ns sra|nossa sra)\M', 'nossa senhora', 'g'),
      '\m(chac)\M', 'chacara', 'g'),
    '\s+', ' ', 'g')), '')
$$;

-- Parecença entre o bairro da farmácia (oficial) e o bairro da pessoa.
-- Aceita o bairro da pessoa "dentro" do oficial: "jardim angela" ~ "jardim angela zona leste".
create or replace function public.tnl_sim_bairro(p_oficial text, p_pessoa text)
returns real language sql stable
set search_path = public, extensions as $$
  select case when p_oficial is null or p_pessoa is null then 0::real
              else greatest(similarity(p_oficial, p_pessoa), (word_similarity(p_pessoa, p_oficial) * 0.95)::real) end
$$;

drop function if exists public.farmacias_proximas(double precision, double precision, integer);
create or replace function public.farmacias_proximas(p_lat double precision, p_lon double precision, p_limite integer default 3)
returns table (cnpj text, nome text, endereco text, bairro text, municipio text, uf text, distancia_km numeric)
language sql stable as $$
  select f.cnpj, f.nome, f.endereco, f.bairro, f.municipio, f.uf,
         round((6371 * 2 * asin(sqrt(
           power(sin(radians(f.lat - p_lat) / 2), 2) +
           cos(radians(p_lat)) * cos(radians(f.lat)) *
           power(sin(radians(f.lon - p_lon) / 2), 2))))::numeric, 1) as distancia_km
  from public.farmacia f
  where f.ativo and f.lat is not null and f.lon is not null
  order by 7
  limit greatest(coalesce(p_limite, 3), 1)
$$;

-- Usada pelo n8n. Devolve {modo, farmacias[], total_na_cidade}.
--   modo 'distancia' : há farmácias com coordenadas a até 30 km
--   modo 'bairro'    : farmácias no mesmo bairro (ou com nome de bairro bem parecido)
--   modo 'municipio' : nenhuma no bairro; mostra farmácias da mesma cidade
create or replace function public.tnl_farmacias_para_cep(
  p_lat double precision, p_lon double precision, p_municipio text, p_uf text, p_bairro text, p_limite integer default 3)
returns jsonb language plpgsql stable
set search_path = public, extensions as $$
declare
  v      jsonb;
  v_mun  text := tnl_normaliza(p_municipio);
  v_uf   text := upper(nullif(trim(coalesce(p_uf, '')), ''));
  v_bai  text := tnl_bairro_norm(p_bairro);
  v_lim  int  := greatest(coalesce(p_limite, 3), 1);
  v_tot  int;
begin
  -- 1) Distância, só se existirem farmácias com coordenadas por perto
  if p_lat is not null and p_lon is not null then
    select coalesce(jsonb_agg(to_jsonb(fp) order by fp.distancia_km), '[]'::jsonb) into v
    from farmacias_proximas(p_lat, p_lon, v_lim) fp
    where fp.distancia_km <= 30;
    if jsonb_array_length(v) > 0 then
      return jsonb_build_object('modo', 'distancia', 'farmacias', v);
    end if;
  end if;

  if v_mun is null then
    return jsonb_build_object('modo', 'sem_localizacao', 'farmacias', '[]'::jsonb);
  end if;

  select count(*) into v_tot from farmacia f
  where f.ativo and f.municipio_norm = v_mun and (v_uf is null or f.uf = v_uf);

  -- 2) Mesmo bairro (ou nome de bairro bem parecido)
  if v_bai is not null then
    select coalesce(jsonb_agg(x.j order by x.sim desc, x.nome), '[]'::jsonb) into v
    from (
      select jsonb_build_object('cnpj', f.cnpj, 'nome', f.nome, 'endereco', f.endereco, 'bairro', f.bairro,
                                'municipio', f.municipio, 'uf', f.uf, 'distancia_km', null) as j,
             tnl_sim_bairro(f.bairro_norm, v_bai) as sim, f.nome
      from farmacia f
      where f.ativo and f.municipio_norm = v_mun and (v_uf is null or f.uf = v_uf)
        and f.bairro_norm is not null and tnl_sim_bairro(f.bairro_norm, v_bai) >= 0.6
      order by 2 desc, f.nome
      limit v_lim
    ) x;
    if jsonb_array_length(v) > 0 then
      return jsonb_build_object('modo', 'bairro', 'farmacias', v, 'total_na_cidade', v_tot);
    end if;
  end if;

  -- 3) Mesma cidade (as de nome de bairro mais parecido primeiro)
  select coalesce(jsonb_agg(x.j order by x.sim desc, x.nome), '[]'::jsonb) into v
  from (
    select jsonb_build_object('cnpj', f.cnpj, 'nome', f.nome, 'endereco', f.endereco, 'bairro', f.bairro,
                              'municipio', f.municipio, 'uf', f.uf, 'distancia_km', null) as j,
           tnl_sim_bairro(f.bairro_norm, v_bai) as sim, f.nome
    from farmacia f
    where f.ativo and f.municipio_norm = v_mun and (v_uf is null or f.uf = v_uf)
    order by 2 desc, f.nome
    limit v_lim
  ) x;
  return jsonb_build_object('modo', 'municipio', 'farmacias', v, 'total_na_cidade', v_tot);
end;
$$;

-- Versão antiga (4 parâmetros), mantida para fluxos que ainda não mandam UF e bairro
create or replace function public.tnl_farmacias_para_cep(p_lat double precision, p_lon double precision, p_municipio text, p_limite integer default 3)
returns jsonb language sql stable
set search_path = public, extensions as $$
  select public.tnl_farmacias_para_cep(p_lat, p_lon, p_municipio, null::text, null::text, p_limite)
$$;

-- Recebe o texto da pessoa (digitado ou vindo de áudio) e devolve o mesmo formato de
-- tnl_farmacias_para_cep, mais: cidade, uf, bairro_pedido, outras_ufs (cidades com o mesmo nome).
-- modo 'cidade_nao_achada' quando não reconhece nenhuma cidade da lista.
create or replace function public.tnl_farmacias_para_texto(p_texto text, p_limite integer default 3)
returns jsonb language plpgsql stable
set search_path = public, extensions as $$
declare
  t        text := ' ' || coalesce(tnl_normaliza(left(p_texto, 200)), '') || ' ';
  v_mun    text;
  v_uf     text;
  v_resto  text;
  v_bairro text;
  v_outras jsonb;
  v_nome   text;
  r        jsonb;
  v_so_bairro boolean;
begin
  if trim(t) = '' then
    return jsonb_build_object('modo', 'cidade_nao_achada', 'farmacias', '[]'::jsonb);
  end if;

  -- 1) Cidade escrita por inteiro dentro do texto (a de nome mais longo ganha:
  --    "sao jose dos campos" antes de "sao jose"). Se aparecerem duas cidades e uma delas
  --    também é nome de estado ("Campinas São Paulo"), a com nome de estado é tratada como o estado.
  with est(sigla, nome) as (values
    ('AC','acre'),('AL','alagoas'),('AP','amapa'),('AM','amazonas'),('BA','bahia'),('CE','ceara'),
    ('DF','distrito federal'),('ES','espirito santo'),('GO','goias'),('MA','maranhao'),('MT','mato grosso'),
    ('MS','mato grosso do sul'),('MG','minas gerais'),('PA','para'),('PB','paraiba'),('PR','parana'),
    ('PE','pernambuco'),('PI','piaui'),('RJ','rio de janeiro'),('RN','rio grande do norte'),
    ('RS','rio grande do sul'),('RO','rondonia'),('RR','roraima'),('SC','santa catarina'),
    ('SP','sao paulo'),('SE','sergipe'),('TO','tocantins')),
  achadas as (
    select distinct municipio_norm as m, uf from farmacia
    where ativo and t like '% ' || municipio_norm || ' %'
  )
  select a.m into v_mun
  from achadas a
  -- nome de cidade logo depois de "vila", "jardim"... é bairro ("Vila Mariana" não é a cidade de Mariana),
  -- e "jardim", "vila"... sozinhos também não contam como cidade
  where not (t ~ ('(jardim|vila|parque|conjunto|residencial|jd|vl|alto|bairro|chacara|recanto|morada) ' || a.m || ' '))
    and a.m not in ('jardim', 'vila', 'parque', 'alto', 'recanto', 'morada', 'conjunto', 'bairro')
  order by
    -- nome de estado só vale como cidade se não houver outra cidade daquele estado ("Campinas São Paulo")
    (exists (select 1 from est e join achadas b on b.uf = e.sigla
             where e.nome = a.m and b.m <> a.m and position(b.m in a.m) = 0 and position(a.m in b.m) = 0)) asc,
    -- a pessoa escreveu a sigla ou o nome do estado desta cidade
    (not exists (select 1 from est e where e.sigla = a.uf
                 and (t like '% ' || lower(e.sigla) || ' %' or (t like '% ' || e.nome || ' %' and e.nome <> a.m)))) asc,
    length(a.m) desc
  limit 1;
  -- Só apareceu nome de bairro ("vila mariana em sp"): melhor pedir a cidade do que adivinhar
  v_so_bairro := v_mun is null and exists (select 1 from farmacia where ativo and t like '% ' || municipio_norm || ' %');

  if v_mun is not null then
    v_resto := ' ' || trim(regexp_replace(t, ' ' || v_mun || ' ', ' ', '')) || ' ';
  elsif not v_so_bairro then
    -- 2) Nome com erro de digitação/transcrição ("sao paolo", "campina")
    select c.m into v_mun
    from (select distinct municipio_norm as m from farmacia where ativo) c
    where greatest(similarity(c.m, trim(t)), word_similarity(c.m, t) * 0.9) >= 0.5
    order by greatest(similarity(c.m, trim(t)), word_similarity(c.m, t) * 0.9) desc, length(c.m) desc
    limit 1;
    v_resto := ' ';
  end if;

  if v_mun is null then
    return jsonb_build_object('modo', 'cidade_nao_achada', 'farmacias', '[]'::jsonb);
  end if;

  -- 3) Estado: só entre os estados que têm uma cidade com esse nome.
  --    Vale a sigla (ex.: "PB") ou o nome do estado escrito no resto do texto.
  with est(sigla, nome) as (values
    ('AC','acre'),('AL','alagoas'),('AP','amapa'),('AM','amazonas'),('BA','bahia'),('CE','ceara'),
    ('DF','distrito federal'),('ES','espirito santo'),('GO','goias'),('MA','maranhao'),('MT','mato grosso'),
    ('MS','mato grosso do sul'),('MG','minas gerais'),('PA','para'),('PB','paraiba'),('PR','parana'),
    ('PE','pernambuco'),('PI','piaui'),('RJ','rio de janeiro'),('RN','rio grande do norte'),
    ('RS','rio grande do sul'),('RO','rondonia'),('RR','roraima'),('SC','santa catarina'),
    ('SP','sao paulo'),('SE','sergipe'),('TO','tocantins')),
  cand as (
    select f.uf, count(*) as n from farmacia f
    where f.ativo and f.municipio_norm = v_mun group by f.uf
  )
  select c.uf into v_uf
  from cand c join est e on e.sigla = c.uf
  where v_resto like '% ' || lower(e.sigla) || ' %' or v_resto like '% ' || e.nome || ' %'
  order by length(e.nome) desc
  limit 1;

  if v_uf is null then  -- não disse o estado: fica com a cidade que tem mais farmácias
    select f.uf into v_uf from farmacia f
    where f.ativo and f.municipio_norm = v_mun
    group by f.uf order by count(*) desc limit 1;
  end if;

  select coalesce(jsonb_agg(distinct f.uf), '[]'::jsonb) into v_outras
  from farmacia f where f.ativo and f.municipio_norm = v_mun and f.uf <> v_uf;

  select max(f.municipio) into v_nome from farmacia f
  where f.ativo and f.municipio_norm = v_mun and f.uf = v_uf;

  -- 4) Bairro: o que sobrou do texto, sem o estado e sem palavras de ligação
  v_resto := regexp_replace(v_resto, ' ' || lower(v_uf) || ' ', ' ', 'g');
  v_resto := replace(v_resto, ' ' || coalesce((select e.nome from (values
    ('AC','acre'),('AL','alagoas'),('AP','amapa'),('AM','amazonas'),('BA','bahia'),('CE','ceara'),
    ('DF','distrito federal'),('ES','espirito santo'),('GO','goias'),('MA','maranhao'),('MT','mato grosso'),
    ('MS','mato grosso do sul'),('MG','minas gerais'),('PA','para'),('PB','paraiba'),('PR','parana'),
    ('PE','pernambuco'),('PI','piaui'),('RJ','rio de janeiro'),('RN','rio grande do norte'),
    ('RS','rio grande do sul'),('RO','rondonia'),('RR','roraima'),('SC','santa catarina'),
    ('SP','sao paulo'),('SE','sergipe'),('TO','tocantins')) e(sigla, nome) where e.sigla = v_uf), '#') || ' ', ' ');
  v_resto := regexp_replace(v_resto,
    '\m(eu|moro|mora|morando|fico|fica|estou|to|sou|em|no|na|nos|nas|perto|aqui|cidade|bairro|regiao|zona|cep|meu|minha|e|o|a|do|da|de|estado|municipio|nao|errado|errada|essa|esse|isso|outra|outro|lugar|verdade|certa|certo|correta|correto|ali|la|onde|sim|retirar|pegar|farmacia|farmacias)\M',
    ' ', 'g');
  v_bairro := nullif(trim(regexp_replace(v_resto, '\s+', ' ', 'g')), '');
  if v_bairro is not null and length(v_bairro) < 3 then v_bairro := null; end if;
  -- "centro" sozinho é bairro válido
  if v_bairro is null and t like '% centro %' then v_bairro := 'centro'; end if;

  r := tnl_farmacias_para_cep(null, null, v_mun, v_uf, v_bairro, p_limite);
  return r || jsonb_build_object('cidade', v_nome, 'uf', v_uf, 'bairro_pedido', v_bairro, 'outras_ufs', v_outras);
end;
$$;

-- Depois de carregar a lista oficial: preenche os campos padronizados usados na busca
create or replace function public.tnl_farmacias_normalizar()
returns integer language sql volatile
set search_path = public, extensions as $$
  with u as (
    update public.farmacia
       set municipio_norm = tnl_normaliza(municipio),
           bairro_norm = tnl_bairro_norm(bairro)
     returning 1
  )
  select count(*)::int from u
$$;

-- =====================================================================
-- 6) CONVERSA, CONSENTIMENTO, APAGAR, EXPIRAÇÃO (LGPD)
-- =====================================================================

-- Carrega (ou cria) a conversa. Recebe o ID bruto e devolve só o hash.
-- Se a conversa ficou parada mais de 24 h, recomeça do zero.
create or replace function public.tnl_carregar_conversa(p_id text)
returns jsonb language plpgsql
set search_path = public, extensions as $$
declare
  v_hash     text := tnl_hash(p_id);
  v_cons     timestamptz;
  c          conversa%rowtype;
  v_expirou  boolean := false;
begin
  insert into usuario (usuario_hash) values (v_hash) on conflict do nothing;
  select consentiu_em into v_cons from usuario where usuario_hash = v_hash;

  select * into c from conversa where usuario_hash = v_hash;
  if not found then
    insert into conversa (usuario_hash, estado)
    values (v_hash, case when v_cons is null then 'novo' else 'aguardando_receita' end)
    returning * into c;
  elsif c.atualizado_em < now() - interval '24 hours' then
    v_expirou := c.estado in ('aguardando_confirmacao', 'aguardando_cep');
    update conversa
       set estado = case when v_cons is null then 'novo' else 'aguardando_receita' end,
           contexto = '{}'::jsonb, atualizado_em = now()
     where usuario_hash = v_hash
    returning * into c;
  end if;

  return jsonb_build_object(
    'usuario_hash', v_hash,
    'estado', c.estado,
    'contexto', c.contexto,
    'consentiu', v_cons is not null,
    'expirou', v_expirou
  );
end;
$$;

-- Salva o novo estado. p_acao: 'salvar' | 'consentir' | 'apagar'
-- Também registra uma métrica anônima (se p_evento vier preenchido).
create or replace function public.tnl_salvar_conversa(
  p_hash text, p_acao text, p_estado text, p_contexto jsonb, p_evento text, p_detalhe jsonb)
returns jsonb language plpgsql
set search_path = public, extensions as $$
begin
  if p_acao = 'apagar' then
    delete from usuario where usuario_hash = p_hash;   -- apaga conversa e lembretes junto (cascade)
  else
    if p_acao = 'consentir' then
      update usuario set consentiu_em = now() where usuario_hash = p_hash;
    end if;
    insert into conversa (usuario_hash, estado, contexto, atualizado_em)
    values (p_hash, coalesce(p_estado, 'novo'), coalesce(p_contexto, '{}'::jsonb), now())
    on conflict (usuario_hash) do update
      set estado = excluded.estado, contexto = excluded.contexto, atualizado_em = now();
  end if;

  if coalesce(p_evento, '') <> '' then
    insert into metrica (evento, detalhe) values (p_evento, coalesce(p_detalhe, '{}'::jsonb));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Limpeza: apaga conversas paradas há mais de 24 h e usuários que nunca consentiram.
create or replace function public.tnl_limpar_expiradas()
returns jsonb language plpgsql
set search_path = public, extensions as $$
declare a int; b int;
begin
  delete from conversa where atualizado_em < now() - interval '24 hours';
  get diagnostics a = row_count;
  delete from usuario where consentiu_em is null and criado_em < now() - interval '24 hours';
  get diagnostics b = row_count;
  return jsonb_build_object('conversas_apagadas', a, 'usuarios_sem_consentimento_apagados', b);
end;
$$;

-- =====================================================================
-- 7) SEGURANÇA DAS FUNÇÕES
-- No Supabase, funções do schema "public" podem ser chamadas pela API pública.
-- Aqui tiramos essa permissão: só o n8n (usuário do banco) consegue usá-las.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- =====================================================================
-- 8) OPCIONAL (recomendado): limpeza automática a cada hora
-- Antes, ligue a extensão: Database > Extensions > pg_cron > Enable.
-- Depois, rode SÓ a linha abaixo (tire os dois traços do começo):
-- select cron.schedule('tnl-limpeza-24h', '15 * * * *', $$select public.tnl_limpar_expiradas()$$);
-- =====================================================================
