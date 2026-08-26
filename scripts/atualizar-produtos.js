// Lê os links em novos-links.txt, busca os dados de cada produto na API
// pública do Mercado Livre, e adiciona no produtos.json automaticamente.
// Roda sozinho via GitHub Actions — não precisa executar isso manualmente.

const fs = require("fs");

const LINKS_FILE = "novos-links.txt";
const PRODUTOS_FILE = "produtos.json";
const ERROS_FILE = "erros-links.txt";

function formatarPreco(valor) {
  if (valor === undefined || valor === null || valor === "") return "";
  return Number(valor).toFixed(2).replace(".", ",");
}

const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

async function resolverLink(link) {
  const resp = await fetch(link, { redirect: "follow", headers: HEADERS_NAVEGADOR });
  return resp.url;
}

function extrairId(url) {
  const match = url.match(/MLB-?(\d{5,})/i);
  return match ? `MLB${match[1]}` : null;
}

async function buscarItem(id) {
  // Tenta como anúncio normal primeiro.
  let resp = await fetch(`https://api.mercadolibre.com/items/${id}`, {
    headers: HEADERS_NAVEGADOR,
  });
  if (resp.ok) {
    const data = await resp.json();
    return {
      nome: data.title,
      preco: formatarPreco(data.price),
      precoOriginal: data.original_price ? formatarPreco(data.original_price) : "",
      imagem: (data.pictures && data.pictures[0] && data.pictures[0].url) || data.thumbnail || "",
      categoriaId: data.category_id,
    };
  }

  // Se não for um anúncio, tenta como produto de catálogo.
  resp = await fetch(`https://api.mercadolibre.com/products/${id}`, {
    headers: HEADERS_NAVEGADOR,
  });
  if (resp.ok) {
    const data = await resp.json();
    const preco = data.buy_box_winner ? data.buy_box_winner.price : undefined;
    return {
      nome: data.name,
      preco: formatarPreco(preco),
      precoOriginal: "",
      imagem: (data.pictures && data.pictures[0] && data.pictures[0].url) || "",
      categoriaId: data.category_id,
    };
  }

  return null;
}

async function buscarCategoria(id) {
  if (!id) return "Geral";
  try {
    const resp = await fetch(`https://api.mercadolibre.com/categories/${id}`, {
      headers: HEADERS_NAVEGADOR,
    });
    if (!resp.ok) return "Geral";
    const data = await resp.json();
    const nome = data.name || "Geral";
    return nome.split(",")[0].trim();
  } catch {
    return "Geral";
  }
}

async function main() {
  if (!fs.existsSync(LINKS_FILE)) {
    console.log("Arquivo novos-links.txt não encontrado, nada a fazer.");
    return;
  }

  const linhas = fs
    .readFileSync(LINKS_FILE, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (linhas.length === 0) {
    console.log("Nenhum link novo pra processar.");
    return;
  }

  const produtos = fs.existsSync(PRODUTOS_FILE)
    ? JSON.parse(fs.readFileSync(PRODUTOS_FILE, "utf-8"))
    : [];

  const erros = [];

  for (const linkOriginal of linhas) {
    try {
      const jaExiste = produtos.some((p) => p.link === linkOriginal);
      if (jaExiste) {
        console.log(`Já estava cadastrado, pulei: ${linkOriginal}`);
        continue;
      }

      const urlFinal = await resolverLink(linkOriginal);
      const id = extrairId(urlFinal);

      if (!id) {
        erros.push(
          `${linkOriginal} — não consegui identificar o produto. URL final: ${urlFinal}`
        );
        continue;
      }

      const item = await buscarItem(id);
      if (!item || !item.nome) {
        erros.push(`${linkOriginal} — produto não encontrado na API do Mercado Livre.`);
        continue;
      }

      const categoria = await buscarCategoria(item.categoriaId);

      produtos.push({
        nome: item.nome,
        categoria,
        preco: item.preco,
        precoOriginal: item.precoOriginal,
        imagem: item.imagem,
        link: linkOriginal,
      });

      console.log(`Adicionado: ${item.nome}`);
    } catch (err) {
      erros.push(`${linkOriginal} — erro ao processar: ${err.message}`);
    }
  }

  fs.writeFileSync(PRODUTOS_FILE, JSON.stringify(produtos, null, 2) + "\n");
  fs.writeFileSync(LINKS_FILE, "# Cole aqui um link de afiliado do Mercado Livre por linha e salve (commit).\n# O site atualiza sozinho em 1-2 minutos.\n");

  if (erros.length > 0) {
    fs.writeFileSync(ERROS_FILE, erros.join("\n") + "\n");
    console.log(`${erros.length} link(s) com problema — ver ${ERROS_FILE}`);
  } else if (fs.existsSync(ERROS_FILE)) {
    fs.unlinkSync(ERROS_FILE);
  }
}

main();
