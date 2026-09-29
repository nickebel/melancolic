# Entre o silêncio — Netlify + Gemini

Esta versão mantém a estrutura visual da versão anterior do site e troca apenas a parte da IA por Gemini via Netlify Function.

## Estrutura

```text
melancolic-gemini-netlify/
├── assets/
│   ├── vibe.svg
│   ├── mascot-idle.svg
│   ├── mascot-wave.svg
│   ├── mascot-sleep.svg
│   └── mascot-hug.svg
├── netlify/
│   └── functions/
│       └── chat.mjs
├── index.html
├── style.css
├── script.js
├── netlify.toml
├── .env.example
└── README.md
```

## 1. Criar a chave do Gemini

Entre no Google AI Studio e crie uma API key para o Gemini. A documentação oficial recomenda guardar a chave em uma variável de ambiente chamada `GEMINI_API_KEY`; não coloque a chave em `index.html` ou `script.js`.

## 2. Publicar na Netlify

A forma mais simples é:

1. Crie um repositório no GitHub.
2. Envie o conteúdo inteiro desta pasta para o repositório.
3. Na Netlify, crie um novo site a partir do Git e escolha esse repositório.
4. Não coloque chave secreta no GitHub.
5. Em **Project configuration → Environment variables**, crie:

`GEMINI_API_KEY` = sua chave do Google AI Studio

`GEMINI_MODEL` = `gemini-3.5-flash-lite`

6. Publique o site.

O `netlify.toml` já configura a Function e transforma `/api/chat` em `/.netlify/functions/chat`.

## 3. Como a conversa funciona

```text
Seu celular/computador
        ↓
     index.html
        ↓
   POST /api/chat
        ↓
Netlify Function
        ↓
   Gemini API
        ↓
   resposta
        ↓
      site
```

A chave fica somente na Netlify. O navegador nunca recebe a chave do Gemini.

## 4. É realmente grátis?

Há uma camada gratuita da Gemini API, mas ela possui limites de uso. Nesta versão, o modelo padrão é `gemini-3.5-flash-lite`, que a tabela oficial de preços mostra com entrada e saída sem custo na camada gratuita.

A Netlify também tem um plano Free de US$0, com limite mensal de créditos. Portanto, para um projeto pessoal com tráfego pequeno, a combinação pode funcionar sem cobrança, desde que você permaneça dentro dos limites gratuitos dos dois serviços.

Importante: gratuito não significa ilimitado. Os limites de requisições do Gemini e o limite mensal da Netlify podem ser atingidos. A conta gratuita do Gemini também tem regras próprias de uso de dados; confira a política vigente da Google antes de usar o site para conteúdo sensível.

## 5. Segurança básica incluída

- a chave do Gemini fica no ambiente da Netlify;
- histórico limitado a 20 mensagens por chamada;
- mensagem limitada a 4.000 caracteres;
- rate limit simples de 20 requisições por IP em 10 minutos;
- nenhuma chave secreta no frontend.

## 6. Trocar o modelo

Você não precisa alterar o site. Basta mudar a variável `GEMINI_MODEL` na Netlify.

Exemplo:

`gemini-3.5-flash-lite`

## 7. Teste

Depois do deploy, abra o site, clique em **conversar**, escreva `Oi, tudo bem?` e envie.

Se aparecer erro, abra os logs da Function `chat` na Netlify.
