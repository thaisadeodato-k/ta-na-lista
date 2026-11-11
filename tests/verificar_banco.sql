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
