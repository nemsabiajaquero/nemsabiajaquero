# Nem sabia já quero! — vitrine de links de afiliado

Vitrine estática no estilo Linktree para divulgar links de afiliado do
Mercado Livre. Feita para hospedar de graça no GitHub Pages.

## Estrutura

```
index.html          → estrutura da página (não precisa mexer)
style.css           → visual do site (não precisa mexer)
script.js           → lógica de filtro por categoria (não precisa mexer)
produtos.json        → SEUS PRODUTOS — é o único arquivo que você edita no dia a dia
assets/logo.png      → seu logotipo
```

## Como colocar no ar (GitHub Pages)

1. Crie um repositório novo no GitHub. Se ele se chamar exatamente
   `seu-usuario.github.io`, o site fica em `https://seu-usuario.github.io/`
   (sem caminho extra). Qualquer outro nome funciona também, só que a URL
   fica `https://seu-usuario.github.io/nome-do-repositorio/`.
2. Envie estes arquivos e pastas (`index.html`, `style.css`, `script.js`,
   `produtos.json`, e a pasta `assets` com o `logo.png` dentro) para o
   repositório — pode ser pelo botão **"Add file" → "Upload files"** no site
   do GitHub, arrastando tudo de uma vez (arraste a pasta `assets` inteira).
3. No repositório, vá em **Settings → Pages**.
4. Em "Branch", selecione `main` (ou `master`) e a pasta `/ (root)`. Clique
   em **Save**.
5. Espere 1–2 minutos. O GitHub mostra a URL do site no topo da página de
   Pages.

## Carregamento (scroll infinito)

A vitrine mostra 8 produtos por vez e carrega mais 8 automaticamente quando
o visitante rola até perto do fim da lista — não tem botão de "próxima
página" nem busca, só a rolagem. Se quiser mudar quantos itens aparecem por
vez, é só editar o número `ITENS_POR_PAGINA` no início do `script.js`.

## Como atualizar os produtos

Edite só o arquivo `produtos.json`. Pelo site do GitHub: abra o arquivo →
ícone de lápis (editar) → altere → **Commit changes**. O site atualiza
sozinho em 1–2 minutos.

Cada produto segue este formato:

```json
{
  "nome": "Nome do produto",
  "categoria": "Categoria (cria a aba de filtro automaticamente)",
  "preco": "89,90",
  "precoOriginal": "129,90",
  "imagem": "URL da imagem do produto",
  "link": "seu link de afiliado do Mercado Livre"
}
```

- `precoOriginal` é opcional — deixe `""` (vazio) se não tiver desconto a
  mostrar.
- A `categoria` vira automaticamente um filtro (chips) no topo do site —
  não precisa cadastrar categorias em outro lugar. Se você tiver só uma
  categoria (ou nenhuma), os chips somem sozinhos.
- Para achar a URL da imagem: na página do produto no Mercado Livre, clique
  com o botão direito na foto → "Copiar endereço da imagem".
- O link deve ser o seu link de afiliado (gerado no painel de afiliados do
  Mercado Livre), não o link comum do produto — senão você não recebe
  comissão.

## Dicas

- **Divulgação de afiliado**: o rodapé do site já avisa que os links são de
  afiliado. Isso é uma boa prática (e o Mercado Livre exige divulgação nos
  termos do programa) — não remova esse aviso.
- **Indexação no Google**: depois que o site estiver no ar, cadastre a URL
  no [Google Search Console](https://search.google.com/search-console) e
  peça indexação — acelera bastante o processo de aparecer nas buscas.
- **Domínio próprio**: se quiser trocar `seu-usuario.github.io` por um
  domínio como `seusite.com.br`, é só registrar o domínio (pago) e apontar
  para o GitHub Pages em Settings → Pages → Custom domain. O GitHub Pages em
  si continua gratuito.
