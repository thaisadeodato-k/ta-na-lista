-- Migração de 12/11/2026: marca reconhecida + lista oficial agrupada.
-- Rode no Supabase (SQL Editor) em quem já tinha o schema anterior. O schema.sql já está atualizado.

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

revoke execute on all functions in schema public from public, anon, authenticated;
