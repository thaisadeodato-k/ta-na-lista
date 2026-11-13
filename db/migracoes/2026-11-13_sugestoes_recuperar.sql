-- Recupera sugestões que foram parar na tabela "metrica" antes da tabela "sugestao" existir.
-- Rode DEPOIS de 2026-11-13_sugestoes.sql. Pode rodar mais de uma vez sem duplicar.
-- 1) copia o texto para a tabela de sugestões (sem número, como sempre)
-- 2) apaga o texto da métrica (a métrica fica só com o perfil, como deve ser)

insert into public.sugestao (criada_em, perfil, texto, via)
select m.criado_em::date,
       case when m.detalhe->>'perfil' in ('paciente', 'familia', 'farmacia', 'saude', 'nao_informado')
            then m.detalhe->>'perfil' else 'nao_informado' end,
       left(btrim(m.detalhe->>'texto'), 1000),
       case when m.detalhe->>'via' = 'audio' then 'audio' else 'texto' end
from public.metrica m
where m.evento = 'sugestao' and coalesce(btrim(m.detalhe->>'texto'), '') <> '';

update public.metrica
set detalhe = detalhe - 'texto'
where evento = 'sugestao' and detalhe ? 'texto';

-- Conferência: quantas sugestões existem agora
select count(*) as sugestoes from public.sugestao;
