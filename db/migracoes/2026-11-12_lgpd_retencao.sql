-- Migração: retenção LGPD — quem não usa o Zé há 6 meses é apagado automaticamente.
-- O schema.sql já está atualizado.

alter table public.usuario add column if not exists visto_em timestamptz not null default now();

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

create or replace function public.tnl_limpar_expiradas()
returns jsonb language plpgsql
set search_path = public, extensions as $$
declare a int; b int; c int;
begin
  delete from conversa where atualizado_em < now() - interval '24 hours';
  get diagnostics a = row_count;
  delete from usuario where consentiu_em is null and criado_em < now() - interval '24 hours';
  get diagnostics b = row_count;
  -- LGPD: sem uso há 6 meses, apaga o código e o consentimento (a pessoa só precisa dizer SIM de novo)
  delete from usuario where visto_em < now() - interval '6 months';
  get diagnostics c = row_count;
  return jsonb_build_object('conversas_apagadas', a, 'usuarios_sem_consentimento_apagados', b,
                            'usuarios_inativos_apagados', c);
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
