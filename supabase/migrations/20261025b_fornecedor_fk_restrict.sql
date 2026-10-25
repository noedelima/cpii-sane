-- Endurece para RESTRICT as chaves que apontam para fornecedores.
-- Pode ser reaplicada sem executar schema/seed completos.
--
-- Quatro das seis estavam em ON DELETE SET NULL: grupos, empenhos, recibos e
-- notas_fiscais. Na pratica, excluir um fornecedor em uso NAO era barrado pelo
-- banco - o vinculo era apagado em silencio e os registros ficavam sem
-- empresa. Perda discreta, do tipo que so aparece meses depois, quando alguem
-- procura de quem era aquela NF.
--
-- Com RESTRICT, o banco recusa a exclusao e a verificacao da tela deixa de ser
-- a unica barreira. Nao ha risco de dados invalidos ao aplicar: a chave ja
-- existia, entao nenhuma linha orfa e possivel, e a validacao percorre tabelas
-- pequenas (centenas de linhas). O lock e de milissegundos.
--
-- Reversivel: basta recriar as restricoes com ON DELETE SET NULL.
begin;

alter table public.grupos
  drop constraint grupos_fornecedor_id_fkey,
  add constraint grupos_fornecedor_id_fkey
    foreign key (fornecedor_id) references public.fornecedores(id) on delete restrict;

alter table public.empenhos
  drop constraint empenhos_fornecedor_id_fkey,
  add constraint empenhos_fornecedor_id_fkey
    foreign key (fornecedor_id) references public.fornecedores(id) on delete restrict;

alter table public.recibos
  drop constraint recibos_fornecedor_id_fkey,
  add constraint recibos_fornecedor_id_fkey
    foreign key (fornecedor_id) references public.fornecedores(id) on delete restrict;

alter table public.notas_fiscais
  drop constraint notas_fiscais_fornecedor_id_fkey,
  add constraint notas_fiscais_fornecedor_id_fkey
    foreign key (fornecedor_id) references public.fornecedores(id) on delete restrict;

commit;
