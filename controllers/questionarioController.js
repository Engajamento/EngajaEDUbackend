/**
 * @file questionarioController.js
 * @description Este arquivo é responsável por controlar as operações relacionadas a questionários, como buscar, carregar, e gerenciar o estado do questionário em tempo real.
 */

const connection = require('../dbConfig.js');
const WebSocket = require('ws');
const mongoose = require("mongoose");
const http = require('http');
const QuestaoModel = require("../Models/questaoModel.js")
const QuestionarioModel = require('../Models/questionarioModel.js');
const RespostasAluno = require('../Models/respostasModel.js');  // Importa o modelo
const auxController = require('./auxController.js');
//const questoes = mongoose.model('Questao', questaoModel);
const bodyParser = require('body-parser')
const turmaController = require('./turmaController.js')
const webSocketController = require('../webSocketController.js');
const { response } = require('express');
let codigoAleatorio="";

var questionario;
var numAlunos = 0;
var clientesId = [];
let clients = [];
let turma = [];
var questaoAtual = 0;
// lista de alunos que responderam a questão e estão esperando a próxima
let alunosProntos =[]
let listaAlunosConectados = [];
let requestQueue = [];
let canCallGetQuestionario = false;
let dadosEmailControle = [];
// Criando uma lista de objetos dinamicamente
const jsonParser = bodyParser.json();



