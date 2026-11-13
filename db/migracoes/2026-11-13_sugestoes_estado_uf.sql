-- Migração: guardar o ESTADO (UF) de onde vem cada sugestão, para saber em que partes do Brasil
-- o Tá na Lista é usado. Só a sigla (ex.: PB). O número de telefone continua NÃO sendo guardado.
--   uf_fonte = 'local': estado do lugar que a pessoa informou (CEP ou cidade)
--   uf_fonte = 'ddd'  : estado do DDD do número (onde a linha foi registrada)
-- O schema.sql já está atualizado. Rode este arquivo inteiro no SQL Editor do Supabase.

alter table public.sugestao add column if not exists uf text;
alter table public.sugestao add column if not exists uf_fonte text;
alter table public.sugestao drop constraint if exists sugestao_uf_check;
alter table public.sugestao add constraint sugestao_uf_check check (uf ~ '^[A-Z]{2}$');
alter table public.sugestao drop constraint if exists sugestao_uf_fonte_check;
alter table public.sugestao add constraint sugestao_uf_fonte_check check (uf_fonte in ('local', 'ddd'));

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
    -- Sugestão: vai para a tabela própria, sem nenhuma ligação com a pessoa
    if p_acao = 'sugestao' and coalesce(btrim(p_detalhe->>'texto'), '') <> '' then
      insert into sugestao (perfil, texto, via, uf, uf_fonte)
      values (coalesce(p_detalhe->>'perfil', 'nao_informado'), left(btrim(p_detalhe->>'texto'), 1000),
              coalesce(p_detalhe->>'via', 'texto'),
              case when p_detalhe->>'uf' ~ '^[A-Z]{2}$' then p_detalhe->>'uf' end,
              case when p_detalhe->>'uf' ~ '^[A-Z]{2}$' and p_detalhe->>'uf_fonte' in ('local', 'ddd')
                   then p_detalhe->>'uf_fonte' end);
      p_detalhe := p_detalhe - 'texto'; -- a métrica guarda só o perfil, nunca o texto
    end if;
    update usuario set visto_em = now() where usuario_hash = p_hash;
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

revoke execute on all functions in schema public from public, anon, authenticated;

-- Conferência: as duas colunas devem dar true
select exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'sugestao' and column_name = 'uf') as coluna_uf_ok,
       exists (select 1 from pg_proc where proname = 'tnl_salvar_conversa' and prosrc like '%uf_fonte%') as funcao_ok;
