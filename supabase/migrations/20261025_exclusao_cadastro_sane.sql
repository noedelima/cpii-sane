-- Exclusao de grupo e fornecedor tambem pela SANE (antes so admin).
-- Pode ser reaplicada sem executar schema/seed completos.
--
-- Motivacao: erro de digitacao em cadastro acontece - um grupo "ghj" criado em
-- 17/09/2026 ficou meses nas listas e no Dashboard porque nao havia como
-- remove-lo pela tela. Quem cadastra e a SANE; deixar a exclusao so com o
-- admin resolve metade do problema, porque a pessoa que errou continua
-- dependendo de outra para limpar.
--
-- O risco e baixo e ja esta contido pelo banco: itens, empenhos_grupos,
-- recibos, notas_fiscais e nf_grupos referenciam grupo com ON DELETE RESTRICT,
-- e fornecedores_id em grupos/empenhos idem. Ou seja, so cadastro VAZIO pode
-- ser excluido - cadastro com historico o Postgres recusa, qualquer que seja o
-- papel de quem tentou.
begin;

drop policy if exists p_grupos_delete on public.grupos;
create policy p_grupos_delete on public.grupos for delete to authenticated
  using (public.current_papel() in ('sane', 'admin'));

drop policy if exists p_fornecedores_delete on public.fornecedores;
create policy p_fornecedores_delete on public.fornecedores for delete to authenticated
  using (public.current_papel() in ('sane', 'admin'));

commit;
