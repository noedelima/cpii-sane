-- Buckets de PDFs e policies de acesso.
-- Rodar via: node supabase/run-sql.mjs supabase/storage.sql
-- (separado do schema.sql porque storage.objects pertence ao Supabase e pode
-- exigir permissoes especificas)

insert into storage.buckets (id, name, public)
values
  ('pdfs-empenhos', 'pdfs-empenhos', false),
  ('pdfs-nfs', 'pdfs-nfs', false),
  ('pdfs-recibos', 'pdfs-recibos', false)
on conflict (id) do nothing;

-- Leitura: qualquer autenticado (URLs assinadas geradas pelo app).
drop policy if exists sane_pdfs_select on storage.objects;
create policy sane_pdfs_select on storage.objects for select to authenticated
  using (bucket_id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-recibos'));

-- Upload: campus/sane/admin (perfil "outros" nao envia arquivos).
drop policy if exists sane_pdfs_insert on storage.objects;
create policy sane_pdfs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-recibos')
    and public.current_papel() in ('campus', 'sane', 'admin')
  );

-- Delete: SANE/admin.
drop policy if exists sane_pdfs_delete on storage.objects;
create policy sane_pdfs_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-recibos')
    and public.current_papel() in ('sane', 'admin')
  );
