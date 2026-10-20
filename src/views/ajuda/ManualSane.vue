<script setup lang="ts">
import AjudaFig from "@/components/ajuda/AjudaFig.vue";
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 ajuda-doc">
    <p class="intro">
      Manual completo para a equipe da <strong>SANE</strong> (perfis SANE e Administração). Cobre os cadastros e
      todo o fluxo financeiro — grupos/itens, empenhos, notas fiscais, solicitação de NF e ateste —, as telas de
      acompanhamento (atas, consumo, reforços previstos e notificações) e a administração do sistema. As telas
      são reproduções fiéis (dados de exemplo) com <span class="marca-inline">marcadores numerados</span>
      didáticos.
    </p>

    <nav class="sumario">
      <strong>Conteúdo</strong>
      <ol>
        <li>Visão geral: papéis e o ciclo do fluxo</li>
        <li>Grupos e itens (contrato, CNPJ, CatMat e reajuste)</li>
        <li>Empenhos (NE): cadastro, itens e saldo</li>
        <li>Empenhos: saldo por grupo e PDF de saldos por NE</li>
        <li>Notas Fiscais: lançar uma NF do início ao fim</li>
        <li>NF: distribuir pela fila × débito manual por item</li>
        <li>NF: recibos vinculados e instrumento de cobrança</li>
        <li>Solicitar emissão de NF</li>
        <li>Ateste de recebimento</li>
        <li>Atas: execução do contrato por item</li>
        <li>Consumo por empenho e estimativa de reforço</li>
        <li>Reforços previstos: o painel do Dashboard</li>
        <li>Notificações: faltas e devoluções dos campi</li>
        <li>Administração: usuários, log e configurações</li>
        <li>Perguntas frequentes e glossário</li>
      </ol>
    </nav>

    <hr />

    <h2>1. Visão geral: papéis e o ciclo do fluxo</h2>
    <p><strong>Quem faz o quê:</strong></p>
    <ul class="lista">
      <li><strong>Campus</strong> — registra os recibos das entregas no seu campus.</li>
      <li><strong>SANE</strong> — mantém grupos/itens, lança empenhos e notas fiscais, gera solicitações de NF e atestes.</li>
      <li><strong>Administração</strong> — cadastra usuários/campi, acompanha o log e ajusta as configurações.</li>
    </ul>
    <p><strong>O ciclo, em ordem:</strong></p>
    <p class="fluxo">
      Grupo/Contrato (itens) → Empenho (NE) com saldo → Entrega gera <strong>Recibo</strong> (campus) →
      <strong>Nota Fiscal</strong> lança os itens e debita os empenhos → <strong>Ateste</strong> instrui o pagamento no SUAP.
    </p>
    <div class="callout dica">
      Guarde esta lógica: a NF é o coração do sistema — é nela que os itens são lançados, vinculados aos empenhos
      (pela fila ou manualmente) e conciliados com o valor faturado.
    </div>

    <hr />

    <h2>2. Grupos e itens (contrato, CNPJ, CatMat e reajuste)</h2>
    <p>
      Em <strong>Grupos</strong>, cada grupo representa um contrato/ata com um fornecedor. Ao abrir um grupo você define
      a identificação (nome, números da Ata/TC/Pregão, vigência), o <strong>fornecedor</strong> e o <strong>CNPJ da empresa</strong>,
      e cadastra os <strong>itens</strong> (com <strong>CatMat</strong>, unidade e preço unitário).
    </p>
    <ol class="passos">
      <li>Abra <strong>Grupos → + Novo grupo</strong> (ou edite um existente).</li>
      <li>Para cadastrar uma empresa, use <strong>Fornecedores → Novo fornecedor</strong> ou <strong>+ Novo fornecedor</strong> na tela do grupo. Informe código/nome curto e razão social; CNPJ e contatos são opcionais. No grupo, a empresa criada é selecionada automaticamente, preservando os campos já preenchidos.</li>
      <li>Preencha identificação e selecione o <strong>fornecedor</strong>; informe o <strong>CNPJ</strong> (gravado no cadastro do fornecedor).</li>
      <li>Em <strong>Itens do grupo</strong>, cadastre cada item: CatMat, nome, unidade e valor unitário.</li>
      <li>Para reajuste contratual, use <strong>Reajuste contratual (apostilamento)</strong>: informe o percentual, a data-base e a referência, e aplique.</li>
    </ol>
    <div class="callout atencao">
      <strong>Apostilamento:</strong> o reajuste atualiza o preço vigente de todos os itens ativos do grupo e guarda o
      histórico. <em>Aplicar duas vezes acumula o percentual</em> — confira antes de confirmar. As NEs antigas não mudam:
      o saldo delas é convertido automaticamente ao novo preço.
    </div>

    <hr />

    <h2>3. Empenhos (NE): cadastro, itens e saldo</h2>
    <p>Em <strong>Empenhos → + Novo empenho</strong>, registre a nota de empenho:</p>
    <ol class="passos">
      <li><strong>Identificação</strong>: número da NE, data de emissão, fornecedor, processo SUAP e (opcional) PDF.</li>
      <li><strong>Valores</strong>: valor inicial, reforço, cancelamento e anulação — o sistema calcula o <strong>valor líquido</strong>.</li>
      <li><strong>Alocação por grupo</strong>: vincule a NE a um ou mais grupos (a NE só aparece na distribuição das NFs desses grupos).</li>
      <li><strong>Itens empenhados</strong> (opcional, porém recomendado): selecione o grupo alocado e adicione itens com quantidade. O valor unitário sugerido é o da <strong>época da NE</strong> (histórico) e é editável.</li>
    </ol>
    <p>
      Na edição da NE, a coluna <strong>Saldo (qtd)</strong> mostra o saldo físico de cada item — calculado pelo valor:
      <code>(qtd empenhada × preço da NE − consumido) ÷ preço vigente</code>. Há ainda os botões
      <strong>“NFs pagas com esta NE”</strong> (lista as NFs que debitaram a NE, com processo de pagamento) e
      <strong>“PDF de saldos”</strong> (gera o relatório de saldos para enviar à empresa).
    </p>
    <div class="callout dica">
      Precisa unir duas NEs lançadas em duplicidade? Na edição, use <strong>“Manutenção da NE → Unificar”</strong>: os
      vínculos e valores são transferidos para a NE de destino e a duplicada é excluída, com trilha nas observações.
    </div>

    <hr />

    <h2>4. Empenhos: saldo por grupo e PDF de saldos por NE</h2>
    <p>Na lista de <strong>Empenhos</strong>, ao lado de “+ Novo empenho”, há duas ferramentas de consulta:</p>
    <ul class="lista">
      <li><strong>Saldo por grupo</strong> — escolha um grupo e veja o saldo total disponível por item, somando todas as NEs (com o detalhe por NE).</li>
      <li><strong>PDF de saldos por NE</strong> — entra no modo de seleção; marque as NEs desejadas e gere um PDF único com os saldos atuais, para enviar à empresa.</li>
    </ul>
    <AjudaFig
      titulo="Empenhos"
      legenda="① Saldo por grupo · ② PDF de saldos por NE (seleção) · ③ + Novo empenho · ④ Coluna Saldo · ⑤ Autor do cadastro."
      :marcadores="[
        { n: 1, top: '15%', left: '57%' },
        { n: 2, top: '15%', left: '73%' },
        { n: 3, top: '15%', left: '90%' },
        { n: 4, top: '74%', left: '69%' },
        { n: 5, top: '74%', left: '90%' },
      ]"
    >
      <div class="space-y-3 text-sm">
        <div class="flex items-center justify-between">
          <div class="font-semibold text-base">Empenhos</div>
          <div class="flex gap-2">
            <span class="btn-secondary">Saldo por grupo</span>
            <span class="btn-secondary">PDF de saldos por NE</span>
            <span class="btn-primary">+ Novo empenho</span>
          </div>
        </div>
        <div class="card overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr><th class="px-3 py-2 text-left">Número</th><th class="px-3 py-2 text-left">Fornecedor</th><th class="px-3 py-2 text-right">Saldo</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Autor</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr><td class="px-3 py-2 text-cpii-600 dark:text-cpii-300">2026NE000123</td><td class="px-3 py-2">REFISERVI</td><td class="px-3 py-2 text-right">R$ 12.300,00</td><td class="px-3 py-2"><span class="text-green-600">ativo</span></td><td class="px-3 py-2">Ana (SANE)</td></tr>
              <tr><td class="px-3 py-2 text-cpii-600 dark:text-cpii-300">2026NE000130</td><td class="px-3 py-2">R3M</td><td class="px-3 py-2 text-right">R$ 4.050,40</td><td class="px-3 py-2"><span class="text-green-600">ativo</span></td><td class="px-3 py-2">Ana (SANE)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </AjudaFig>

    <hr />

    <h2>5. Notas Fiscais: lançar uma NF do início ao fim</h2>
    <p>Em <strong>Notas Fiscais → + Nova NF</strong>. O cadastro tem duas etapas: o cabeçalho e, após salvar, os itens e o débito.</p>
    <ol class="passos">
      <li><strong>Grupo(s)/contrato(s)</strong>: selecione um ou mais grupos (clique nas “pílulas”). Com dois ou mais, a NF reúne itens de cada grupo (caso C Teixeira) — o primeiro selecionado é o grupo principal.</li>
      <li>Preencha <strong>nº da NF</strong>, <strong>valor total</strong>, datas de emissão/entrega, status e o <strong>processo de pagamento (SUAP)</strong>.</li>
      <li>Anexe o <strong>PDF da NF</strong> e, se houver, o <strong>Instrumento de Cobrança</strong> (gerado no Contratos.gov).</li>
      <li>Clique em <strong>Criar NF</strong> — a tela passa ao modo de edição, liberando os itens, os recibos e o débito.</li>
      <li>Em <strong>Itens da NF</strong>, adicione cada item do grupo com a quantidade. O <strong>valor unitário é editável</strong>: use o preço faturado, ou escolha um preço do <strong>histórico</strong> (original/reajustes) no seletor da linha.</li>
      <li>Defina o <strong>débito em empenhos</strong> (próxima seção) e confira a conciliação (“Falta ratear” deve zerar).</li>
      <li>Use <strong>“PDF de lançamento”</strong> para gerar o espelho (itens + empenhos) e enviar à empresa.</li>
    </ol>

    <AjudaFig
      titulo="Notas Fiscais › Nova NF (em edição)"
      legenda="① Grupos (1+). ② Nº/valor/processo. ③ Anexos (NF e Instrumento de Cobrança). ④ Item + ⑤ valor unitário/histórico + ⑥ NE por item. ⑦ Distribuir pela fila × Débito pelos itens. ⑧ PDF de lançamento."
      :marcadores="[
        { n: 1, top: '13%', left: '30%' },
        { n: 2, top: '30%', left: '24%' },
        { n: 3, top: '44%', left: '75%' },
        { n: 4, top: '64%', left: '20%' },
        { n: 5, top: '64%', left: '55%' },
        { n: 6, top: '64%', left: '40%' },
        { n: 7, top: '88%', left: '64%' },
        { n: 8, top: '88%', left: '40%' },
      ]"
    >
      <div class="space-y-3 text-sm">
        <div class="card p-4 space-y-3">
          <div class="font-medium text-slate-700 dark:text-slate-200">Cabeçalho</div>
          <div>
            <div class="label">Grupo(s) / contrato(s)</div>
            <div class="flex flex-wrap gap-2">
              <span class="rounded-full bg-cpii-600 text-white border border-cpii-600 px-3 py-1 text-xs">Grupo VII - Estocáveis A - C TEIXEIRA</span>
              <span class="rounded-full border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs text-slate-500">Grupo VIII - Estocáveis B - C TEIXEIRA</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><div class="label">Nº da NF</div><div class="input">000.021.211</div></div>
            <div><div class="label">Valor total (R$)</div><div class="input">1.650,40</div></div>
            <div><div class="label">PDF da nota fiscal</div><span class="btn-secondary inline-block">Anexar PDF</span></div>
            <div><div class="label">Instrumento de Cobrança</div><span class="btn-secondary inline-block">Anexar PDF</span></div>
          </div>
        </div>
        <div class="card p-4 space-y-2">
          <div class="font-medium text-slate-700 dark:text-slate-200">Itens da NF</div>
          <div class="grid grid-cols-12 gap-2 items-end">
            <div class="col-span-6"><div class="label">Item do(s) grupo(s)</div><div class="input">000123 — Filé de peito</div></div>
            <div class="col-span-2"><div class="label">Qtd</div><div class="input">290</div></div>
            <div class="col-span-2"><div class="label">Valor unit.</div><div class="input">R$ 22,00</div></div>
            <div class="col-span-2"><span class="btn-secondary block text-center">Adicionar</span></div>
          </div>
          <table class="w-full">
            <thead class="text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr><th class="text-left">Item</th><th class="text-left">Empenho</th><th class="text-right">Qtd</th><th class="text-right">Valor unit.</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr><td class="py-1">Filé de peito</td><td class="py-1"><span class="input inline-block w-32">NE000123 ▾</span></td><td class="py-1 text-right">290</td><td class="py-1 text-right">R$ 22,00</td></tr>
              <tr><td class="py-1">Filé de peito</td><td class="py-1"><span class="input inline-block w-32">NE000130 ▾</span></td><td class="py-1 text-right">210</td><td class="py-1 text-right">R$ 22,00</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card p-4 space-y-2">
          <div class="flex items-center justify-between">
            <div class="font-medium text-slate-700 dark:text-slate-200">Débito em empenhos</div>
            <div class="flex gap-2">
              <span class="btn-secondary">PDF de lançamento</span>
              <span class="btn-secondary">Débito pelos itens</span>
              <span class="btn-primary">Distribuir pela fila</span>
            </div>
          </div>
          <div class="text-slate-600 dark:text-slate-300">Valor da NF: <strong>R$ 1.650,40</strong> · Rateado: <strong>R$ 1.650,40</strong> · <span class="text-green-600">Conciliado ✓</span></div>
        </div>
      </div>
    </AjudaFig>

    <hr />

    <h2>6. NF: distribuir pela fila × débito manual por item</h2>
    <p>Há dois caminhos para vincular os itens da NF aos empenhos:</p>
    <ul class="lista">
      <li><strong>Distribuir pela fila</strong> (automático): vincula cada item ao empenho <em>mais antigo</em> do seu grupo que tenha saldo, dividindo entre NEs quando preciso, e recalcula o débito. Ideal para NFs novas.</li>
      <li><strong>Seleção manual + “Débito pelos itens”</strong>: na coluna <strong>Empenho</strong> de cada linha, escolha a NE manualmente. O mesmo item pode aparecer em <em>várias linhas</em> para dividir a quantidade entre NEs (ex.: 290 kg na NE001 e 210 kg na NE002). Depois clique em <strong>“Débito pelos itens”</strong> para gerar o rateio a partir das suas escolhas. Use isto para <strong>catalogar NFs antigas</strong> respeitando o lançamento manual original.</li>
    </ul>
    <div class="callout atencao">
      <strong>Atenção:</strong> “Distribuir pela fila” é automático e <em>sobrescreve</em> as escolhas manuais. Para NFs antigas
      lançadas item a item, use a seleção manual + “Débito pelos itens”, e não a fila.
    </div>

    <hr />

    <h2>7. NF: recibos vinculados e instrumento de cobrança</h2>
    <p>
      Ainda na NF, o card <strong>“Recibos vinculados”</strong> permite associar manualmente os recibos do(s) grupo(s):
      busque pelo número e clique em <strong>vincular</strong> (o vínculo é livre dentro do grupo — um recibo pode ser
      referenciado por mais de uma NF). O botão <strong>“Baixar PDFs unificados”</strong> junta os PDFs dos recibos com anexo.
      O <strong>Instrumento de Cobrança</strong> (Contratos.gov) é anexado no cabeçalho, ao lado do PDF da NF.
    </p>
    <p>
      O card mostra também o <strong>valor de referência de cada recibo</strong> (quantidades lançadas × preço do
      catálogo) e a <strong>soma dos recibos vinculados</strong>, comparada automaticamente com o valor total da NF:
      <em>“Confere com o valor total ✓”</em> quando bate, ou a <em>diferença</em> quando não bate — sem precisar somar
      recibo a recibo na mão. Reajustes (apostilamentos) ainda não refletidos no catálogo podem gerar pequenas diferenças.
    </p>

    <hr />

    <h2>8. Solicitar emissão de NF</h2>
    <p>
      A área <strong>Solicitar NF</strong> serve para pedir à empresa a emissão da nota a partir das entregas já registradas:
    </p>
    <ol class="passos">
      <li>Selecione a <strong>empresa</strong> (e, se quiser, o grupo e o período).</li>
      <li>Marque os <strong>recibos</strong> da entrega na lista.</li>
      <li>Confira as <strong>quantidades finais consolidadas</strong> (somatório por item) e clique em <strong>“Registrar solicitação e baixar PDF”</strong>.</li>
      <li>Envie o PDF à empresa; acompanhe o <strong>status</strong> (aberta → enviada → atendida) no histórico.</li>
    </ol>

    <hr />

    <h2>9. Ateste de recebimento</h2>
    <p>Em <strong>Ateste</strong>, gere o documento que instrui o pagamento no SUAP:</p>
    <ol class="passos">
      <li>Escolha a <strong>empresa</strong>; marque os <strong>contratos/grupos</strong> e filtre as NFs (status, período).</li>
      <li>Selecione as <strong>notas fiscais</strong> a atestar (as já atestadas ficam ocultas por padrão).</li>
      <li>Informe o <strong>processo SUAP</strong> e observações e clique em <strong>“Registrar ateste e baixar PDF”</strong>.</li>
    </ol>
    <div class="callout dica">
      O PDF do ateste lista, por NF, o total e os <strong>empenhos usados no pagamento</strong> com os respectivos valores
      (ex.: NF de R$ 10.000 = NE001 R$ 5.750,25 + NE002 R$ 4.249,75). Atestes emitidos ficam no histórico, com
      reemissão do PDF e exclusão (que libera as NFs para novo ateste).
    </div>

    <hr />

    <h2>10. Atas: execução do contrato por item</h2>
    <p>
      A aba <strong>Atas</strong> responde à pergunta do planejamento: <em>quanto da ata já foi usado?</em> Escolha a
      ata e veja, de um lado, os <strong>empenhos</strong> emitidos sobre ela (com reforços, utilizado e saldo) e, de
      outro, a <strong>execução item a item</strong>.
    </p>
    <ul class="lista">
      <li><strong>Empenhado</strong> — quantidades dos itens nas NEs ativas dos grupos da ata (inclui reforços).</li>
      <li><strong>Consumido</strong> — o maior entre o recebido nos recibos e o faturado nas NFs.</li>
      <li><strong>Saldo da ata</strong> — quantidade registrada na ata menos o consumido.</li>
      <li><strong>A empenhar</strong> — quantidade da ata menos o empenhado: o que ainda pode virar NE ou reforço.</li>
    </ul>
    <p>
      Dois alertas aparecem no topo: itens com <strong>85% ou mais</strong> da ata consumidos e itens da ata ainda
      <strong>sem nenhum empenho</strong>. O botão <strong>Exportar CSV</strong> leva a tabela para a planilha.
    </p>
    <div class="callout atencao">
      <strong>A empenhar</strong> e <strong>saldo da ata</strong> respondem a perguntas diferentes. Um item pode ter
      saldo de ata e <em>não</em> ter saldo empenhado — nesse caso a solução é reforçar a NE, não licitar de novo.
    </div>

    <hr />

    <h2>11. Consumo por empenho e estimativa de reforço</h2>
    <p>
      A aba <strong>Consumo</strong> mostra, por item e por empenho, quanto foi consumido ao longo do tempo — em
      semanas ou meses — datado pela <strong>entrega da NF</strong>. Serve para enxergar o ritmo e decidir reforços
      com antecedência.
    </p>
    <ul class="lista">
      <li><strong>Ritmo</strong> — média por período desde o primeiro consumo da janela.</li>
      <li><strong>Cobertura</strong> — saldo ÷ ritmo, ou seja, por quantos períodos o saldo ainda dá.</li>
      <li><strong>Situação</strong> — OK, Atenção, Reforço ou Esgotado, conforme os limites configurados na tela.</li>
    </ul>
    <p>
      É possível agrupar <strong>por item</strong> (somando os empenhos) ou ver empenho a empenho, filtrar por grupo e
      exportar. Para a decisão de abrir reforço, prefira o painel da próxima seção, que já traz a data-limite.
    </p>

    <hr />

    <h2>12. Reforços previstos: o painel do Dashboard</h2>
    <p>
      No <strong>Dashboard</strong>, o painel <strong>Reforços previstos</strong> responde à pergunta prática:
      <em>até quando preciso abrir o processo de reforço?</em> Ele lista apenas os itens que exigem alguma ação —
      quem está folgado fica de fora.
    </p>
    <div class="tabela-wrap">
      <table>
        <thead><tr><th>Coluna</th><th>O que significa</th></tr></thead>
        <tbody>
          <tr><td>Saldo total</td><td>Soma do saldo do item em <strong>todos os empenhos ativos</strong> — não por NE isolada.</td></tr>
          <tr><td>Consumo/mês</td><td>Mediana mensal observada, com seta de tendência (↑ em alta, ↓ em queda, → estável).</td></tr>
          <tr><td>Esgota entre</td><td>Faixa entre duas projeções: regressão e mediana.</td></tr>
          <tr><td>Abrir até</td><td>Data prevista de esgotamento menos o prazo de tramitação configurado.</td></tr>
          <tr><td>Situação</td><td>Esgotado, Prazo vencido, Abrir reforço ou Monitorar.</td></tr>
        </tbody>
      </table>
    </div>
    <p><strong>Como a projeção é feita</strong> — e o que ela não faz:</p>
    <ul class="lista">
      <li>O <strong>ritmo</strong> vem dos <strong>recibos</strong> (recebimento nos campi), não das notas fiscais. A NF é evento de faturamento, sai em blocos e deixaria buracos que não correspondem a consumo.</li>
      <li>O <strong>saldo</strong> vem dos empenhos, que é a autoridade contábil. Cada número vem da sua melhor fonte.</li>
      <li>Duas projeções são calculadas e vale a que <strong>esgota primeiro</strong>: a regressão (enxerga consumo em alta) e a mediana (resistente a uma NF atípica).</li>
      <li>A projeção <strong>não modela férias nem greve</strong>. Em período de recesso prolongado, as datas tendem a ficar pessimistas — o saldo dura mais do que o painel sugere.</li>
    </ul>
    <p>Quando o painel <strong>não arrisca</strong> uma data, ele diz por quê:</p>
    <ul class="lista">
      <li><strong>“histórico curto”</strong> — menos de três meses observados; mostra o ritmo, mas não a data.</li>
      <li><strong>“consumo irregular”</strong> — o item ficou sem compra na maioria dos meses; projetar seria inventar precisão.</li>
      <li><strong>“projeções discordam”</strong> — regressão e mediana diferem por mais de seis meses; a tela mostra só a ponta curta (“a partir de…”).</li>
      <li><strong>“confiança média/baixa”</strong> — histórico ainda curto; passe o mouse para ver quantos meses sustentam a conta.</li>
    </ul>
    <div class="callout atencao">
      <strong>É estimativa, não oráculo.</strong> O painel diz onde olhar e em que ordem — confira o item no
      <strong>Consumo</strong> e nas <strong>Atas</strong> antes de instruir o processo. Muitos “Prazo vencido” de uma
      vez costumam significar que o <em>prazo de tramitação configurado</em> não condiz com a realidade: ajuste-o em
      Administração → Configurações.
    </div>

    <hr />

    <h2>13. Notificações: faltas e devoluções dos campi</h2>
    <p>
      Quando um item não é entregue ou volta por má qualidade, o campus registra uma <strong>ocorrência</strong> no
      próprio recibo. A aba <strong>Notificações</strong> reúne todas elas, consolidadas <strong>por fornecedor</strong>
      ou <strong>por item</strong>, com o valor estimado pelo preço vigente na data do recibo.
    </p>
    <p>
      As ocorrências <strong>não entram</strong> nas quantidades recebidas nem no consumo — são o registro da falha.
      Para cada uma, a SANE mantém o <strong>acompanhamento</strong>: situação (registrada → notificada → respondida
      → arquivada), data da notificação e referência (processo SUAP ou e-mail). O <strong>Exportar CSV</strong> gera a
      base para instruir relatório de penalidade ou pedido de rescisão.
    </p>
    <div class="callout dica">
      O cartão <strong>“Ainda sem notificar”</strong> no topo é a fila de trabalho: são as ocorrências que os campi
      registraram e que ninguém levou à empresa ainda.
    </div>

    <hr />

    <h2>14. Administração: usuários, log e configurações</h2>
    <p>O menu <strong>Administração</strong> (perfil admin) reúne três abas:</p>
    <ul class="lista">
      <li><strong>Usuários</strong> — crie servidores com senha inicial, defina o <strong>papel</strong> (campus/SANE/admin), a matrícula SIAPE e vincule <strong>um ou mais campi</strong> (botão “Campi”). Use “Definir senha” para redefinir acessos e <strong>“Excluir”</strong> para remover um usuário que deixou a instituição. O sistema <em>impede</em> excluir ou rebaixar o último administrador, para não deixar o sistema sem dono.</li>
      <li><strong>Log de auditoria</strong> — registro detalhado de inclusões, edições e exclusões, com autor, data/hora e os campos alterados (antes → depois). Filtre por entidade, ação, período e busca.</li>
      <li><strong>Configurações</strong> — parâmetros globais, detalhados a seguir.</li>
    </ul>
    <p>As <strong>configurações</strong> disponíveis:</p>
    <div class="tabela-wrap">
      <table>
        <thead><tr><th>Parâmetro</th><th>Para que serve</th></tr></thead>
        <tbody>
          <tr><td>Cabeçalho dos PDFs (3 linhas)</td><td>Órgão e setores impressos no topo de ateste, solicitação de NF, saldos e lançamento.</td></tr>
          <tr><td>Local de emissão padrão</td><td>Cidade que aparece na assinatura dos documentos.</td></tr>
          <tr><td>Dias da semana do recibo</td><td>Em que dias a <strong>data do pedido</strong> pode cair. Ver abaixo.</td></tr>
          <tr><td>Prazo de tramitação do reforço</td><td>Dias corridos que o processo leva. É o quanto o painel de reforços se antecipa ao esgotamento.</td></tr>
        </tbody>
      </table>
    </div>
    <p>
      <strong>Dias da semana do recibo.</strong> No CPII o pagamento é calculado pela <strong>data do pedido</strong>,
      não pela da entrega efetiva, e os pedidos saem todos para terça-feira — campi que lançam outra data deslocam
      o pagamento. Marque nas caixas apenas os dias aceitos. Com a restrição ativa:
    </p>
    <ul class="lista">
      <li>Os <strong>campi</strong> não conseguem salvar recibo com data fora dos dias marcados — a tela avisa antes e o banco recusa.</li>
      <li><strong>SANE e admin passam</strong>, com aviso em âmbar, para resolver exceção real (feriado que deslocou a entrega, correção de lançamento).</li>
      <li>Recibos <strong>já cadastrados</strong> em outros dias continuam válidos e editáveis — a regra só vale quando a data muda.</li>
      <li>Deixar <strong>todos os dias</strong> marcados equivale a não ter restrição (é o padrão de fábrica).</li>
    </ul>
    <div class="callout dica">
      Se a SANE começar a receber muitos pedidos de exceção, isso é o diagnóstico de que o calendário real não é
      só aquele dia — vale rever quais dias estão marcados em vez de lançar tudo manualmente.
    </div>
    <AjudaFig
      titulo="Administração"
      legenda="① Abas (Usuários, Log de auditoria, Configurações). ② Papel do usuário. ③ Campi vinculados (1+). ④ Definir senha."
      :marcadores="[
        { n: 1, top: '10%', left: '30%' },
        { n: 2, top: '66%', left: '54%' },
        { n: 3, top: '66%', left: '74%' },
        { n: 4, top: '66%', left: '90%' },
      ]"
    >
      <div class="space-y-3 text-sm">
        <div class="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          <span class="px-3 py-1.5 border-b-2 border-cpii-600 text-cpii-700 dark:text-cpii-300 font-medium">Usuários</span>
          <span class="px-3 py-1.5 text-slate-500">Log de auditoria</span>
          <span class="px-3 py-1.5 text-slate-500">Configurações</span>
        </div>
        <div class="card overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr><th class="px-3 py-2 text-left">Nome</th><th class="px-3 py-2 text-left">Papel</th><th class="px-3 py-2 text-left">Campi</th><th class="px-3 py-2"></th></tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr><td class="px-3 py-2">João da Silva</td><td class="px-3 py-2"><span class="input inline-block w-28">Campus ▾</span></td><td class="px-3 py-2">Centro <span class="btn-ghost text-xs">Editar</span></td><td class="px-3 py-2 text-right"><span class="btn-ghost text-xs">Definir senha</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </AjudaFig>

    <hr />

    <h2>15. Perguntas frequentes e glossário</h2>
    <p><strong>“Erro ao salvar” ao criar uma NF.</strong> Em geral a NF já existe (o número é único por grupo). A mensagem indica o motivo — abra a NF existente na lista em vez de recriá-la.</p>
    <p><strong>Os itens do grupo não aparecem na NF.</strong> Já corrigido: ao trocar de grupo os itens carregam automaticamente. Confirme se o grupo está selecionado.</p>
    <p><strong>Preciso de uma NF única para dois grupos (C Teixeira).</strong> Selecione os dois grupos nas “pílulas”; cada item vai ao empenho do seu próprio grupo na distribuição.</p>
    <p><strong>Quero usar o preço antigo (pré-reajuste) numa NF.</strong> Edite o valor unitário da linha ou escolha o preço no seletor de histórico.</p>
    <p><strong>O painel de reforços mostra dezenas de “Prazo vencido”.</strong> Em geral o <em>prazo de tramitação</em> configurado é maior que o real. Ajuste-o em Administração → Configurações e a lista encolhe. Se o prazo estiver certo, a leitura é dura mas verdadeira: aqueles saldos acabam antes de um reforço conseguir tramitar.</p>
    <p><strong>Um item aparece alertando, mas sei que tem estoque de sobra.</strong> Olhe a coluna “Esgota entre”: se vier “a partir de…” com “projeções discordam”, a regressão viu tendência de alta sobre um consumo pequeno. São os casos de menor confiança — confira no Consumo antes de agir.</p>
    <p><strong>Um campus não consegue lançar recibo de determinada data.</strong> A restrição de dias da semana está ativa (seção 14). Você, como SANE, consegue lançar a exceção; ou um admin ajusta os dias marcados.</p>
    <p><strong>Para que serve a aba Atas se já existe o Consumo?</strong> O Consumo olha o <em>empenho</em> (quanto resta de NE); as Atas olham o <em>contrato</em> (quanto resta do que foi licitado). Item sem saldo de NE mas com saldo de ata pede reforço; item sem saldo de ata pede nova contratação.</p>
    <p class="glossario">
      <strong>Glossário:</strong> <em>NE</em> = nota de empenho · <em>NF</em> = nota fiscal · <em>CatMat</em> = código do item no grupo ·
      <em>Apostilamento</em> = reajuste contratual de preços · <em>Ateste</em> = documento que atesta o recebimento para pagamento ·
      <em>Rateio</em> = divisão do valor da NF entre empenhos · <em>Ocorrência</em> = item não entregue ou devolvido, registrado no recibo ·
      <em>Cobertura</em> = por quanto tempo o saldo ainda dá, no ritmo observado · <em>Reforço</em> = acréscimo de valor a uma NE existente.
    </p>
  </div>
