-- Migração: canal de sugestões (participação popular).
-- As sugestões ficam guardadas SEM prazo de expiração, mas são ANÔNIMAS:
--   - sem número de telefone e sem o código (hash) da pessoa: ninguém sabe quem mandou;
--   - CPF, telefone e e-mail digitados no texto são trocados por [removido] antes de salvar (no n8n);
--   - a data é só o dia (sem hora).
-- O schema.sql já está atualizado. Rode este arquivo no SQL Editor do Supabase.

create table if not exists public.sugestao (
  id         bigserial primary key,
  criada_em  date not null default current_date,
  perfil     text not null default 'nao_informado'
             check (perfil in ('paciente', 'familia', 'farmacia', 'saude', 'nao_informado')),
  texto      text not null check (length(texto) between 1 and 1000),
  via        text not null default 'texto' check (via in ('texto', 'audio')),
  -- Para o backlog (você preenche no Supabase):
  status     text not null default 'recebida'
             check (status in ('recebida', 'em_analise', 'planejada', 'feita', 'nao_vamos_fazer')),
  tema       text,          -- ex.: 'lista', 'farmácias', 'leitura da receita', 'acessibilidade'
  nota       text,          -- sua anotação
  feita_em   date           -- quando a melhoria entrou no ar
);
alter table public.sugestao enable row level security; -- a API pública do Supabase não lê nem grava

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
      insert into sugestao (perfil, texto, via)
      values (coalesce(p_detalhe->>'perfil', 'nao_informado'), left(btrim(p_detalhe->>'texto'), 1000),
              coalesce(p_detalhe->>'via', 'texto'));
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
