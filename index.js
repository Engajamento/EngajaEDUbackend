/**
 * @file index.js
 * @description Este é o arquivo principal do backend da aplicação EngajaMais.
 * Ele é responsável por iniciar o servidor, configurar as rotas, o CORS,
 * o WebSocket e o tratamento de erros.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

// Seus módulos locais
const db = require('./dbConfig.js');
const mysql = require('mysql');
const routes = require('./routes.js');
const webSocketController = require('./webSocketController');
const fs = require('fs');

const app = express();

// Detecta ambiente
const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.RENDER === 'true' ||
  process.env.AWS === 'true';

const PORT = process.env.PORT || 5001;

console.log('🌍 Ambiente detectado:', isProduction ? 'PRODUÇÃO (AWS)' : 'DESENVOLVIMENTO (Local)');

// Origens permitidas
const allowedOrigins = [
  // PRODUÇÃO
  'https://teacher.engajedu.com.br',
  'https://engajedu.com.br',
  'https://www.engajedu.com.br',

  // DEV
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://192.168.1.173:5173',
  'http://192.168.1.173:5175',
  'http://192.168.1.173:8081',
  'exp://192.168.1.173:8081',
];

// Configuração do CORS
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl, apps nativos etc.
    if (allowedOrigins.includes(origin)) return cb(null, true);

    // permite subdomínios *.engajedu.com.br
    try {
      const hostname = new URL(origin).hostname;
      if (hostname.endsWith('.engajedu.com.br')) return cb(null, true);
    } catch (_) {}

    console.log('❌ CORS bloqueado para:', origin);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // ⚠️ dica: se usar headers customizados (ex.: x-api-key), adicione aqui
  // allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key'],
  optionsSuccessStatus: 204,
};

// Aplica CORS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middlewares
app.use(express.json());
app.use(bodyParser.json());

// Log de requisições (apenas em dev)
app.use((req, _res, next) => {
  if (!isProduction) {
    console.log(`📡 ${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
  }
  next();
});

// Health check
app.get('/', (_req, res) => {
  res.json({
    message: 'EngajaMais Backend está funcionando!',
    ambiente: isProduction ? 'Produção (AWS)' : 'Desenvolvimento (Local)',
    timestamp: new Date().toISOString(),
  });
});

// Rotas da aplicação
app.use(routes);

// Servidor HTTP + WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔌 Nova conexão WebSocket estabelecida');
  webSocketController.handleConnection(ws);
});

// Inicia servidor
if (isProduction) {
  server.listen(PORT, () => {
    console.log('🚀 [AWS] Servidor rodando na porta', PORT);
    console.log('🌐 [AWS] Sugestão de acesso via Nginx/HTTPS: https://api.engajedu.com.br');
    console.log('🔌 [AWS] WebSocket disponível');
  });
} else {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [LOCAL] Servidor rodando na porta ${PORT}`);
    console.log(`🌐 [LOCAL] URLs: http://localhost:${PORT} | http://192.168.1.173:${PORT}`);
    console.log('🔌 [LOCAL] WebSocket disponível nas URLs acima');
  });
}

// Tratamento de erros globais
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('❌ Promise rejeitada:', reason);
});

// Mantém vivo em produção
if (isProduction) {
  setInterval(() => {
    console.log('💓 Keep-alive ping');
  }, 14 * 60 * 1000);
}
