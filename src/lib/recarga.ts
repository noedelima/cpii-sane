/**
 * Recuperacao de chunk obsoleto apos um deploy.
 *
 * O app e carregado em pedacos (um por tela, import dinamico) e cada deploy
 * gera nomes novos. Quem estava com o Portal aberto continua com o index.html
 * antigo na memoria do navegador: ao abrir uma tela que ainda nao tinha
 * carregado, ele pede um arquivo que nao existe mais. O servidor responde com
 * o index.html, o navegador recusa por MIME e a tela fica em branco, sem erro
 * visivel. Recarregar a pagina resolve, porque traz o index.html novo.
 *
 * Isto e so a deteccao, isolada aqui para poder ser testada sem navegador.
 */

/** Mensagens dos tres motores quando o import dinamico nao encontra o arquivo. */
const PADROES = [
  /failed to fetch dynamically imported module/i, // Chrome/Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /expected a javascript(-or-wasm)? module script/i, // MIME do index.html
  /dynamically imported module.*not found/i,
];

export function ehChunkObsoleto(erro: unknown): boolean {
  const msg =
    erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro ?? "");
  return PADROES.some((p) => p.test(msg));
}

/**
 * So recarrega uma vez. Sem esta trava, um erro parecido que NAO se resolve
 * com recarga (rede caida, arquivo realmente ausente) deixaria o usuario num
 * laco de recarregamento, que e pior que a tela em branco.
 */
export function deveRecarregar(erro: unknown, jaTentou: boolean): boolean {
  return !jaTentou && ehChunkObsoleto(erro);
}
