// Gera public/cpii-logo-pdf.png, a versao do brasao usada DENTRO dos PDFs.
//
//   node scripts/gera-logo-pdf.mjs
//
// Por que existe: o jsPDF embute PNG como pixels crus. O logo da tela tem
// 977x796 em RGBA, o que sozinho colocava ~3 MB em CADA documento gerado
// (ateste, saldos, lancamento e solicitacao de NF). Esses arquivos seguem por
// e-mail as empresas e sao anexados a processos no SUAP, onde peso importa.
//
// Duas medidas: dimensionar para o tamanho real de impressao (24 mm de largura
// a ~340 dpi) e achatar a transparencia sobre branco, que e o fundo da pagina.
// Sem o canal alfa o jsPDF dispensa a mascara de transparencia, que dobrava o
// tamanho. A compressao em si e ligada no addImage.
//
// A tela continua usando public/cpii-logo.png, em resolucao cheia.
import sharp from "sharp";

const ORIGEM = "public/cpii-logo.png";
const DESTINO = "public/cpii-logo-pdf.png";
/** 24 mm de largura impressos a ~340 dpi. */
const LARGURA = 320;

const info = await sharp(ORIGEM)
  .resize({ width: LARGURA, fit: "inside", withoutEnlargement: true })
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9, palette: false })
  .toFile(DESTINO);

console.log(`${DESTINO}: ${info.width}x${info.height}, ${info.size} bytes`);
