# Prime Repertório

PWA local-first para Chrome/Android. Letras, cifras e MP3 ficam no IndexedDB para funcionar sem internet; a cópia opcional na Vercel permite recuperar o repertório em outro aparelho sem colocar a rede no caminho do botão Play.

## Publicação na Vercel

1. Importe `brevMidias/repertorio` na Vercel.
2. No projeto, abra **Storage** → **Create Database** → **Blob**.
3. Crie o Blob com acesso **Private** e conecte Production e Preview.
4. Confirme que a Vercel adicionou `BLOB_READ_WRITE_TOKEN` ao projeto.
5. Faça um novo deploy.

Na tela **Preparação**, use **Salvar na Vercel**. Guarde o código da nuvem: ele funciona como a chave privada para restaurar a cópia em outro celular. Depois da restauração, os MP3 voltam ao IndexedDB e permanecem disponíveis offline.

## Verificação local

```sh
pnpm install
pnpm verify
```