/**
 * @async
 * @function getQuestionario
 * @description Busca todos os questionários.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function getQuestionario(req, res) {
  try {
    console.log('🔍 Iniciando busca de questionários por professor (via usuario)...');

    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario do professor é obrigatório' });
    }

    await connection();

    // 🔎 Busca o professor pelo usuario (ignora maiúsculas/minúsculas/acentos via collation)
    const professor = await mongoose.connection.db
      .collection('Professor')
      .findOne(
        { Usuario: String(usuario).trim() },
        {
          projection: { Questionarios: 1 },
          collation: { locale: 'pt', strength: 1 }, // strength:1 = case/acento insensitive
        }
      );

    if (!professor) {
      return res.status(404).json({ error: 'Professor não encontrado' });
    }

    const ids = Array.isArray(professor.Questionarios) ? professor.Questionarios : [];
    if (!ids.length) {
      return res.status(200).json([]); // professor sem questionários
    }

    // Garante ObjectId
    const objIds = ids.map((id) =>
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    // 📦 Busca os questionários relacionados
    const questionarios = await mongoose.connection.db
      .collection('Questionario')
      .find(
        { _id: { $in: objIds } },
        { projection: { _id: 1, codigo: 1, nome: 1, descricao: 1, data: 1 } }
      )
      .sort({ _id: -1 })
      .limit(100)
      .toArray();

    console.log(`📊 ${questionarios.length} questionários encontrados`);
    return res.status(200).json(questionarios);
  } catch (err) {
    console.error('❌ Erro ao buscar questionários:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}


  
/**
 * @async
 * @function getQuestionarioTeste
 * @description Busca um questionário de teste com o código '1'.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function getQuestionarioTeste(request, response){

    // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
    await connection(); 

        // Busca o questionário com código '1'
        let questionarioCarregado = await mongoose.connection.db.collection("Questionario").findOne({ codigo: '1' });

        if (!questionario) {
          console.log('Questionário não encontrado com o código: 1');
          return response.status(404).json({ message: 'Questionário não encontrado' });
        }
    
        // Busca as questões associadas ao questionário
        const questoes = await mongoose.connection.db.collection("Questao").find({ codigoQuestionario: questionario.codigo }).toArray();
    
        // Adiciona as questões ao questionário
        questionarioCarregado.questoes = questoes;
        questionario = questionarioCarregado
        console.log(questionario);
        response.json(questionario);
      
  }

  
  
  /**
 * @async
 * @function getQuestoes
 * @description Busca todas as questões.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
  async function getQuestoes(request, response){

    // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
    await connection(); 

        // Busca o questionário com código '1'
        //let questionarioCarregado = await mongoose.connection.db.collection("Questionario").findOne({ codigo: '1' });

        // if (!questionario) {
        //   console.log('Questionário não encontrado com o código: 1');
        //   return response.status(404).json({ message: 'Questionário não encontrado' });
        // }
    
        // Busca as questões associadas ao questionário
        const questoes = await mongoose.connection.db.collection("Questao").find().toArray();
    
        // Adiciona as questões ao questionário
        //questionarioCarregado.questoes = questoes;
        //questionario = questionarioCarregado
        console.log(questoes);
        response.json(questoes);
      
  }


/**
 * @function retornaQuestaoAtual
 * @description Retorna o número da questão atual.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function retornaQuestaoAtual(request,response){
    return response.json(questaoAtual);;
}

 
/**
 * @async
 * @function carregaQuestionario
 * @description Carrega um questionário e suas questões associadas com base no código do questionário.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function carregaQuestionario(request, response){
     const {codigoQuestionario} = request.body;
     // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
     await connection(); 
        // Busca o questionário com código '1'
     let questionarioCarregado = await mongoose.connection.db.collection("Questionario").findOne({codigo:codigoQuestionario});

    if (!questionarioCarregado) {
        console.log('Questionário não encontrado com o código: '+codigoQuestionario);
        return response.status(404).json({ message: 'Questionário não encontrado' });
    }

    // Busca as questões associadas ao questionário
    const questoes = await mongoose.connection.db.collection("Questao").find({ codigoQuestionario: questionarioCarregado.codigo }).toArray();

    // Adiciona as questões ao questionário
    questionarioCarregado.questoes = questoes;

    questionario = questionarioCarregado
    console.log(canCallGetQuestionario);
    console.log(questionario);
    response.json(questionario);



  
      
  }

  
/**
 * @async
 * @function getQuestionarioAluno
 * @description Libera o questionário para o aluno.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function getQuestionarioAluno(request, response){ //essa funcao libera o questionario pra todos os alunos
    const {matricula} = request.body;
    console.log("matricula recebida:"+matricula)
    // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
    await connection(); 
        // AQUI DEVE SER CHAMADA A FUNÇÃO QUE PROCESSA A MATRICULA DO ALUNO E RETORNA O QUESTIONÁRIO PERSONALIZADO
    

        //console.log(questionario)
        if(canCallGetQuestionario==true){
            console.log(canCallGetQuestionario);
            console.log(questionario);
            response.json(questionario);
        }
        else{
            console.log(canCallGetQuestionario)
                response.json("questionario não liberado");
            }
        // console.log(questionario)
        // response.json(questionario);


  
      
  }

//=======================================================
//WEBSOCKET
/**
 * @function wsConnection
 * @description Gerencia as conexões WebSocket.
 * @param {Object} ws - O objeto WebSocket.
 * @param {Object} request - O objeto de requisição.
 */
function wsConnection(ws, request) {
    console.log('🔌 Novo cliente WebSocket conectado');
    const clientId = Date.now();
    const newClient = { id: clientId, ws };
    clients.push(newClient);

    console.log(`📊 Total de clientes conectados: ${clients.length}`);

    ws.on('message', (message) => {
        console.log(`📩 Mensagem recebida do cliente ${clientId}: ${message}`);
    });

    ws.on('close', () => {
        console.log(`🔌 Cliente WebSocket desconectado: ${clientId}`);
        clients = clients.filter(client => client.id !== clientId);
        console.log(`📊 Total de clientes após desconexão: ${clients.length}`);
    });

    ws.send(JSON.stringify({ message: 'Conexão estabelecida' }));
}

