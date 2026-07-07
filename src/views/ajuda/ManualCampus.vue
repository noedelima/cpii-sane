<script setup lang="ts">
import AjudaFig from "@/components/ajuda/AjudaFig.vue";
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 ajuda-doc">
    <p class="intro">
      Este manual é para os servidores dos <strong>campi</strong> que registram no sistema os
      <strong>recibos</strong> de entrega de gêneros alimentícios. Cada seção é independente; siga na ordem
      se estiver começando. As telas abaixo são reproduções fiéis do sistema, com dados de exemplo e
      <span class="marca-inline">marcadores numerados</span> apenas para fins didáticos (eles não aparecem no sistema).
    </p>

    <nav class="sumario">
      <strong>Conteúdo</strong>
      <ol>
        <li>Conceitos: o que é o recibo e por que registrar</li>
        <li>Entrar no sistema (login)</li>
        <li>O menu e a tela inicial</li>
        <li>Cadastrar um recibo (passo a passo)</li>
        <li>Acompanhar seus recibos</li>
        <li>Anexar o PDF do recibo</li>
        <li>Trocar a senha</li>
        <li>Perguntas frequentes</li>
      </ol>
    </nav>

    <hr />

    <h2>1. Conceitos: o que é o recibo e por que registrar</h2>
    <p>
      O <strong>recibo</strong> registra <em>o que foi entregue</em> pelo fornecedor no seu campus: a data, o
      grupo/contrato e a quantidade de cada item. É a base do controle: depois a SANE associa os recibos às
      notas fiscais e aos empenhos para o pagamento.
    </p>
    <div class="callout dica">
      <strong>Em uma frase:</strong> sempre que chegar uma entrega, registre um recibo com os itens e as
      quantidades recebidas. Quanto antes e mais fiel ao que chegou, melhor para todo o fluxo.
    </div>
    <p>Cada recibo tem um <strong>status</strong> que mostra em que ponto ele está:</p>
    <div class="tabela-wrap">
      <table>
        <thead><tr><th>Status</th><th>Significa</th></tr></thead>
        <tbody>
          <tr><td>Pendente</td><td>Registrado, aguardando conferência da SANE.</td></tr>
          <tr><td>Confirmado</td><td>Conferido pela SANE.</td></tr>
          <tr><td>Pago</td><td>Já vinculado a uma NF paga.</td></tr>
          <tr><td>Glosado</td><td>Houve glosa (desconto/recusa) — verifique as observações.</td></tr>
          <tr><td>Cancelado</td><td>Recibo cancelado.</td></tr>
        </tbody>
      </table>
    </div>

    <hr />

    <h2>2. Entrar no sistema (login)</h2>
    <ol class="passos">
      <li>Abra o endereço do sistema no navegador (Chrome, Edge ou Firefox atualizados).</li>
      <li>Clique em <strong>“Entrar com e-mail @cp2.g12.br”</strong>.</li>
      <li>Informe seu <strong>e-mail institucional</strong> e a <strong>senha</strong> e confirme.</li>
    </ol>

    <AjudaFig
      titulo="Tela inicial › Entrar"
      legenda="① Botão de login. Use sempre o e-mail institucional. A senha inicial é fornecida pela SANE/Administração."
      :marcadores="[{ n: 1, top: '78%', left: '50%' }]"
    >
      <div class="card p-6 text-center text-sm space-y-3 max-w-md mx-auto">
        <div class="text-lg font-semibold">Controle de Empenhos da SANE</div>
        <p class="text-slate-500 dark:text-slate-400">
          Sistema interno do Colégio Pedro II para registro e acompanhamento de empenhos,
          notas fiscais e recibos de gêneros alimentícios.
        </p>
        <div><span class="btn-primary inline-block">Entrar com e-mail @cp2.g12.br</span></div>
      </div>
    </AjudaFig>

    <div class="callout atencao">
      <strong>Não consegue entrar?</strong> Confira se digitou o e-mail completo (@cp2.g12.br). Se a rede do
      campus bloquear a conexão segura, tente por outra rede (por exemplo, dados do celular). Se persistir,
      peça à SANE para <em>redefinir sua senha</em>.
    </div>

    <hr />

    <h2>3. O menu e a tela inicial</h2>
    <p>
      Depois de entrar, o menu no topo dá acesso às áreas. Como Campus, você usará principalmente
      <strong>Recibos</strong>. O <strong>Dashboard</strong> mostra um panorama geral; <strong>Ajuda</strong> traz este manual.
    </p>
    <AjudaFig
      titulo="Menu superior"
      legenda="① Recibos é a sua área principal. ② Seu nome e perfil; clique para trocar a senha ou sair."
      :marcadores="[{ n: 1, top: '50%', left: '20.5%' }, { n: 2, top: '50%', left: '88%' }]"
    >
      <div class="rounded-md bg-cpii-600 text-white px-4 py-3 flex items-center justify-between text-sm">
        <div class="flex items-center gap-3">
          <span class="font-semibold">SANE — Controle</span>
          <span class="opacity-90">Dashboard</span>
          <span class="bg-cpii-700 rounded px-2 py-0.5">Recibos</span>
          <span class="opacity-90">Notas Fiscais</span>
          <span class="opacity-90 hidden sm:inline">Ajuda</span>
        </div>
        <span class="opacity-90">Seu nome ▾</span>
      </div>
    </AjudaFig>

    <hr />

    <h2>4. Cadastrar um recibo (passo a passo)</h2>
    <p>Na área <strong>Recibos</strong>, clique em <strong>“+ Novo recibo”</strong> e preencha:</p>
    <ol class="passos">
      <li><strong>Nº do recibo</strong> — o número do documento entregue pelo fornecedor.</li>
      <li><strong>Data do pedido</strong> — a data do pedido a que o recibo se refere. Se a entrega tiver ocorrido em outro dia (ex.: pedido de uma semana entregue junto com o da seguinte), mantenha a data do pedido e registre a divergência nas observações.</li>
      <li><strong>Campus</strong> — já vem preenchido com o seu (quando você é de um campus).</li>
      <li><strong>Grupo</strong> — o contrato/grupo dos itens entregues (ex.: “Grupo I — Hortifruti A”). Selecione-o
        primeiro: a lista de itens depende do grupo.</li>
      <li><strong>Item</strong> e <strong>Quantidade</strong> — escolha o item e digite a quantidade recebida; clique em
        <strong>Adicionar</strong>. Repita para cada item da entrega.</li>
      <li>Confira o <strong>valor total estimado</strong> (calculado pelo preço de referência do contrato) e clique em
        <strong>Salvar recibo</strong>.</li>
    </ol>

    <AjudaFig
      titulo="Recibos › Novo recibo"
      legenda="① Nº e data · ② Campus (seu) · ③ Grupo (escolha primeiro) · ④ Item e quantidade + Adicionar · ⑤ Total estimado · ⑥ Salvar."
      :marcadores="[
        { n: 1, top: '20%', left: '27%' },
        { n: 2, top: '34%', left: '27%' },
        { n: 3, top: '34%', left: '73%' },
        { n: 4, top: '60%', left: '40%' },
        { n: 5, top: '83%', left: '78%' },
        { n: 6, top: '94%', left: '90%' },
      ]"
    >
      <div class="space-y-4 text-sm">
        <div class="card p-4 space-y-3">
          <div class="font-medium text-slate-700 dark:text-slate-200">Cabeçalho</div>
          <div class="grid grid-cols-2 gap-3">
            <div><div class="label">Nº do recibo</div><div class="input">001234</div></div>
            <div><div class="label">Data do pedido</div><div class="input">12/05/2026</div></div>
            <div><div class="label">Campus</div><div class="input">Campus Centro</div></div>
            <div><div class="label">Grupo</div><div class="input">Grupo I - Hortifruti A - REFISERVI</div></div>
          </div>
        </div>
        <div class="card p-4 space-y-3">
          <div class="font-medium text-slate-700 dark:text-slate-200">Itens entregues</div>
          <div class="grid grid-cols-12 gap-2 items-end">
            <div class="col-span-6"><div class="label">Item</div><div class="input">000123 — Banana prata</div></div>
            <div class="col-span-2"><div class="label">Un.</div><div class="input">kg</div></div>
            <div class="col-span-2"><div class="label">Qtd</div><div class="input">40</div></div>
            <div class="col-span-2"><span class="btn-secondary block text-center">Adicionar</span></div>
          </div>
          <table class="w-full">
            <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
              <tr><th class="text-left">Item</th><th class="text-right">Qtd</th><th class="text-left pl-3">Un.</th><th class="text-right">Subtotal (ref.)</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr><td class="py-1">Banana prata</td><td class="py-1 text-right">40</td><td class="py-1 pl-3">kg</td><td class="py-1 text-right">R$ 180,00</td></tr>
              <tr><td class="py-1">Maçã</td><td class="py-1 text-right">25</td><td class="py-1 pl-3">kg</td><td class="py-1 text-right">R$ 212,50</td></tr>
            </tbody>
            <tfoot><tr class="border-t border-slate-300 dark:border-slate-600 font-medium"><td class="py-1" colspan="3">Valor total estimado do recibo</td><td class="py-1 text-right">R$ 392,50</td></tr></tfoot>
          </table>
        </div>
        <div class="flex justify-end gap-2">
          <span class="btn-ghost">Voltar</span><span class="btn-primary">Salvar recibo</span>
        </div>
      </div>
    </AjudaFig>

    <div class="callout dica">
      O <strong>valor total estimado</strong> usa o preço vigente do contrato e serve só de conferência — o valor
      que será pago é definido depois, na nota fiscal. Se um item não aparecer na lista, confirme se escolheu o
      <strong>grupo correto</strong>.
    </div>

    <hr />

    <h2>5. Acompanhar seus recibos</h2>
    <p>
      A lista de <strong>Recibos</strong> mostra todos os registros, com busca por número e filtros por campus, grupo e
      status. A coluna <strong>Autor</strong> indica quem cadastrou (passe o mouse para ver a data/hora). Clique no
      número do recibo para abrir e ver os detalhes.
    </p>
    <AjudaFig
      titulo="Recibos"
      legenda="① Busca e filtros · ② Status de cada recibo · ③ Autor do cadastro (com data/hora no tooltip)."
      :marcadores="[{ n: 1, top: '16%', left: '20%' }, { n: 2, top: '64%', left: '76%' }, { n: 3, top: '64%', left: '92%' }]"
    >
      <div class="space-y-3 text-sm">
        <div class="flex gap-2">
          <div class="input w-40">Buscar por número…</div>
          <div class="input w-40">Todos os campi</div>
          <div class="input w-40">Todos os status</div>
        </div>
        <div class="card overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr><th class="px-3 py-2 text-left">Nº</th><th class="px-3 py-2 text-left">Data</th><th class="px-3 py-2 text-left">Grupo</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Autor</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr><td class="px-3 py-2 text-cpii-600 dark:text-cpii-300">001234</td><td class="px-3 py-2">12/05/2026</td><td class="px-3 py-2">Grupo I</td><td class="px-3 py-2"><span class="text-amber-600">pendente</span></td><td class="px-3 py-2">Maria (campus)</td></tr>
              <tr><td class="px-3 py-2 text-cpii-600 dark:text-cpii-300">001233</td><td class="px-3 py-2">10/05/2026</td><td class="px-3 py-2">Grupo IV</td><td class="px-3 py-2"><span class="text-green-600">pago</span></td><td class="px-3 py-2">Maria (campus)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </AjudaFig>

    <hr />

    <h2>6. Anexar o PDF do recibo</h2>
    <p>
      Ao abrir um recibo, use <strong>“Anexar PDF”</strong> para subir a imagem/PDF do documento físico (até 10 MB).
      Depois de anexado, aparece o link <strong>“Ver PDF”</strong>. Isso ajuda a SANE na conferência e mantém o
      comprovante junto ao registro.
    </p>

    <hr />

    <h2>7. Trocar a senha</h2>
    <ol class="passos">
      <li>Clique no <strong>seu nome</strong>, no canto superior direito.</li>
      <li>Escolha <strong>“Trocar senha”</strong>.</li>
      <li>Digite a nova senha (mínimo 10 caracteres), repita e salve.</li>
    </ol>
    <div class="callout dica">
      Recebeu uma senha inicial da SANE? Troque-a no primeiro acesso por uma só sua.
    </div>

    <hr />

    <h2>8. Perguntas frequentes</h2>
    <p><strong>Não vejo o botão “+ Novo recibo”.</strong> Seu perfil pode não estar como Campus, ou sem campus vinculado. Peça à Administração para ajustar.</p>
    <p><strong>Errei a quantidade depois de salvar.</strong> Abra o recibo e ajuste; itens já gravados só a SANE remove. Em caso de dúvida, registre nas observações.</p>
    <p><strong>O item não aparece na lista.</strong> Verifique o grupo selecionado — a lista de itens é a daquele contrato. Se o item realmente não existir, avise a SANE.</p>
    <p><strong>Posso cadastrar recibo de outro campus?</strong> Em geral não — você lança para o(s) seu(s) campus. A Administração pode vincular mais de um campus ao seu perfil, se for o caso.</p>
  </div>
