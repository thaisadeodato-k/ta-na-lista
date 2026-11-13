-- Consultas prontas para analisar as sugestões (cole no SQL Editor do Supabase).
-- Também dá pra ver e editar direto em: Table Editor > sugestao (e exportar em CSV).

-- 1) Backlog: tudo, das mais novas para as mais antigas
select id, criada_em, perfil, uf, texto, status, tema, nota, feita_em
from public.sugestao
order by criada_em desc, id desc;

-- 2) Só o que ainda falta analisar
select id, criada_em, perfil, texto
from public.sugestao
where status = 'recebida'
order by id;

-- 3) Quem está participando (por perfil)
select perfil, count(*) as sugestoes
from public.sugestao
group by perfil
order by sugestoes desc;

-- 3b) De onde vêm as sugestões (por estado)
--      uf_fonte 'local' = estado do lugar que a pessoa informou; 'ddd' = estado do DDD do número
select coalesce(uf, '(sem estado)') as uf, count(*) as sugestoes,
       count(*) filter (where uf_fonte = 'local') as pelo_lugar_informado,
       count(*) filter (where uf_fonte = 'ddd') as pelo_ddd
from public.sugestao
group by 1
order by sugestoes desc;

-- 4) Participação por mês
select date_trunc('month', criada_em)::date as mes, count(*) as sugestoes,
       count(*) filter (where status = 'feita') as viraram_melhoria
from public.sugestao
group by 1
order by 1;

-- 5) Por tema e status (depois que você preencher o "tema")
select coalesce(tema, '(sem tema)') as tema, status, count(*)
from public.sugestao
group by 1, 2
order by 1, 2;

-- 6) Melhorias que vieram de vocês (para mostrar no projeto / na candidatura)
select feita_em, tema, texto as sugestao, perfil, nota as o_que_fizemos
from public.sugestao
where status = 'feita'
order by feita_em desc;

-- Exemplo: marcar uma sugestão (troque o id)
-- update public.sugestao set status = 'feita', tema = 'acessibilidade',
--   nota = 'Letra maior nas mensagens', feita_em = current_date where id = 1;
