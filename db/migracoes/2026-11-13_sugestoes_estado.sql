-- Correção: a conversa precisa aceitar o passo 'aguardando_sugestao' (canal de sugestões).
-- Sem isto, o banco recusa salvar o passo e a resposta seguinte (ex.: o perfil) é lida como remédio.
-- Apaga a regra antiga dos passos, seja qual for o nome dela, e cria a nova.
-- O schema.sql já está atualizado. Rode este arquivo no SQL Editor do Supabase.

do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.conversa'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table public.conversa drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.conversa add constraint conversa_estado_check
  check (estado in ('novo', 'aguardando_receita', 'aguardando_confirmacao',
                    'aguardando_cep', 'concluido', 'aguardando_sugestao'));
