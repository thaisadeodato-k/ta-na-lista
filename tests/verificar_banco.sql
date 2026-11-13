-- Testa a "regra de ouro" direto no banco (não gasta nada da API do Claude).
-- Supabase > SQL Editor > New query > cole > Run.
-- Compare a coluna "obtido" com "esperado": todas as linhas devem mostrar ok = true.
select caso, esperado, r->>'status' as obtido, r->>'chave' as chave, (r->>'status') = esperado as ok
from (values
  ('losartana 50mg',            'Losartana',          '50mg',      'na_lista'),
  ('Glifage XR 500',            'Glifage XR',         '500 mg',    'na_lista'),
  ('propanolol 40',             'propanolol',         '40',        'na_lista'),
  ('timolol 0,5%',              'colírio timolol',    '0,5%',      'na_lista'),
  ('insulina NPH',              'insulina NPH',       '100 UI/ml', 'na_lista'),
  ('fralda geriátrica',         'fralda geriátrica',  null,        'na_lista'),
  ('losartana 100mg',           'losartana',          '100mg',     'concentracao_fora_da_lista'),
  ('sinvastatina sem conc.',    'sinvastatina',       null,        'na_lista_sem_concentracao'),
  ('omeprazol',                 'omeprazol',          '20mg',      'nao_encontrado'),
  ('rosuvastatina',             'rosuvastatina',      '10mg',      'nao_encontrado'),
  ('dipirona',                  'dipirona',           '500mg',     'nao_encontrado'),
  ('sertralina',                'sertralina',         '50mg',      'nao_encontrado'),
  ('metformina 850 no nome',    'metformina 850',     null,        'na_lista'),
  ('Prolopa 100/25',            'Prolopa',            '100/25 mg', 'na_lista'),
  ('erro de digitação',         'Lozartanna',         '50mg',      'na_lista')
) as t(caso, nome, conc, esperado),
lateral (select public.verificar_medicamento(t.nome, t.conc) as r) v;

-- Farmácias mais próximas da Av. Paulista (devem vir 3, da mais perto para a mais longe)
select * from public.farmacias_proximas(-23.5614, -46.6559, 3);

-- Conferência do banco depois das mudanças de nov/2026 (sugestões, botões).
-- Todas as linhas devem mostrar ok = true. Só lê; não muda nada.
select item, ok from (values
  ('tabela sugestao existe',
     to_regclass('public.sugestao') is not null),
  ('conversa aceita o passo aguardando_sugestao',
     exists (select 1 from pg_constraint where conname = 'conversa_estado_check'
             and pg_get_constraintdef(oid) like '%aguardando_sugestao%')),
  ('função de salvar guarda sugestões',
     exists (select 1 from pg_proc where proname = 'tnl_salvar_conversa'
             and prosrc like '%insert into sugestao%')),
  ('métricas não têm texto de sugestão',
     not exists (select 1 from public.metrica where evento = 'sugestao' and detalhe ? 'texto')),
  ('busca por CEP com estado e bairro (5 argumentos)',
     exists (select 1 from pg_proc where proname = 'tnl_farmacias_para_cep' and pronargs = 6)),
  ('API pública não lê sugestões (RLS ligado)',
     (select relrowsecurity from pg_class where oid = 'public.sugestao'::regclass))
) as t(item, ok);
