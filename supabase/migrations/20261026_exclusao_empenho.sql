-- Exclusao de empenho sem movimento pela interface.
-- Pode ser reaplicada sem executar schema/seed completos.
--
-- Duas mudancas, e a primeira e a que mais importa.
--
-- 1) nf_itens.empenho_id passa de ON DELETE SET NULL para RESTRICT.
--
-- nf_itens.empenho_id guarda a QUAL NE cada item da nota fiscal foi debitado
-- (o caminho do "Debito pelos itens"). Estando em SET NULL, excluir a NE
-- apagava esse vinculo em silencio, deixando itens de NF orfaos de empenho.
--
-- O rateio em nf_empenhos ja era RESTRICT, o que cobre o caso normal - mas nao
-- todos. Existe uma janela real: a pessoa escolhe a NE linha a linha e ainda
-- nao clicou em "Debito pelos itens", entao nf_itens aponta para a NE sem que
-- exista linha em nf_empenhos. Em 25/10/2026 havia exatamente 1 empenho nessa
-- situacao em producao, de 73 ativos. Sem este RESTRICT, a exclusao passaria
-- batido e levaria o vinculo junto.
--
-- Nao confundir com empenhos_itens e empenhos_grupos: essas duas sao partes do
-- proprio empenho e seguem em CASCADE, de proposito - excluir a NE leva os
-- itens e a alocacao dela junto, como deve ser.
--
-- 2) A exclusao de empenho passa de admin para sane e admin, como ja foi feito
-- para grupo e fornecedor: quem cadastra precisa poder limpar o proprio erro.
begin;

alter table public.nf_itens
  drop constraint nf_itens_empenho_id_fkey,
  add constraint nf_itens_empenho_id_fkey
    foreign key (empenho_id) references public.empenhos(id) on delete restrict;

drop policy if exists p_empenhos_delete on public.empenhos;
create policy p_empenhos_delete on public.empenhos for delete to authenticated
  using (public.current_papel() in ('sane', 'admin'));

commit;
