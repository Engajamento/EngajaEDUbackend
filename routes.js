/**
 * @file routes.js
 * @description Este arquivo define as rotas da API do backend. Cada rota é associada a um controlador que lida com a lógica de negócio.
 */

const express = require('express');
const routes = express.Router();
const apiCallFromRequest = require('./Request')
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json();
const turmaController = require('./controllers/turmaController')
const auxController = require('./controllers/auxController')
const questionarioController = require('./controllers/questionarioController')
const chatGptApiController = require('./controllers/apiGptController')
const grmQuestionarioController = require('./controllers/grmQuestionarioController')
const webSocketController = require('./webSocketController')
const { sendToAllClients } = require('./webSocketController');
const multer = require('multer');
const upload = multer({ dest: 'temp/',
    limits: { fileSize: 200 * 1024 * 1024 }
 }); // salva temporariamente, depois move para a pasta da sessão
const audioSessionController = require('./controllers/audioSessionController');
const audioController = require('./controllers/audioController');

// Rotas para o controlador de turmas.
routes.get('/turma',turmaController.getTurma);
routes.get('/getTurmas',turmaController.getTurmas);
// Rotas para o controlador de questionários.
routes.get('/Questionarios',questionarioController.getQuestionario);
routes.get('/gerarCodigo',questionarioController.gerarCodigo);
routes.post('/carregaQuestionario',jsonParser,questionarioController.carregaQuestionario);
routes.post('/getTurmaTeste',jsonParser,turmaController.getTurmaTeste);
routes.post('/cadastraQuestionario',jsonParser,grmQuestionarioController.cadastraQuestionario);
routes.post('/updateQuestionario',jsonParser,grmQuestionarioController.atualizaQuestionario);
routes.post('/deletarQuestionario',jsonParser,grmQuestionarioController.deletarQuestionario);
routes.get('/getQuestionarioTeste',questionarioController.getQuestionarioTeste);
routes.get('/retornaQuestaoAtual',questionarioController.retornaQuestaoAtual);
routes.post('/conectarAluno',jsonParser,questionarioController.conectarAluno);
routes.post('/gravarRespostas',jsonParser,questionarioController.gravarRespostas );
routes.post('/enviaEmail',jsonParser,auxController.enviaEmail );
routes.post('/salvaPontuacao',jsonParser,questionarioController.salvaPontuacao);
routes.get('/alunosConectados',questionarioController.alunosConectados);
routes.get('/getQuestoes',questionarioController.getQuestoes);
routes.post('/getQuestionarioAluno',jsonParser,questionarioController.getQuestionarioAluno);
routes.get('/proxQuestao',questionarioController.getProximaQuestao);
routes.post('/conectaQuestionario',jsonParser,questionarioController.liberaQuestionario);
//routes.get('/enableGetQuestionario',questionarifoController.enableGetQuestionario);
routes.get('/iniciaQuestionario',questionarioController.iniciaQuestionario);
routes.get('/liberaProximaQuestao',questionarioController.liberaProximaQuestao);
//funcionando
routes.post('/carregaturma',jsonParser,questionarioController.carregaTurma);
routes.get('/retornaPodio',questionarioController.retornaPodio);
routes.get('/limparEstado',questionarioController.limparEstado);
routes.get('/getAssuntos',questionarioController.getAssuntos);
//--rotas chatGptApi
//routes.post('/getGptApi',jsonParser,chatGptApiController.apiTeste);
routes.post('/salvaRespostaUnica',questionarioController.salvaRespostaUnica);
routes.post('/criarColecaoRespostasAluno',jsonParser,questionarioController.criarColecaoRespostasAluno);
routes.post('/retornaPosicao',jsonParser,questionarioController.retornaPosicao);
// Rotas para o controlador de áudio.
routes.post('/audio/split', upload.single('audio'), audioController.dividirAudio);
routes.post('/audio/transcribe', upload.single('audio'), audioController.transcreverAudio);
//Audio session
// Rotas para o controlador de sessão de áudio.
routes.post('/audioSession/upload', upload.single('audio'), audioSessionController.uploadAudio);
routes.post('/audioSession/split', audioSessionController.splitAudio);
routes.post('/audioSession/transcribe', audioSessionController.transcribeChunk);
routes.post('/audioSession/concat', audioSessionController.concatAndCleanup);
routes.post('/audioSession/transcribeAll', audioSessionController.transcribeAll);
routes.get('/audioSession/progress', audioSessionController.getProgress);
routes.post('/audioSession/generateQuestions', audioSessionController.generateQuestions);
routes.post('/audioSession/retryChunks', audioSessionController.retryChunks);


module.exports = routes;



