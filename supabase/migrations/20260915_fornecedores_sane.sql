-- Permite à SANE cadastrar fornecedores; exclusão continua somente admin.
-- Pode ser reaplicada sem executar schema/seed completos.
begin;
drop policy if exists p_fornecedores_insert on public.fornecedores;
create policy p_fornecedores_insert on public.fornecedores for insert to authenticated
  with check (public.current_papel() in ('sane','admin'));
commit;
