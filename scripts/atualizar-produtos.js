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
  const urlFinal = resp.url;
  const corpo = await resp.text();
  return { urlFinal, corpo };
}

function extrairId(texto) {
  if (!texto) return null;
  const match = texto.match(/MLB-?(\d{5,})/i);
  return match ? `MLB${match[1]}` : null;
}

function extrairIdDaPagina(urlFinal, corpo) {
  // 1. tenta direto na URL final
  let id = extrairId(urlFinal);
  if (id) return { id, origem: urlFinal };

  // 2. a URL final pode ser uma tela intermediária (ex: redirecionamento
  //    feito por JavaScript pra abrir o app). Nesses casos o ID do produto
  //    costuma continuar escondido no HTML, em tags de SEO.
  const canonical = corpo.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const ogUrl = corpo.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);

  for (const candidato of [canonical && canonical[1], ogUrl && ogUrl[1]]) {
    if (!candidato) continue;
    id = extrairId(candidato);
    if (id) return { id, origem: candidato };
  }

  // 3. último recurso: procura qualquer MLB solto em qualquer lugar do HTML.
  id = extrairId(corpo);
  if (id) return { id, origem: `encontrado no conteúdo de ${urlFinal}` };

  return { id: null, origem: urlFinal };
}

async function buscarItem(id) {
  // Tenta como anúncio normal primeiro (funciona pra a maioria dos links).
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

  // Se não for um anúncio (é um "produto de catálogo", padrão /p/MLB... nas
  // URLs), a API de produto exige login. Em vez disso, usamos a busca
  // pública filtrando por catalog_product_id, que devolve os anúncios reais
  // vinculados a esse produto — e aí buscamos o primeiro normalmente.
  resp = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${id}`,
    { headers: HEADERS_NAVEGADOR }
  );
  if (resp.ok) {
    const data = await resp.json();
    const primeiro = data.results && data.results[0];
    if (primeiro && primeiro.id && primeiro.id !== id) {
      return buscarItem(primeiro.id);
    }
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

      const { urlFinal, corpo } = await resolverLink(linkOriginal);
      const { id, origem } = extrairIdDaPagina(urlFinal, corpo);

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
