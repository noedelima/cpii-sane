-- Seed inicial — campi do CPII e cadastros mínimos para começar a operar
-- Rode após schema.sql

-- Campi (15 do CPII)
insert into public.campi (nome, sigla, codigo) values
  ('Centro',            'CTRO',   'CTRO'),
  ('Engenho Novo I',    'EN-I',   'EN-I'),
  ('Engenho Novo II',   'EN-II',  'EN-II'),
  ('Humaitá I',         'HUM-I',  'HUM-I'),
  ('Humaitá II',        'HUM-II', 'HUM-II'),
  ('Niterói',           'NIT',    'NIT'),
  ('Realengo I',        'REA-I',  'REA-I'),
  ('Realengo II',       'REA-II', 'REA-II'),
  ('São Cristóvão I',   'SC-I',   'SC-I'),
  ('São Cristóvão II',  'SC-II',  'SC-II'),
  ('São Cristóvão III', 'SC-III', 'SC-III'),
  ('Tijuca I',          'TIJ-I',  'TIJ-I'),
  ('Tijuca II',         'TIJ-II', 'TIJ-II'),
  ('Duque de Caxias',   'DC',     'DC'),
  ('CREIR',             'CREIR',  'CREIR')
on conflict (nome) do nothing;

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
