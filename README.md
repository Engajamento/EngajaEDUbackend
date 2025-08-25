# Backend EngajaMais

Este é o backend da aplicação EngajaMais. Ele é responsável por gerenciar a lógica de negócio, a comunicação com o banco de dados e a API para o frontend.

## Descrição

O backend é construído com Node.js e Express. Ele utiliza um banco de dados MySQL para persistir os dados e o BullMQ para gerenciar filas de processamento de áudio. A API é utilizada pelo frontend para buscar e enviar dados.

## Scripts

- `npm test`: Roda os testes da aplicação. (Atualmente, não há testes configurados).

## Dependências

- **axios**: Cliente HTTP para fazer requisições para a API do OpenAI.
- **body-parser**: Middleware para fazer o parse do corpo das requisições.
- **bullmq**: Sistema de filas para processamento de áudio em background.
- **cors**: Middleware para habilitar o CORS.
- **csvtojson**: Biblioteca para converter arquivos CSV para JSON.
- **dotenv**: Biblioteca para carregar variáveis de ambiente de um arquivo `.env`.
- **expo-build-properties**: Biblioteca para configurar propriedades de build do Expo.
- **express**: Framework web para Node.js.
- **fluent-ffmpeg**: Biblioteca para manipulação de áudio.
- **form-data**: Biblioteca para criar `multipart/form-data` streams.
- **https**: Módulo para criar um servidor HTTPS.
- **ioredis**: Cliente Redis para o BullMQ.
- **mongodb**: Driver oficial do MongoDB para Node.js.
- **mongoose**: ODM para o MongoDB.
- **multer**: Middleware para upload de arquivos.
- **mysql**: Driver do MySQL para Node.js.
- **nodemailer**: Biblioteca para envio de emails.
- **openai**: Biblioteca para a API do OpenAI.
- **pg**: Driver do PostgreSQL para Node.js.
- **request**: Biblioteca para fazer requisições HTTP.
- **uuid**: Biblioteca para gerar UUIDs.
- **ws**: Biblioteca para WebSockets.

## Instalação

1. Clone o repositório.
2. Instale as dependências com `npm install`.
3. Crie um arquivo `.env` na raiz do projeto e adicione as variáveis de ambiente necessárias.
4. Inicie o servidor com `node index.js`.