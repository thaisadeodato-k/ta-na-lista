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
create table if not exists public.farmacia (
  cnpj             text primary key,
  nome             text not null,
  endereco         text not null,
  municipio        text not null,
  lat              double precision,
  lon              double precision,
  ativo            boolean not null default true
);

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
--   chave, principio_ativo, tipo, concentracoes_oficiais[], como_encontrado, similaridade
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
    select tnl_normaliza(chave) as termo, chave, 1 as prio from elenco_pfp
    union all select tnl_normaliza(principio_ativo), chave, 1 from elenco_pfp
    union all select tnl_normaliza(termo), chave, 2 from sinonimo
    union all select tnl_normaliza(marca), chave, 3 from marca_principio
  )
  select t.chave, 'exato' into v_chave, v_como
  from termos t where t.termo = n
  order by t.prio limit 1;

  if v_chave is null then
    with termos as (
      select tnl_normaliza(chave) as termo, chave from elenco_pfp
      union all select tnl_normaliza(principio_ativo), chave from elenco_pfp
      union all select tnl_normaliza(termo), chave from sinonimo
      union all select tnl_normaliza(marca), chave from marca_principio
    )
    select t.chave, 'contem' into v_chave, v_como
    from termos t
    where string_to_array(t.termo, ' ') <@ string_to_array(n, ' ')
    order by cardinality(string_to_array(t.termo, ' ')) desc, length(t.termo) desc
    limit 1;
  end if;

  if v_chave is null then
    -- Aproximado: precisa ser bem parecido E começar com a mesma letra
    -- (evita confundir rosuvastatina com sinvastatina, por exemplo)
    with termos as (
      select tnl_normaliza(chave) as termo, chave from elenco_pfp
      union all select tnl_normaliza(principio_ativo), chave from elenco_pfp
      union all select tnl_normaliza(termo), chave from sinonimo
      union all select tnl_normaliza(marca), chave from marca_principio
    )
    select t.chave, 'aproximado', similarity(n, t.termo)
      into v_chave, v_como, v_sim
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
    'similaridade', v_sim
  );
end;
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
-- 5) FARMÁCIAS MAIS PRÓXIMAS (fórmula de Haversine, sem precisar de PostGIS)
-- =====================================================================
create or replace function public.farmacias_proximas(p_lat double precision, p_lon double precision, p_limite integer default 3)
returns table (cnpj text, nome text, endereco text, municipio text, distancia_km numeric)
language sql stable as $$
  select f.cnpj, f.nome, f.endereco, f.municipio,
         round((6371 * 2 * asin(sqrt(
           power(sin(radians(f.lat - p_lat) / 2), 2) +
           cos(radians(p_lat)) * cos(radians(f.lat)) *
           power(sin(radians(f.lon - p_lon) / 2), 2))))::numeric, 1) as distancia_km
  from public.farmacia f
  where f.ativo and f.lat is not null and f.lon is not null
  order by 5
  limit greatest(coalesce(p_limite, 3), 1)
$$;

-- Usada pelo n8n: tenta por coordenada; se o CEP não tiver coordenada, usa o município.
create or replace function public.tnl_farmacias_para_cep(p_lat double precision, p_lon double precision, p_municipio text, p_limite integer default 3)
returns jsonb language plpgsql stable
set search_path = public, extensions as $$
declare v jsonb;
begin
  if p_lat is not null and p_lon is not null then
    select coalesce(jsonb_agg(to_jsonb(fp) order by fp.distancia_km), '[]'::jsonb) into v
    from farmacias_proximas(p_lat, p_lon, p_limite) fp;
    return jsonb_build_object('modo', 'distancia', 'farmacias', v);
  elsif tnl_normaliza(p_municipio) is not null then
    select coalesce(jsonb_agg(jsonb_build_object('cnpj', f.cnpj, 'nome', f.nome, 'endereco', f.endereco,
                                                 'municipio', f.municipio, 'distancia_km', null)), '[]'::jsonb) into v
    from (select * from farmacia
          where ativo and tnl_normaliza(municipio) = tnl_normaliza(p_municipio)
          order by nome limit greatest(coalesce(p_limite, 3), 1)) f;
    return jsonb_build_object('modo', 'municipio', 'farmacias', v);
  end if;
  return jsonb_build_object('modo', 'sem_localizacao', 'farmacias', '[]'::jsonb);
end;
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
