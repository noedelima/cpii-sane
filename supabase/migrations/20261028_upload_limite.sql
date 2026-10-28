-- =====================================================================
-- Limite global de upload, configuravel pelo admin, valendo no servidor
-- =====================================================================
-- Ate aqui o tamanho e o tipo dos anexos eram validados so na tela. A tela e
-- conveniencia: qualquer usuario autenticado fala direto com a API do Storage.
-- Esta migracao move a regra para onde ela vale.
--
-- 1) Nova chave em configuracoes, editavel na aba Configuracoes (admin).
-- 2) Gatilho que, ao gravar essa chave, sincroniza o file_size_limit dos
--    buckets. Assim o numero que o admin ve na tela e o numero que bloqueia.
-- 3) allowed_mime_types por bucket. Imagens so em JPEG e PNG, e so nos
--    recibos: o "Baixar PDFs unificados" embute os anexos com pdf-lib, que le
--    apenas esses dois formatos — aceitar HEIC ou WebP faria a foto subir e
--    desaparecer do PDF que instrui o pagamento. Documentos oficiais (NE, NF,
--    instrumento de cobranca) seguem so em PDF.

insert into public.configuracoes (chave, valor, descricao) values
  ('upload_tamanho_max_mb', '10',
   'Tamanho máximo, em MB, de cada arquivo anexado (recibos, empenhos, notas fiscais e instrumento de cobrança). Mínimo 1, máximo 25.')
on conflict (chave) do nothing;

-- insert "do nothing" nao corrige a descricao de instalacao que ja tenha a chave
update public.configuracoes
   set descricao = 'Tamanho máximo, em MB, de cada arquivo anexado (recibos, empenhos, notas fiscais e instrumento de cobrança). Mínimo 1, máximo 25.'
 where chave = 'upload_tamanho_max_mb'
   and descricao is distinct from 'Tamanho máximo, em MB, de cada arquivo anexado (recibos, empenhos, notas fiscais e instrumento de cobrança). Mínimo 1, máximo 25.';

-- Aplica a configuracao vigente aos buckets. security definer: storage.buckets
-- nao pertence ao dono do schema public, e o admin nao tem (nem deve ter)
-- permissao direta nela. A funcao nao recebe parametro justamente para nao
-- virar um caminho de escrita arbitraria: ela so le a propria configuracao.
create or replace function public.aplica_limite_upload()
returns void
language plpgsql
security definer
set search_path = public
as $alu$
declare
  v_mb int;
begin
  select coalesce(nullif(btrim(valor), ''), '10')::numeric
    into v_mb
    from public.configuracoes
   where chave = 'upload_tamanho_max_mb';

  -- mesmo clamp do front (src/lib/arquivos.ts): 1..25, inteiro, com padrao 10
  v_mb := least(greatest(round(coalesce(v_mb, 10))::int, 1), 25);

  update storage.buckets
     set file_size_limit = v_mb * 1024 * 1024,
         allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
   where id = 'pdfs-recibos';

  update storage.buckets
     set file_size_limit = v_mb * 1024 * 1024,
         allowed_mime_types = array['application/pdf']
   where id in ('pdfs-empenhos', 'pdfs-nfs', 'pdfs-cobranca');
exception
  when insufficient_privilege then
    -- Falhar aqui derrubaria a tela de Configuracoes inteira. Avisa alto e
    -- deixa claro que, nesse caso, o limite vale so na tela.
    raise warning 'Sem permissao para ajustar storage.buckets: o limite de upload fica valendo apenas na tela.';
end;
$alu$;

revoke all on function public.aplica_limite_upload() from public;
revoke execute on function public.aplica_limite_upload() from anon;

create or replace function public.fn_sync_limite_upload()
returns trigger
language plpgsql
as $sl$
begin
  if new.chave = 'upload_tamanho_max_mb' then
    perform public.aplica_limite_upload();
  end if;
  return null;
end;
$sl$;

drop trigger if exists trg_sync_limite_upload on public.configuracoes;
create trigger trg_sync_limite_upload
  after insert or update on public.configuracoes
  for each row execute function public.fn_sync_limite_upload();

-- sincroniza agora, com o valor que acabou de ser inserido
select public.aplica_limite_upload();
