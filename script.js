// Carrega produtos.json e monta a vitrine.
// Este arquivo não precisa ser editado no dia a dia — só o produtos.json.

const ITENS_POR_PAGINA = 8;

const lista = document.getElementById("lista");
const vazio = document.getElementById("vazio");
const fim = document.getElementById("fim");
const sentinela = document.getElementById("sentinela");
const categoriasEl = document.getElementById("categorias");

let produtos = [];
let categoriaAtiva = "Todos";
let quantidadeVisivel = ITENS_POR_PAGINA;

const observer = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting) carregarMais();
  },
  { rootMargin: "200px" }
);

async function carregarProdutos() {
  try {
    const resp = await fetch("produtos.json", { cache: "no-store" });
    if (!resp.ok) throw new Error("Falha ao carregar produtos.json");
    produtos = await resp.json();
  } catch (err) {
    console.error(err);
    lista.innerHTML = "";
    vazio.hidden = false;
    vazio.textContent = "Não foi possível carregar os produtos. Confira o arquivo produtos.json.";
    return;
  }
  montarCategorias();
  renderizar();
  observer.observe(sentinela);
}

function montarCategorias() {
  const categorias = ["Todos", ...new Set(produtos.map((p) => p.categoria).filter(Boolean))];

  if (categorias.length <= 2) {
    categoriasEl.hidden = true;
    return;
  }

  categoriasEl.innerHTML = "";
  categorias.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.role = "tab";
    btn.textContent = cat;
    btn.setAttribute("aria-selected", String(cat === categoriaAtiva));
    btn.addEventListener("click", () => {
      categoriaAtiva = cat;
      quantidadeVisivel = ITENS_POR_PAGINA;
      [...categoriasEl.children].forEach((c) =>
        c.setAttribute("aria-selected", String(c === btn))
      );
      renderizar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    categoriasEl.appendChild(btn);
  });
}

function produtosFiltrados() {
  return produtos.filter(
    (p) => categoriaAtiva === "Todos" || p.categoria === categoriaAtiva
  );
}

function formatarPreco(valor) {
  if (!valor) return "";
  return `R$ ${valor}`;
}

function renderizar() {
  const filtrados = produtosFiltrados();

  lista.innerHTML = "";

  if (filtrados.length === 0) {
    vazio.hidden = false;
    fim.hidden = true;
    return;
  }
  vazio.hidden = true;

  const visiveis = filtrados.slice(0, quantidadeVisivel);
  visiveis.forEach((p, i) => lista.appendChild(criarItem(p, i)));

  fim.hidden = quantidadeVisivel < filtrados.length;
}

function carregarMais() {
  const total = produtosFiltrados().length;
  if (quantidadeVisivel >= total) return;
  quantidadeVisivel = Math.min(quantidadeVisivel + ITENS_POR_PAGINA, total);
  renderizar();
}

function criarItem(p, i) {
  const temDesconto = p.precoOriginal && p.precoOriginal.trim() !== "";

  const item = document.createElement("a");
  item.className = "item";
  item.href = p.link || "#";
  item.target = "_blank";
  item.rel = "noopener sponsored nofollow";
  item.style.setProperty("--i", i % ITENS_POR_PAGINA);

  item.innerHTML = `
    <div class="item-media">
      <img src="${p.imagem || ''}" alt="" loading="lazy" />
    </div>
    <div class="item-info">
      <span class="item-categoria">${escapeHtml(p.categoria || '')}</span>
      <p class="item-nome">${escapeHtml(p.nome || '')}</p>
      <div class="item-precos">
        <span class="preco-atual">${formatarPreco(p.preco)}</span>
        ${temDesconto ? `<span class="preco-original">${formatarPreco(p.precoOriginal)}</span>` : ""}
      </div>
      <span class="item-cta">Ver oferta →</span>
    </div>
  `;
  return item;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

carregarProdutos();
