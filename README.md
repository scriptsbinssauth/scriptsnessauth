```markdown
# ScriptsNessAuth

Versão com sistema de contas — apenas arquivos .lua e .txt são permitidos. Cada conta vê e gerencia os seus próprios arquivos (cada upload fica no diretório do usuário).

Formato de loadstring gerado pelo frontend:

loadstring(game:HttpGet("https://<seu-host>/raw/<seu-username>/<nome-do-arquivo>"))()

## Requisitos

- Node.js 16+ (ou compatível)
- npm

## Instalação

1. Clone ou copie os arquivos para uma pasta.
2. No diretório do projeto, rode:
```bash
npm install
```

## Uso

Para iniciar:
```bash
npm start
```

Abra http://localhost:3000 no seu navegador.

Funcionalidades:
- Registro/Login com senha (banco JSON simples em data/users.json).
- Upload apenas de .lua e .txt.
- Cada usuário lista apenas os seus arquivos.
- Raw URLs incluem o username (ex: /raw/alice/161234-file.lua) — útil para uso em loadstring.
- O sistema usa sessões (cookies) para autenticação.

Observações:
- Este exemplo usa um banco simples em data/users.json e serve como protótipo. Em produção, use um banco real (Postgres/MySQL/SQLite) e uma store de sessão persistente.
- Tenha cuidado ao hospedar e executar scripts baixados de fontes não confiáveis.
```
