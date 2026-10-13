# Atualização do Melancolic — “Minha pausa”

Este pacote adiciona à versão principal do Melancolic:

- check-in emocional com sete opções e intensidade de 1 a 5;
- perguntas reflexivas que mudam conforme o sentimento escolhido;
- anotações opcionais para cada check-in;
- mapa visual dos últimos 14 dias e histórico recente;
- exercício de respiração guiada de 60 segundos, com opção de parar;
- armazenamento local separado, sem alterar o banco de dados existente do diário.

## Como aplicar no repositório

1. Faça uma cópia de segurança do repositório.
2. Na raiz do repositório `nickebel/melancolic`, substitua o `index.html` pelo deste pacote.
3. Adicione `mood.css` e `mood.js` à raiz do repositório.
4. **Não apague nem substitua** os arquivos existentes `script.js`, `style.css`, `assets/` ou `netlify/`.
5. Faça commit e publique pelo mesmo fluxo que já usa para o site.

O HTML mantém os identificadores usados pelo `script.js` original e o novo recurso usa uma chave de `localStorage` separada (`melancolic-mood-checkins-v1`). Assim, os desabafos e mídias já armazenados em IndexedDB não são removidos nem migrados.

## Observações

- Os check-ins ficam no navegador e dispositivo em que foram feitos; não sincronizam automaticamente entre aparelhos.
- A seção é uma ferramenta pessoal de reflexão, não um diagnóstico clínico.
- Recomendado testar localmente ou em uma publicação de pré-visualização antes de substituir a versão pública.
