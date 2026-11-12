-- Migração: farmácias reais (lista oficial do Ministério da Saúde) com bairro e UF.
-- Rode no Supabase ANTES de carregar db/farmacias_pfpb_*.sql. O schema.sql já está atualizado.
alter table public.farmacia add column if not exists bairro text;
alter table public.farmacia add column if not exists uf text;
alter table public.farmacia add column if not exists municipio_norm text;
alter table public.farmacia add column if not exists bairro_norm text;
alter table public.farmacia add column if not exists lista_de date;  -- data da lista oficial de onde veio
create index if not exists farmacia_cidade_idx on public.farmacia (municipio_norm, uf) where ativo;

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
             similarity(f.bairro_norm, v_bai) as sim, f.nome
      from farmacia f
      where f.ativo and f.municipio_norm = v_mun and (v_uf is null or f.uf = v_uf)
        and f.bairro_norm is not null and similarity(f.bairro_norm, v_bai) >= 0.6
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
           coalesce(similarity(f.bairro_norm, v_bai), 0) as sim, f.nome
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

revoke execute on all functions in schema public from public, anon, authenticated;
