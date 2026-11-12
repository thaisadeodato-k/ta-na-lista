-- Migração: buscar farmácias pelo NOME da cidade (e do bairro), além do CEP.
-- Ex.: "Campinas", "Vila Mariana, São Paulo", "moro em Santa Luzia PB", "sao paolo" (com erro).
-- O schema.sql já está atualizado.

-- Parecença entre o bairro da farmácia (oficial) e o bairro da pessoa.
-- Aceita o bairro da pessoa "dentro" do oficial: "jardim angela" ~ "jardim angela zona leste".
create or replace function public.tnl_sim_bairro(p_oficial text, p_pessoa text)
returns real language sql stable
set search_path = public, extensions as $$
  select case when p_oficial is null or p_pessoa is null then 0::real
              else greatest(similarity(p_oficial, p_pessoa), (word_similarity(p_pessoa, p_oficial) * 0.95)::real) end
$$;

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
begin
  if trim(t) = '' then
    return jsonb_build_object('modo', 'cidade_nao_achada', 'farmacias', '[]'::jsonb);
  end if;

  -- 1) Cidade escrita por inteiro dentro do texto (a de nome mais longo ganha:
  --    "sao jose dos campos" antes de "sao jose")
  select c.m into v_mun
  from (select distinct municipio_norm as m from farmacia where ativo) c
  where t like '% ' || c.m || ' %'
  order by length(c.m) desc
  limit 1;

  if v_mun is not null then
    v_resto := ' ' || trim(regexp_replace(t, ' ' || v_mun || ' ', ' ', '')) || ' ';
  else
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
  v_resto := regexp_replace(v_resto,
    '\m(eu|moro|mora|morando|fico|fica|estou|to|sou|em|no|na|nos|nas|perto|aqui|cidade|bairro|regiao|zona|cep|meu|minha|e|o|a|do|da|de|estado|municipio|centro da cidade)\M',
    ' ', 'g');
  v_bairro := nullif(trim(regexp_replace(v_resto, '\s+', ' ', 'g')), '');
  if v_bairro is not null and length(v_bairro) < 3 then v_bairro := null; end if;
  -- "centro" sozinho é bairro válido
  if v_bairro is null and t like '% centro %' then v_bairro := 'centro'; end if;

  r := tnl_farmacias_para_cep(null, null, v_mun, v_uf, v_bairro, p_limite);
  return r || jsonb_build_object('cidade', v_nome, 'uf', v_uf, 'bairro_pedido', v_bairro, 'outras_ufs', v_outras);
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
