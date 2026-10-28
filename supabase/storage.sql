-- Buckets de PDFs e policies de acesso.
-- Rodar via: node supabase/run-sql.mjs supabase/storage.sql
-- (separado do schema.sql porque storage.objects pertence ao Supabase e pode
-- exigir permissoes especificas)

insert into storage.buckets (id, name, public)
values
  ('pdfs-empenhos', 'pdfs-empenhos', false),
  ('pdfs-nfs', 'pdfs-nfs', false),
  ('pdfs-recibos', 'pdfs-recibos', false),
  ('pdfs-cobranca', 'pdfs-cobranca', false)
on conflict (id) do nothing;

-- Tipos e tamanho aceitos, no servidor. A tela ja valida, mas a validacao da
-- tela e conveniencia: qualquer cliente autenticado fala direto com a API do
-- Storage. Esta e a regra que vale.
-- Imagens so em JPEG e PNG, e so nos recibos: o "Baixar PDFs unificados" embute
-- os anexos com pdf-lib, que le apenas esses dois formatos — aceitar HEIC ou
-- WebP faria a foto subir e desaparecer do PDF que instrui o pagamento.
-- Documentos oficiais (NE, NF, instrumento de cobranca) seguem so em PDF.
-- UPDATE explicito: o "on conflict do nothing" acima nao altera bucket que ja
-- existe, e todos ja existem em producao.
--
-- O file_size_limit abaixo e so o valor inicial: a partir da migracao
-- 20261028_upload_limite.sql quem manda e a configuracao global
-- upload_tamanho_max_mb, que um gatilho replica para estes buckets.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'],
       file_size_limit    = 10485760
 where id = 'pdfs-recibos';

update storage.buckets
   set allowed_mime_types = array['application/pdf'],
       file_size_limit    = 10485760
 where id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-cobranca');

-- Leitura: qualquer autenticado (URLs assinadas geradas pelo app).
drop policy if exists sane_pdfs_select on storage.objects;
create policy sane_pdfs_select on storage.objects for select to authenticated
  using (bucket_id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-recibos', 'pdfs-cobranca'));

-- Upload: campus/sane/admin (perfil "outros" nao envia arquivos).
drop policy if exists sane_pdfs_insert on storage.objects;
create policy sane_pdfs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-recibos', 'pdfs-cobranca')
    and public.current_papel() in ('campus', 'sane', 'admin')
  );

-- Delete: SANE/admin.
drop policy if exists sane_pdfs_delete on storage.objects;
create policy sane_pdfs_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-recibos', 'pdfs-cobranca')
    and public.current_papel() in ('sane', 'admin')
  );