</template>

<style scoped>
.ajuda-doc { color: rgb(51 65 85); }
:global(.dark) .ajuda-doc { color: rgb(203 213 225); }
.ajuda-doc h2 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: rgb(15 23 42); }
:global(.dark) .ajuda-doc h2 { color: rgb(241 245 249); }
.ajuda-doc h3 { font-size: 1.05rem; font-weight: 600; margin: 1.1rem 0 0.4rem; }
.ajuda-doc p { margin: 0.5rem 0; line-height: 1.6; }
.ajuda-doc hr { margin: 1.75rem 0; border-color: rgb(226 232 240); }
:global(.dark) .ajuda-doc hr { border-color: rgb(51 65 85); }
.ajuda-doc .intro { font-size: 0.95rem; color: rgb(71 85 105); }
:global(.dark) .ajuda-doc .intro { color: rgb(148 163 184); }
.ajuda-doc ol.passos, .ajuda-doc .sumario ol { margin: 0.5rem 0 0.5rem 1.25rem; }
.ajuda-doc ol.passos { list-style: decimal; }
.ajuda-doc ol.passos li { margin: 0.35rem 0; line-height: 1.55; }
.ajuda-doc .sumario { margin: 1rem 0; padding: 0.85rem 1rem; border: 1px solid rgb(226 232 240); border-radius: 0.5rem; font-size: 0.9rem; }
:global(.dark) .ajuda-doc .sumario { border-color: rgb(51 65 85); }
.ajuda-doc .sumario ol { list-style: decimal; }
.ajuda-doc .callout { margin: 0.85rem 0; padding: 0.7rem 0.9rem; border-radius: 0.5rem; font-size: 0.9rem; border: 1px solid; }
.ajuda-doc .callout.dica { background: rgb(239 246 255); border-color: rgb(191 219 254); color: rgb(30 58 138); }
:global(.dark) .ajuda-doc .callout.dica { background: rgba(30 58 138 / 0.25); border-color: rgb(30 58 138); color: rgb(191 219 254); }
.ajuda-doc .callout.atencao { background: rgb(255 251 235); border-color: rgb(253 230 138); color: rgb(146 64 14); }
:global(.dark) .ajuda-doc .callout.atencao { background: rgba(120 53 15 / 0.25); border-color: rgb(146 64 14); color: rgb(253 230 138); }
.ajuda-doc .marca-inline { color: rgb(220 38 38); font-weight: 600; }
.ajuda-doc .tabela-wrap { overflow-x: auto; margin: 0.75rem 0; }
.ajuda-doc table { width: 100%; font-size: 0.9rem; border-collapse: collapse; }
.ajuda-doc .tabela-wrap th, .ajuda-doc .tabela-wrap td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid rgb(226 232 240); }
:global(.dark) .ajuda-doc .tabela-wrap th, :global(.dark) .ajuda-doc .tabela-wrap td { border-color: rgb(51 65 85); }
</style>
