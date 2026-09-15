# Cadastro de fornecedores

SANE e administradores podem cadastrar empresas pelo menu **Fornecedores**, pelo
atalho em **Grupos** ou por **+ Novo fornecedor** dentro de um grupo. O cadastro
dentro do grupo preserva os campos já preenchidos e seleciona a empresa criada.
Código/nome curto e razão social são obrigatórios; CNPJ e contatos são opcionais.
O código deve ser único, inclusive entre fornecedores inativos.

## Publicação em uma base existente

Antes de publicar o frontend, aplique apenas a migração incremental, com as
credenciais de manutenção já usadas pelo projeto:

```sh
node supabase/run-sql.mjs supabase/migrations/20260915_fornecedores_sane.sql
```

A migração é transacional e idempotente, altera somente a policy de INSERT de
fornecedores e mantém DELETE exclusivo de admin. A policy de UPDATE já permite
SANE/admin. O schema completo também incorpora a mudança para instalações novas.
O deploy do Azure não executa migrações do banco automaticamente.

## Validação

```sh
npm test
npm run build
```

Os testes executam a policy em PostgreSQL local via PGlite, verificando bloqueio
anterior, inserção por sane/admin, bloqueio de campus/outros, exclusão e reaplicação.
Os testes do formulário cobrem normalização, obrigatoriedade, permissão, duplicidade,
erros e bloqueio de envio simultâneo. Não acessam dados de produção.

Após publicar, validar com uma conta SANE: preencher um grupo, cadastrar uma empresa
pelo atalho e confirmar que a seleção e os dados do grupo foram preservados.