/**
 * @function retornaPodio
 * @description Retorna o pódio dos alunos com as maiores pontuações.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function retornaPodio(request, response) {
    let podio = listaAlunosConectados.sort((a, b) => b["pontuacao"] - a["pontuacao"]);
    console.log(podio);
    return response.json(podio);
}

  
/**
 * @function liberaProximaQuestao
 * @description Libera a próxima questão para todos os alunos conectados.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function liberaProximaQuestao(request, response) {
    console.log("🚨🚨🚨 PROFESSOR CLICOU NO BOTÃO! 🚨🚨🚨");
    console.log("🚨 liberaProximaQuestao EXECUTADA!");

    const totalQuestoes = questionario?.questoes?.length || 0;
    const isFinal = (questaoAtual + 1) >= totalQuestoes;

    console.log("📊 Alunos conectados antes de mostrar posição:", listaAlunosConectados.length);
    console.log("📤 Enviando 'mostrar-posicao' para", clients.length, "clientes WebSocket");
    console.log("📋 Array clients:", clients.map(c => ({ id: c.id, readyState: c.ws.readyState })));

  
    sendToAllClients("mostrar-posicao");

    if (!isFinal) {
        setTimeout(() => {
            console.log("📤 Enviando 'nova-questao' para", clients.length, "clientes WebSocket");
            sendToAllClients("nova-questao");
        }, 3000);
    }
    
    questaoAtual += 1;
    console.log("Questão atual:", questaoAtual);
    response.json("Transição realizada");
}



// Rota específica para SSE

//rota que ficará escutando pela resposta do servidor. Virá do lado do aluno

/**
 * @function getProximaQuestao
 * @description Adiciona um novo cliente à lista de clientes que estão esperando a próxima questão.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function getProximaQuestao(request,response){
  
        console.log("aluno pedindo prox questão")
        const newClient = {
            id: Date.now(),
            response: response  
        };
        clients.push(newClient);
        console.log("aluno adicionado:",clients)
        
        const intervalId = setInterval(() => {
            //response.write(`data: ${JSON.stringify({ number: 8 })}\n\n`);
        }, 5000); // Envia dados a cada 5 segundos
}

/**
 * @function sendToAllClients
 * @description Envia uma mensagem para todos os clientes WebSocket conectados.
 * @param {string} message - A mensagem a ser enviada.
 */
function sendToAllClients(message) {
    console.log(`📤 Enviando mensagem para ${clients.length} clientes: "${message}"`);
    
    if (clients.length === 0) {
        console.log("⚠️ Nenhum cliente WebSocket conectado");
        return;
    }
    
    clients.forEach((client, index) => {
        try {
            if (client.ws && client.ws.readyState === 1) { // 1 = OPEN
                client.ws.send(message);
                console.log(`✅ Mensagem '${message}' enviada para cliente ${client.id}`);
            } else {
                console.log(`❌ Cliente ${client.id} não está conectado (readyState: ${client.ws?.readyState})`);
                // Remove clientes desconectados
                clients.splice(index, 1);
            }
        } catch (error) {
            console.error(`❌ Erro ao enviar para cliente ${client.id}:`, error.message);
            // Remove cliente com erro
            clients.splice(index, 1);
        }
    });
}

/**
 * @function addAlunoPronto
 * @description Adiciona um aluno à lista de alunos prontos para a próxima questão.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function addAlunoPronto(request,response){
    turmaController.getTurmaQuiz()
    console.log(turma);

}



/**
 * @function adicionarAluno
 * @description Adiciona um novo aluno à lista de alunos conectados.
 * @param {string} matricula - A matrícula do aluno.
 * @param {string} nome - O nome do aluno.
 */
function adicionarAluno(matricula, nome) {
  let aluno = {
    matricula: matricula,
    nome: nome,
    pontuacao: 0
  };
  var alunoConectado = false;
  listaAlunosConectados.forEach(item => {
    //console.log("aluno a ser verificado: "+ aluno.matricula)
    //console.log("item a ser verificado: "+ item.matricula)
    if(item.matricula==aluno.matricula){
        console.log("aluno já conectado")
        alunoConectado = true;
        return;;
    }
  });
  if(!alunoConectado)
  listaAlunosConectados.push(aluno);
}