</template>

<style scoped>
.ajuda-doc { color: rgb(51 65 85); }
:global(.dark) .ajuda-doc { color: rgb(203 213 225); }
.ajuda-doc h2 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: rgb(15 23 42); }
:global(.dark) .ajuda-doc h2 { color: rgb(241 245 249); }
.ajuda-doc p { margin: 0.5rem 0; line-height: 1.6; }
.ajuda-doc code { background: rgb(241 245 249); padding: 0.05rem 0.3rem; border-radius: 0.25rem; font-size: 0.85em; }
:global(.dark) .ajuda-doc code { background: rgb(30 41 59); }
.ajuda-doc hr { margin: 1.75rem 0; border-color: rgb(226 232 240); }
:global(.dark) .ajuda-doc hr { border-color: rgb(51 65 85); }
.ajuda-doc .intro { font-size: 0.95rem; color: rgb(71 85 105); }
:global(.dark) .ajuda-doc .intro { color: rgb(148 163 184); }
.ajuda-doc ol.passos, .ajuda-doc ul.lista, .ajuda-doc .sumario ol { margin: 0.5rem 0 0.5rem 1.25rem; }
.ajuda-doc ol.passos { list-style: decimal; }
.ajuda-doc ul.lista { list-style: disc; }
.ajuda-doc ol.passos li, .ajuda-doc ul.lista li { margin: 0.35rem 0; line-height: 1.55; }
.ajuda-doc .fluxo { background: rgb(248 250 252); border: 1px solid rgb(226 232 240); border-radius: 0.5rem; padding: 0.6rem 0.8rem; font-size: 0.92rem; }
:global(.dark) .ajuda-doc .fluxo { background: rgb(15 23 42); border-color: rgb(51 65 85); }
.ajuda-doc .glossario { font-size: 0.9rem; }
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
