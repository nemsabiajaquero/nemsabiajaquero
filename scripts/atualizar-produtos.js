// Lê os links em novos-links.txt, abre a página de cada produto e extrai
// nome, preço e imagem direto do HTML (tags de SEO), sem usar a API do
// Mercado Livre — porque a API agora exige login pra praticamente tudo.
// Roda sozinho via GitHub Actions — não precisa executar isso manualmente.

const fs = require("fs");

const LINKS_FILE = "novos-links.txt";
const PRODUTOS_FILE = "produtos.json";
const ERROS_FILE = "erros-links.txt";

const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

function formatarPreco(valor) {
  if (valor === undefined || valor === null || valor === "") return "";
  const numero = typeof valor === "string" ? valor.replace(",", ".") : valor;
  const n = Number(numero);
  if (Number.isNaN(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

async function resolverLink(link) {
  const resp = await fetch(link, { redirect: "follow", headers: HEADERS_NAVEGADOR });
  const urlFinal = resp.url;
  const corpo = await resp.text();
  return { urlFinal, corpo, status: resp.status };
}

// Procura um objeto Product dentro de blocos JSON-LD (o formato estruturado
// que sites de e-commerce usam pra aparecer bonito no Google). É a fonte
// mais confiável quando existe.
function extrairDoJsonLd(corpo) {
  const blocos = [
    ...corpo.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];

  for (const bloco of blocos) {
    let dados;
    try {
      dados = JSON.parse(bloco[1]);
    } catch {
      continue;
    }

    const candidatos = Array.isArray(dados)
      ? dados
      : Array.isArray(dados["@graph"])
      ? dados["@graph"]
      : [dados];

    for (const c of candidatos) {
      if (!c) continue;
      const tipo = c["@type"];
      const ehProduto = tipo === "Product" || (Array.isArray(tipo) && tipo.includes("Product"));
      if (!ehProduto || !c.name) continue;

      const oferta = Array.isArray(c.offers) ? c.offers[0] : c.offers;
      const imagem = Array.isArray(c.image) ? c.image[0] : c.image;

      return {
        nome: c.name,
        preco: oferta && oferta.price ? formatarPreco(oferta.price) : "",
        imagem: imagem || "",
        origem: "json-ld",
      };
    }
  }
  return null;
}

// Se não achar JSON-LD, tenta as tags de Open Graph (og:title, og:image) e
// a extensão de produto (product:price:amount), usadas pra pré-visualização
// em redes sociais.
function extrairDeMetaTags(corpo) {
  const pegar = (propriedade) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${propriedade}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const m = corpo.match(re);
    return m ? m[1] : null;
  };

  const nome = pegar("og:title");
  if (!nome) return null;

  const imagem = pegar("og:image");
  const preco = pegar("product:price:amount") || pegar("og:price:amount");

  return {
    nome,
    preco: preco ? formatarPreco(preco) : "",
    imagem: imagem || "",
    origem: "meta-tags",
  };
}

function extrairDadosDoProduto(corpo) {
  return extrairDoJsonLd(corpo) || extrairDeMetaTags(corpo);
}

// Formato próprio do Mercado Livre (não é o padrão JSON-LD/Open Graph):
// blocos tipo "price":{"current_price":{"value":47.8,...}} espalhados pelo
// HTML. Pega a primeira ocorrência, que costuma ser a do produto principal
// (as ocorrências seguintes tendem a ser de produtos recomendados/relacionados).
function extrairPrecoDeComponentes(corpo) {
  const mAtual = corpo.match(/"current_price"\s*:\s*\{\s*"value"\s*:\s*([\d.]+)/);
  if (!mAtual) return null;

  const mOriginal =
    corpo.match(/"original_price"\s*:\s*\{\s*"value"\s*:\s*([\d.]+)/) ||
    corpo.match(/"previous_price"\s*:\s*\{\s*"value"\s*:\s*([\d.]+)/);

  return {
    preco: formatarPreco(mAtual[1]),
    precoOriginal: mOriginal ? formatarPreco(mOriginal[1]) : "",
  };
}

// Junta pedacinhos da página perto de qualquer ocorrência de um termo,
// pra gente conseguir ver o formato real usado — em vez de ficar chutando.
function coletarPistas(corpo, termo, limite = 4) {
  const pistas = [];
  const re = new RegExp(`.{40}(?:${termo}).{60}`, "gi");
  let m;
  let contagem = 0;
  while ((m = re.exec(corpo)) !== null && contagem < limite) {
    pistas.push(m[0].replace(/\s+/g, " ").trim());
    contagem++;
  }
  return pistas;
}

// Tenta achar a categoria a partir do "breadcrumb" (caminho tipo Casa >
// Cozinha > Panelas) que também costuma vir em JSON-LD.
function extrairCategoria(corpo) {
  const blocos = [
    ...corpo.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];

  for (const bloco of blocos) {
    let dados;
    try {
      dados = JSON.parse(bloco[1]);
    } catch {
      continue;
    }
    const candidatos = Array.isArray(dados) ? dados : [dados];
    for (const c of candidatos) {
      if (c && c["@type"] === "BreadcrumbList" && Array.isArray(c.itemListElement)) {
        const nomes = c.itemListElement
          .map((item) => item.name)
          .filter(Boolean);
        // pega o penúltimo (o último costuma ser o nome do próprio produto)
        if (nomes.length >= 2) return nomes[nomes.length - 2];
        if (nomes.length === 1) return nomes[0];
      }
    }
  }
  return "Geral";
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

      const { urlFinal, corpo, status } = await resolverLink(linkOriginal);

      if (status >= 400) {
        erros.push(`${linkOriginal} — a página respondeu HTTP ${status}. URL final: ${urlFinal}`);
        continue;
      }

      const dados = extrairDadosDoProduto(corpo);

      if (!dados || !dados.nome) {
        erros.push(
          `${linkOriginal} — não encontrei os dados do produto no HTML da página. URL final: ${urlFinal}`
        );
        continue;
      }

      let precoOriginal = "";
      let pistasDesconto = [];
      if (!dados.preco) {
        const precos = extrairPrecoDeComponentes(corpo);
        if (precos) {
          dados.preco = precos.preco;
          precoOriginal = precos.precoOriginal;
        }
      } else {
        // Preço já veio do JSON-LD/meta tags. Ainda assim tenta achar o
        // preço original (desconto) no formato próprio do Mercado Livre.
        const precos = extrairPrecoDeComponentes(corpo);
        if (precos && precos.precoOriginal) {
          precoOriginal = precos.precoOriginal;
        }
      }

      if (!precoOriginal) {
        pistasDesconto = coletarPistas(corpo, "original_price|previous_price|regular_price|discount");
      }

      produtos.unshift({
        nome: dados.nome,
        categoria: extrairCategoria(corpo),
        preco: dados.preco,
        precoOriginal,
        imagem: dados.imagem,
        link: linkOriginal,
      });

      const avisos = [];
      if (!dados.preco) {
        const pistas = coletarPistas(corpo, "price");
        avisos.push(
          "sem preço. Pistas:\n  " +
            (pistas.length > 0 ? pistas.join("\n  ") : "(nenhuma ocorrência de 'price' encontrada)")
        );
      } else if (!precoOriginal && pistasDesconto.length > 0) {
        avisos.push(
          "preço encontrado, mas sem preço original (pode ser que não tenha desconto mesmo). Pistas de desconto encontradas:\n  " +
            pistasDesconto.join("\n  ")
        );
      }
      if (avisos.length > 0) {
        erros.push(`${linkOriginal} — produto adicionado, ${avisos.join(" | ")}`);
      }

      console.log(`Adicionado (via ${dados.origem}): ${dados.nome}`);
    } catch (err) {
      erros.push(`${linkOriginal} — erro ao processar: ${err.message}`);
    }
  }

  fs.writeFileSync(PRODUTOS_FILE, JSON.stringify(produtos, null, 2) + "\n");
  fs.writeFileSync(
    LINKS_FILE,
    "# Cole aqui um link de afiliado do Mercado Livre por linha e salve (commit).\n# O site atualiza sozinho em 1-2 minutos.\n"
  );

  if (erros.length > 0) {
    fs.writeFileSync(ERROS_FILE, erros.join("\n") + "\n");
    console.log(`${erros.length} link(s) com problema — ver ${ERROS_FILE}`);
  } else {
    fs.writeFileSync(ERROS_FILE, "Sem erros no último processamento. 🎉\n");
  }
}

main();