/**
 * @function liberaQuestionario
 * @description Adiciona uma requisição à fila e, se as condições forem atendidas, busca o questionário e o envia para todos os clientes na fila.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function liberaQuestionario(request, response) {
    clientesId.push(request.id);
    requestQueue.push({ request, response });

    if (canCallGetQuestionario) {
    //if (requestQueue.length >= 5 && canCallGetQuestionario) {
        getQuestionario().then(result => {
            // Enviar a mesma resposta para todos os clientes na fila
            requestQueue.forEach(({ response }) => {
                response.json(result);
            });

            // Limpar a fila
            requestQueue = [];
            numAlunos = 0;  // Resetar o contador de alunos
        }).catch(error => {
            // Em caso de erro, enviar uma resposta de erro para todos os clientes na fila
            requestQueue.forEach(({ response }) => {
                response.status(500).json({ error: 'Erro no processamento' });
            });

            // Limpar a fila
            requestQueue = [];
            numAlunos = 0;  // Resetar o contador de alunos
        });
    } else {
        console.log("Esperando jogadores...");
        numAlunos++;
    }
}
/**
 * @async
 * @function carregaTurma
 * @description Carrega a turma com base no código da turma.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function carregaTurma(request,response){
    const {codigoTurma} = request.body;
    console.log("codigo Turma: "+codigoTurma)
    turma = await turmaController.getTurmaQuiz(codigoTurma)
    return response.status(200).end();
}
/**
 * @function conectarAluno
 * @description Conecta um aluno ao questionário.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function conectarAluno(request,response) {
    console.log("👨‍🎓 Tentativa de conexão do aluno:", request.body);
    const {matricula,codigo} = request.body;
    console.log("Código recebido:", codigo);
    console.log("Matrícula recebida:", matricula);
    var aluno = "";
    //console.log("Turma carregada:", JSON.stringify(turma, null, 2));
    //console.log(turma);
    if(codigo!=codigoAleatorio) {
        return response.status(500).json("código Invalido").end();
    }

    for (let item of turma) {

        if(item['Matricula']== matricula){
            console.log("ALUNO ENCONTRADO");
            aluno = item['Nome']
            break;
        }else{
            console.log(item['Matricula'])
        }
    }
       // Debug: Log do aluno encontrado
       console.log("Aluno encontrado:", aluno);
    if (aluno!="") {
        console.log("matricula do aluno: +",matricula)
        adicionarAluno(matricula, aluno);
        return response.status(200).json("aluno conectado");
    }else{
        return response.status(500).json("aluno não encontrado. Você está cadastrado na turma?").end();

    }
    console.log("✅ Aluno conectado com sucesso:", { matricula, codigo });
}
    
/**
 * @async
 * @function alunosConectados
 * @description Retorna a lista de alunos conectados.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function alunosConectados(request,response){
    console.log("alunos:",listaAlunosConectados)

    response.json((listaAlunosConectados));
}

/**
 * @function liberaQuestionario
 * @description Libera ou bloqueia o questionário para os alunos.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function liberaQuestionario(request,response){
    const {valor} = request.body;
    console.log('Recebida variavel:', valor);
    canCallGetQuestionario = valor;
    if(valor==false){
        questaoAtual=0;
    }
    response.status(200).json("questionario liberado");
}

/**
 * @function iniciaQuestionario
 * @description Inicia o questionário.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function iniciaQuestionario(request,response){
    console.log(canCallGetQuestionario)
    questaoAtual+=1;
    return response.json(canCallGetQuestionario);
}



/**
 * @async
 * @function gravarRespostas
 * @description Grava as respostas de um aluno no banco de dados.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function gravarRespostas(request,response) {
    try {
      // Extrai os dados recebidos
      var dados = request.body
      // Extrai os dados recebidos
      const { matricula, pontuacao, questoes, data } = dados;

      // Converte a pontuação para um número
      const pontuacaoValida = pontuacao ? parseInt(pontuacao) : null;
      //console.log(dados);
      //console.log(pontuacao);
      // Validação simples dos dados recebidos
      if (!matricula || !pontuacaoValida || !questoes || !Array.isArray(questoes) || !data) {
        throw new Error('Dados inválidos');
      }
      aluno = turmaController.findAluno(turma,matricula);
      console.log("email do aluno:"+aluno["email"]);
      await connection(); 
  
      // Cria um novo documento com as respostas do aluno
      const novaResposta = new RespostasAluno({
        matricula: matricula,
        pontuacao: pontuacao.$numberInt,  // Extraindo valor correto de pontuacao
        questoes: questoes,
        data: dados.data // Adicionando a data se fornecida
      });
      // Insere o novo documento na coleção RespostasAluno
    const resultado = await mongoose.connection.db.collection("RespostasAluno").insertOne(novaResposta);
    auxController.enviaEmail(aluno["email"],dados,questionario,pontuacao);
    response.status(200).json("salvo");
    } catch (error) {
      console.error('Erro ao salvar as respostas no banco de dados:', error);
      response.json("error");
    }
  }





/**
 * @function limparEstado
 * @description Limpa o estado do questionário, reiniciando todas as variáveis.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function limparEstado(request,response){
     questionario;
     numAlunos = 0;
     clientesId = [];
     clients = [];
     turma = [];
     questaoAtual = 0;
    // lista de alunos que responderam a questão e estão esperando a próxima
     alunosProntos =[]
     listaAlunosConectados = [];
     requestQueue = [];
     canCallGetQuestionario = false;
     response.status(200).json("estado do processo de questionario limpo");
}

 /**
 * @function salvaPontuacao
 * @description Salva a pontuação de um aluno.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function salvaPontuacao(request, response) {
    const { matricula, acertou } = request.body;

    const aluno = listaAlunosConectados.find(a => a.matricula == matricula);
    if (!aluno) return response.status(404).json({ error: 'Aluno não encontrado.' });

    if (typeof aluno.pontuacao !== 'number') aluno.pontuacao = 0;
    if (acertou === true) aluno.pontuacao += 1;

    return response.status(200).json({ pontuacao: aluno.pontuacao });
}

/**
 * @function gerarCodigo
 * @description Gera um código aleatório de 4 caracteres.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
function gerarCodigo(request,response) {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let codigo = '';
    const tamanho = 4;

    for (let i = 0; i < tamanho; i++) {
        const randomIndex = Math.floor(Math.random() * caracteres.length);
        codigo += caracteres[randomIndex];
    }
    console.log(codigo);
    codigoAleatorio=codigo;
    response.status(200).json(codigo).end();
}

/**
 * @async
 * @function getAssuntos
 * @description Busca todos os assuntos.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function getAssuntos(request, response) {
    try {
      // Conecta ao banco de dados (certifique-se de que a conexão está aberta)

      await connection();
      const assuntos = await mongoose.connection.db.collection("Assunto").find().toArray();
      response.json(assuntos);

    } catch (error) {
      console.error('Erro ao consultar a coleção Assunto:', error);
      response.status(500).json({ error: 'Erro ao consultar a coleção Assunto' });
    }
}

/**
 * @async
 * @function salvaRespostaUnica
 * @description Salva a resposta de uma única questão de um aluno.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function salvaRespostaUnica(request, response) {
    try {
        const { matricula, idQuestao, acertou } = request.body;

        if (matricula == null || idQuestao == null || typeof acertou !== "boolean") {
            return response.status(400).json({ error: "Campos obrigatórios ausentes ou inválidos" });
        }

        await connection();
        
        if (!questionario || !questionario.codigo) {
            return response.status(500).json({ error: "Questionário não disponível no escopo da rota" });
        }

        const idQuestionario = questionario.codigo;

        const novaResposta = {
            matricula: String(matricula).trim(),
            idQuestao,
            acertou,
            idQuestionario
        };
        console.log(novaResposta);

        await mongoose.connection.db.collection("RespostasAluno").insertOne(novaResposta);

        return response.status(201).json({ message: "Resposta salva com sucesso" });

    } catch (error) {
        console.error("Erro ao salvar resposta única:", error);
        return response.status(500).json({ error: "Erro interno" });
    }
}

/**
 * @async
 * @function criarColecaoRespostasAluno
 * @description Cria uma coleção de respostas para um aluno.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function criarColecaoRespostasAluno(request, response) {
  try {
    const { matricula } = request.body;
    const matriculaStr = String(matricula).trim(); // força string e tira espaços

    if (!matriculaStr) {
      return response.status(400).json({ error: "Campo obrigatório ausente" });
    }

    let nome = "";
    for (let item of turma) {
      if (String(item['Matricula']) === matriculaStr) {
        console.log("ALUNO ENCONTRADO");
        nome = item['Nome'];
        break;
      }
    }

    if (nome === "") {
      return response.status(404).json({ error: "Aluno não encontrado na turma" });
    }

    await connection();
    const db = mongoose.connection.db;
    const collection = db.collection("HistoricoAluno");

    if (!questionario || !questionario.codigo) {
      return response.status(500).json({ error: "Questionário não disponível no escopo da rota" });
    }

    const idQuestionario = questionario.codigo;

    const aluno = await collection.findOne({ matricula: matriculaStr });

    const novoQuestionario = {
      idQuestionario,
      respostas: []
    };

    if (!aluno) {
      await collection.insertOne({
        matricula: matriculaStr,
        nome,
        questionarios: [novoQuestionario]
      });

      return response.status(201).json({ message: "Documento criado com sucesso" });
    }

    const jaTem = aluno.questionarios?.some(q =>
      q.idQuestionario === idQuestionario
    );

    if (!jaTem) {
      await collection.updateOne(
        { matricula: matriculaStr },
        { $push: { questionarios: novoQuestionario } }
      );
    }

    return response.status(200).json({ message: "Coleção do aluno atualizada com sucesso" });

  } catch (err) {
    console.error("Erro ao criar coleção de respostas do aluno:", err);
    return response.status(500).json({ error: "Erro interno" });
  }
}

/**
 * @function retornaPosicao
 * @description Retorna a posição de um aluno no ranking.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
function retornaPosicao(req, res) {
    const { matricula } = req.body;

    if (!matricula || String(matricula).trim() === '') {
        return res.status(400).json({ error: 'Matrícula é obrigatória.' });
    }

    const matriculaNum = Number(matricula);

    // ✅ Verificar se a lista não está vazia
    if (listaAlunosConectados.length === 0) {
        console.log("❌ Lista de alunos conectados está vazia");
        return res.status(404).json({ error: 'Nenhum aluno conectado.' });
    }

    const ranking = [...listaAlunosConectados].sort((a, b) => b.pontuacao - a.pontuacao);
    const posicao = ranking.findIndex(aluno => aluno.matricula == matriculaNum);

    if (posicao === -1) {
        console.log("❌ Aluno não encontrado no ranking. Matrícula:", matriculaNum);
        console.log("📋 Alunos disponíveis:", ranking.map(a => ({ matricula: a.matricula, nome: a.nome })));
        return res.status(404).json({ error: 'Aluno não encontrado no ranking.' });
    }

    const aluno = ranking[posicao];

    console.log("✅ Posição encontrada:", { 
        matricula: aluno.matricula, 
        nome: aluno.nome, 
        posicao: posicao + 1 
    });

    return res.status(200).json({
        nome: aluno.nome, // ✅ Usar 'nome' ao invés de 'Nome'
        matricula: aluno.matricula,
        pontuacao: aluno.pontuacao,
        posicao: posicao + 1
    });
}


module.exports = {
    getQuestionario,
    getProximaQuestao,
    liberaQuestionario,
    iniciaQuestionario,
    getQuestionarioAluno,
    conectarAluno,
    alunosConectados,
    liberaProximaQuestao,
    addAlunoPronto,
    carregaTurma,
    salvaPontuacao,
    wsConnection,
    retornaPodio,
    retornaQuestaoAtual,
    limparEstado,
    getQuestionarioTeste,
    carregaQuestionario,
    gravarRespostas,
    gerarCodigo,
    getQuestoes,
    getAssuntos,
    salvaRespostaUnica,
    criarColecaoRespostasAluno,
    retornaPosicao
};
