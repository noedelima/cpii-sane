<script setup lang="ts">
import AjudaFig from "@/components/ajuda/AjudaFig.vue";
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 ajuda-doc">
    <p class="intro">
      Este manual é para os servidores dos <strong>campi</strong> que registram no
      <strong>Portal da Nutrição</strong> os
      <strong>recibos</strong> de entrega de gêneros alimentícios. Cada seção é independente; siga na ordem
      se estiver começando. As telas abaixo são reproduções fiéis do sistema, com dados de exemplo e
      <span class="marca-inline">marcadores numerados</span> apenas para fins didáticos (eles não aparecem no sistema).
    </p>

    <nav class="sumario">
      <strong>Conteúdo</strong>
      <ol>
        <li>Conceitos: o que é o recibo e por que registrar</li>
        <li>Entrar no sistema (login)</li>
        <li>A barra lateral e a tela inicial</li>
        <li>Cadastrar um recibo (passo a passo)</li>
        <li>Faltas e devoluções: registrar ocorrências</li>
        <li>Corrigir um recibo já salvo</li>
        <li>Acompanhar seus recibos</li>
        <li>Anexar arquivos ao recibo</li>
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
        <div class="text-lg font-semibold">Portal da Nutrição</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">Colégio Pedro II</div>
        <p class="text-slate-500 dark:text-slate-400">
          Sistema da Seção de Alimentação e Nutrição (SANE) para registro e acompanhamento de
          empenhos, notas fiscais e recibos de gêneros alimentícios.
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
      Depois de entrar, a navegação fica na <strong>barra lateral esquerda</strong>, organizada por tarefa.
      Como Campus, você usará principalmente <strong>Recibos</strong>, no grupo <em>Lançar</em>. O
      <strong>Dashboard</strong> mostra um panorama geral e <strong>Ajuda</strong>, no rodapé da barra, traz
      este manual.
    </p>
    <AjudaFig
      titulo="Barra lateral"
      legenda="① Botão que recolhe a barra para só ícones (no celular, abre a gaveta). ② Recibos é a sua área principal. ③ Ajuda fica no rodapé da barra. ④ Seu nome e perfil: trocar a senha ou sair."
      :marcadores="[
        { n: 1, top: '9%', left: '6%' },
        { n: 2, top: '45%', left: '20%' },
        { n: 3, top: '88%', left: '18%' },
        { n: 4, top: '9%', left: '90%' },
      ]"
    >
      <div class="text-sm">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-3 py-2">
          <div class="flex items-center gap-2">
            <span class="text-slate-400">☰</span>
            <span class="font-semibold text-cpii-700 dark:text-gold-300">Portal da Nutrição</span>
          </div>
          <span class="text-slate-500 dark:text-slate-400">Seu nome ▾</span>
        </div>
        <div class="flex">
          <div class="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700 p-2 space-y-0.5">
            <div class="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300">Dashboard</div>
            <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Lançar</div>
            <div class="rounded-lg bg-cpii-600 px-3 py-1.5 font-medium text-white">Recibos</div>
            <div class="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300">Notas Fiscais</div>
            <div class="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300">Empenhos</div>
            <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cadastros</div>
            <div class="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300">Grupos</div>
            <div class="mt-3 border-t border-slate-200 dark:border-slate-700 pt-2">
              <div class="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300">Ajuda</div>
            </div>
          </div>
          <div class="grow p-4 text-slate-500 dark:text-slate-400">Conteúdo da tela escolhida</div>
        </div>
      </div>
    </AjudaFig>
    <div class="callout dica">
      No <strong>celular</strong> a barra não fica fixa: toque no ☰, no canto superior esquerdo, para abrir a
      gaveta com os mesmos grupos. No computador, o mesmo botão <em>recolhe</em> a barra para só ícones, dando
      mais largura às tabelas — e o sistema lembra sua escolha.
    </div>

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
        <strong>Adicionar</strong> (ou tecle <strong>Enter</strong> no campo da quantidade, que é mais rápido quando a
        entrega tem muitos itens). Repita para cada item da entrega.</li>
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

    <div class="callout atencao">
      <strong>Dias permitidos para a data do pedido.</strong> A instituição pode restringir em que dias da semana
      a data do pedido pode cair — no Colégio Pedro II os pedidos são feitos para <strong>terça-feira</strong>, e o
      pagamento é calculado por essa data, não pela da entrega efetiva. Se a data escolhida cair num dia
      bloqueado, aparece um aviso em vermelho abaixo do campo e o recibo <em>não salva</em>. O texto logo abaixo
      da data diz quais dias estão liberados.
      <br /><br />
      <strong>Entregou em outro dia?</strong> Mantenha a data do pedido e descreva a divergência nas
      <strong>observações</strong>. Se o caso for mesmo de exceção (feriado que deslocou a entrega, por exemplo),
      peça à SANE — só o perfil SANE/Administração consegue lançar fora dos dias permitidos.
    </div>

    <hr />

    <h2>5. Faltas e devoluções: registrar ocorrências</h2>
    <p>
      Quando um item <strong>não foi entregue</strong> ou foi <strong>devolvido</strong> por má qualidade, registre
      na seção <strong>Ocorrências</strong> do próprio recibo. Escolha o item, o tipo da ocorrência, a quantidade e,
      se quiser, uma observação (ex.: “fruta madura demais”).
    </p>
    <div class="callout dica">
      A ocorrência <strong>não entra</strong> nas quantidades recebidas — ela é o registro do que faltou ou voltou.
      Nos <strong>itens</strong> do recibo, lance apenas o que de fato ficou no campus.
    </div>
    <p>
      Esses registros se acumulam na aba <strong>Notificações</strong> da SANE, consolidados por fornecedor e por
      item. São eles que instruem a notificação à empresa e, se for o caso, o relatório de penalidade. Por isso
      vale registrar sempre, mesmo a falta pequena: o padrão só aparece quando há histórico.
    </p>

    <hr />

    <h2>6. Corrigir um recibo já salvo</h2>
    <p>
      Você pode <strong>abrir e corrigir</strong> um recibo do seu campus — número, data, observações, itens,
      quantidades, ocorrências e anexos — enquanto ele ainda estiver <strong>pendente</strong> e sem nota fiscal
      vinculada. Basta abrir o recibo na lista, ajustar e clicar em <strong>Salvar</strong>.
    </p>
    <p>
      Depois que a SANE vincula o recibo a uma NF ou muda o status (confirmado, pago…), ele <strong>trava</strong>:
      os campos ficam somente leitura e aparece um aviso explicando. A partir daí, qualquer correção passa pela
      SANE — o que é proposital, porque o recibo já está sustentando um pagamento.
    </p>

    <hr />

    <h2>7. Acompanhar seus recibos</h2>
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

    <h2>8. Anexar arquivos ao recibo</h2>
    <p>
      Use <strong>“Anexar arquivo”</strong> para subir o documento físico digitalizado (até 10 MB). São aceitos
      <strong>PDF, JPG e PNG</strong> — dá para fotografar o recibo com o celular. Depois de anexado, aparece o
      link para abrir (e a miniatura, se for imagem). Isso ajuda a SANE na conferência e mantém o comprovante
      junto ao registro.
    </p>
    <p>
      Se um recibo tiver <strong>mais de um documento</strong> (várias folhas digitalizadas em arquivos separados,
      um comprovante de devolução, a foto de uma impropriedade), use a seção <strong>Outros anexos</strong>, logo
      abaixo: dê uma descrição, anexe o arquivo e repita quantas vezes precisar. Não há limite de quantidade, e a
      seção está disponível <strong>já no cadastro</strong> do recibo — os anexos são gravados junto, ao salvar.
    </p>
    <div class="callout dica">
      Quando a SANE gera o PDF unificado dos recibos de uma nota fiscal, os anexos adicionais entram junto —
      as imagens viram páginas do PDF. Então vale anexá-los aqui em vez de enviar por e-mail à parte.
    </div>
    <div class="callout atencao">
      Foto de iPhone costuma sair em <strong>HEIC</strong>, que o sistema não aceita. Na própria foto, use
      <em>Compartilhar › Opções › Mais compatível</em> para enviar em JPG — ou ajuste em
      <em>Ajustes › Câmera › Formatos › Mais compatível</em>.
    </div>

    <hr />

    <h2>9. Trocar a senha</h2>
    <ol class="passos">
      <li>Clique no <strong>seu nome</strong>, no canto superior direito.</li>
      <li>Escolha <strong>“Trocar senha”</strong>.</li>
      <li>Digite a nova senha (mínimo 10 caracteres), repita e salve.</li>
    </ol>
    <div class="callout dica">
      Recebeu uma senha inicial da SANE? Troque-a no primeiro acesso por uma só sua.
    </div>

    <hr />

    <h2>10. Perguntas frequentes</h2>
    <p><strong>Não vejo o botão “+ Novo recibo”.</strong> Seu perfil pode não estar como Campus, ou sem campus vinculado. Peça à Administração para ajustar.</p>
    <p><strong>Errei a quantidade depois de salvar.</strong> Abra o recibo e ajuste normalmente — enquanto ele estiver pendente e sem NF vinculada, você mesmo corrige itens e quantidades (seção 6). Se ele já estiver travado, fale com a SANE.</p>
    <p><strong>O sistema recusou a data do recibo.</strong> A data do pedido caiu num dia da semana que a instituição não aceita — o aviso abaixo do campo diz quais dias estão liberados. Se a entrega realmente ocorreu em outro dia, mantenha a data do pedido e explique nas observações; se for exceção de verdade, peça à SANE para lançar.</p>
    <p><strong>Faltou um item na entrega. Lanço com quantidade zero?</strong> Não. Lance nos <strong>itens</strong> só o que chegou e registre a falta em <strong>Ocorrências</strong> (seção 5) — é assim que a SANE consegue notificar a empresa.</p>
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
