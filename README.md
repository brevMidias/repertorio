# Prime Repertório

PWA local-first para Chrome/Android. Letras, cifras e MP3 ficam no IndexedDB para funcionar sem internet; a cópia opcional na Vercel permite recuperar o repertório em outro aparelho sem colocar a rede no caminho do botão Play.

## Publicação na Vercel

1. Importe `brevMidias/repertorio` na Vercel.
2. No projeto, abra **Storage** → **Create Database** → **Blob**.
3. Crie o Blob com acesso **Private** e conecte Production e Preview.
4. Confirme que a Vercel adicionou `BLOB_READ_WRITE_TOKEN` ao projeto.
5. Faça um novo deploy.

O repertório é carregado automaticamente da Vercel e toda criação, edição, exclusão ou troca de MP3 é sincronizada em seguida. O IndexedDB mantém uma cópia local para uso offline e para iniciar a reprodução sem esperar a rede. A tela **Preparação** também oferece **Sincronizar agora** e **Restaurar da Vercel** como ações de recuperação manual.

## Verificação local

```sh
pnpm install
pnpm verify
```
