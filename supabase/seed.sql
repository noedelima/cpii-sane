-- Seed inicial — campi do CPII e cadastros mínimos para começar a operar
-- Rode após schema.sql

-- Migracao idempotente: o CREIR foi promovido a campus e passou a se chamar
-- "Realengo III" (sigla CREIII). O insert abaixo usa "on conflict (nome) do
-- nothing" e por isso NAO renomeia o registro antigo — logo o update tem de vir
-- antes, senao o insert criaria um campus novo e o historico (recibos, NFs e
-- perfis vinculados) ficaria preso no registro antigo.
-- So renomeia se ainda nao existir o registro novo (evita violar o unique).
update public.campi
   set nome = 'Realengo III', sigla = 'CREIII', codigo = 'CREIII'
 where nome = 'CREIR'
   and not exists (select 1 from public.campi c2 where c2.nome = 'Realengo III');

-- Campi (15 do CPII)
insert into public.campi (nome, sigla, codigo) values
  ('Centro',            'CCE',    'CCE'),
  ('Engenho Novo I',    'CENI',   'CENI'),
  ('Engenho Novo II',   'CENII',  'CENII'),
  ('Humaitá I',         'CHUI',   'CHUI'),
  ('Humaitá II',        'CHUII',  'CHUII'),
  ('Niterói',           'CNI',    'CNI'),
  ('Realengo I',        'CREI',   'CREI'),
  ('Realengo II',       'CREII',  'CREII'),
  ('São Cristóvão I',   'CSCI',   'CSCI'),
  ('São Cristóvão II',  'CSCII',  'CSCII'),
  ('São Cristóvão III', 'CSCIII', 'CSCIII'),
  ('Tijuca I',          'CTI',    'CTI'),
  ('Tijuca II',         'CTII',   'CTII'),
  ('Duque de Caxias',   'CDC',    'CDC'),
  ('Realengo III',      'CREIII', 'CREIII')
on conflict (nome) do nothing;

-- Sincroniza sigla/codigo dos campi ja cadastrados com o padrao oficial do CPII
-- (prefixo C, sem hifen). Necessario pelo mesmo motivo acima: o insert nao
-- atualiza quem ja existe, entao correcoes de sigla nunca chegavam ao banco.
update public.campi c
   set sigla = v.sigla, codigo = v.codigo
  from (values
    ('Centro',            'CCE',    'CCE'),
    ('Engenho Novo I',    'CENI',   'CENI'),
    ('Engenho Novo II',   'CENII',  'CENII'),
    ('Humaitá I',         'CHUI',   'CHUI'),
    ('Humaitá II',        'CHUII',  'CHUII'),
    ('Niterói',           'CNI',    'CNI'),
    ('Realengo I',        'CREI',   'CREI'),
    ('Realengo II',       'CREII',  'CREII'),
    ('Realengo III',      'CREIII', 'CREIII'),
    ('São Cristóvão I',   'CSCI',   'CSCI'),
    ('São Cristóvão II',  'CSCII',  'CSCII'),
    ('São Cristóvão III', 'CSCIII', 'CSCIII'),
    ('Tijuca I',          'CTI',    'CTI'),
    ('Tijuca II',         'CTII',   'CTII'),
    ('Duque de Caxias',   'CDC',    'CDC')
  ) as v(nome, sigla, codigo)
 where c.nome = v.nome
   and (c.sigla is distinct from v.sigla or c.codigo is distinct from v.codigo);

-- Fornecedores
insert into public.fornecedores (codigo, razao_social) values
  ('REFISERVI',         'REFISERVI Refeições Industriais Ltda.'),
  ('NARDELLI',          'Nardelli Comércio e Serviços Ltda.'),
  ('R3M',               'R3M Importação e Distribuição Ltda.'),
  ('COMERCIAL MILANO',  'Comercial Milano Brasil Ltda.'),
  ('RUST RIO BR',       'Rust Rio BR'),
  ('C. TEIXEIRA',       'C. Teixeira'),
  ('MÚLTIPLA',          'Múltipla')
on conflict (codigo) do nothing;

-- Grupos vigentes
insert into public.grupos (nome, numero_arabico, numero_romano, categoria, fornecedor_id) values
  ('Grupo I - Hortifruti A - REFISERVI',           1,  'I',    'Hortifrutigranjeiros A',  (select id from public.fornecedores where codigo='REFISERVI')),
  ('Grupo II - Hortifruti B - REFISERVI',          2,  'II',   'Hortifrutigranjeiros B',  (select id from public.fornecedores where codigo='REFISERVI')),
  ('Grupo III - Carnes Bovinas - NARDELLI',        3,  'III',  'Carnes Bovinas',          (select id from public.fornecedores where codigo='NARDELLI')),
  ('Grupo IV - Carne de Frango - R3M',             4,  'IV',   'Carne de Frango',         (select id from public.fornecedores where codigo='R3M')),
  ('Grupo V - Carnes Suínas - COMERCIAL MILANO',   5,  'V',    'Carnes Suínas',           (select id from public.fornecedores where codigo='COMERCIAL MILANO')),
  ('Grupo VI - Pescados - RUST RIO BR',            6,  'VI',   'Pescados',                (select id from public.fornecedores where codigo='RUST RIO BR')),
  ('Grupo VII - Estocáveis A - C TEIXEIRA',        7,  'VII',  'Estocáveis A',            (select id from public.fornecedores where codigo='C. TEIXEIRA')),
  ('Grupo VIII - Estocáveis B - C TEIXEIRA',       8,  'VIII', 'Estocáveis B',            (select id from public.fornecedores where codigo='C. TEIXEIRA')),
  ('Grupo IX - Estocáveis C - COMERCIAL MILANO',   9,  'IX',   'Estocáveis C',            (select id from public.fornecedores where codigo='COMERCIAL MILANO')),
  ('Grupo X - Polpas - MÚLTIPLA',                  10, 'X',    'Polpas',                  (select id from public.fornecedores where codigo='MÚLTIPLA'))
on conflict (nome) do nothing;
