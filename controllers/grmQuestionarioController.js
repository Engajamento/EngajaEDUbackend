/**
 * @file grmQuestionarioController.js
 * @description Este arquivo é responsável por controlar as operações de gerenciamento de questionários, como cadastrar, atualizar e deletar questionários.
 */

const connection = require('../dbConfig.js');
const WebSocket = require('ws');
const mongoose = require("mongoose");
const http = require('http');
const QuestaoModel = require("../Models/questaoModel.js")
const QuestionarioModel = require('../Models/questionarioModel.js');
const RespostasAluno = require('../Models/respostasModel.js');  // Importa o modelo
const apiGptController = require('./apiGptController.js');
//const questoes = mongoose.model('Questao', questaoModel);
const bodyParser = require('body-parser')
const turmaController = require('./turmaController.js')
const webSocketController = require('../webSocketController.js');
const { response } = require('express');




/**
 * @async
 * @function cadastraQuestionario
 * @description Cadastra um novo questionário e suas questões associadas.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function cadastraQuestionario(request, response) {

  console.log("rota chamada");
  const { usuario } = request.query;
  if (!usuario) {
    return response.status(400).json({ success: false, message: 'usuario do professor é obrigatório' });
  }

  const { questionario } = request.body || {};
  if (!questionario?.nome || !Array.isArray(questionario?.questoes) || questionario.questoes.length === 0) {
    return response.status(400).json({ success: false, message: 'Payload inválido: informe nome e pelo menos uma questão' });
  }

  await connection();
  const session = await mongoose.startSession();

  let novoQuestionario = null;

  try {
    // Inicia transação para criar Questionário + Questões
    session.startTransaction();

    // 1) Criar e salvar o questionário
    novoQuestionario = new QuestionarioModel({
      nome: questionario.nome,
      descricao: questionario.descricao,
      codigo: questionario.codigo || (await gerarCodigoQuestionario()),
      data: new Date()
      // explicacao: questionarioAux?.explicacao
    });

    await novoQuestionario.save({ session });

    // 2) Salvar as questões associadas ao questionário
    const questoes = questionario.questoes.map((q) => ({
      enunciado: q.enunciado,
      resposta: normalizaResposta(q.resposta),
      tema: q.tema,
      codigoQuestionario: novoQuestionario.codigo
    }));

    await QuestaoModel.insertMany(questoes, { session });

    // 3) Commit da transação de criação
    await session.commitTransaction();
    response.status(200).json({
      success: true,
      message: 'Questionário e questões cadastrados com sucesso!',
      questionario: novoQuestionario
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Erro ao cadastrar questionário e questões:', error);
    return response.status(500).json({
      success: false,
      message: 'Erro ao cadastrar questionário e questões.',
      error: error?.message || error
    });
  } finally {
    await session.endSession();
    console.log('Sessão finalizada.');
  }

  
  // ---- PASSO 2: (re)abrir conexão e vincular ao Professor por usuario ----
  try {
    await connection(); // conforme solicitado, abre novamente
    const profUpdate = await mongoose.connection.db
      .collection('Professor')
      .updateOne(
        { Usuario: String(usuario).trim() },                // campo "Usuario" na coleção
        { $addToSet: { Questionarios: novoQuestionario._id } },
        { collation: { locale: 'pt', strength: 1 } }        // case/acento insensitive
      );
      
    if (profUpdate.matchedCount === 0) {
      // professor não encontrado -> limpa o que foi criado para não ficar órfão
      await Promise.all([
        QuestaoModel.deleteMany({ codigoQuestionario: novoQuestionario.codigo }),
        QuestionarioModel.deleteOne({ _id: novoQuestionario._id })
      ]);

      // Opcional: alterar a resposta já enviada não é possível; loga o problema
      console.warn(
        'Professor não encontrado para vincular questionário. Questionário e questões removidos.',
        { usuario }
      );
    } else {
      console.log('Questionário vinculado ao professor com sucesso.');
    }
  } catch (linkError) {
    console.error('Erro ao vincular questionário ao professor:', linkError);
    // aqui não retornamos outra resposta (já respondemos sucesso acima); apenas log
  }
  }
  
  /**
 * @async
 * @function gerarCodigoQuestionario
 * @description Gera um novo código para um questionário com base no último código existente.
 * @returns {Promise<string>} O novo código do questionário.
 */
  async function gerarCodigoQuestionario() {
    await connection(); // Garante a conexão com o banco
    const questionarios = await QuestionarioModel.find({}, { codigo: 1 }).lean();

    if (!questionarios || questionarios.length === 0) {
      return '1'; // Primeiro código
    }

    const codigosNumericos = questionarios
      .map(q => parseInt(q.codigo))
      .filter(c => !isNaN(c));

    const maiorCodigo = Math.max(...codigosNumericos);

    console.log(maiorCodigo + 1);
    return (maiorCodigo + 1).toString();
}
  
 /**
 * @function normalizaResposta
 * @description Normaliza a resposta de uma questão para 'V' ou 'F'.
 * @param {string} resposta - A resposta a ser normalizada.
 * @returns {string} A resposta normalizada.
 */
  function normalizaResposta(resposta){
    if (typeof resposta === 'string') {
      resposta = resposta.toLowerCase(); // Converter para minúsculo para evitar problemas com maiúsculas/minúsculas
    }
    
    if (resposta === 'v' || resposta === 'verdadeiro' || resposta === 'true' || resposta ==="Verdadeiro") {
      return 'V';
    } else if (resposta === 'f' || resposta === 'falso' || resposta === 'false' || resposta === "Falso") {
      return 'F';
    } else {
      throw new Error(`Resposta inválida: ${resposta}`); // Caso a resposta não seja válida
    }
  }

/**
 * @async
 * @function deletarQuestionario
 * @description Deleta um questionário e suas questões associadas.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function deletarQuestionario(request, response) {
  const { codigoQuestionario } = request.body;
  const { usuario } = request.query;

  console.log(usuario);

  if (!usuario) {
    return response.status(400).json({ success: false, message: 'usuario é obrigatório na query.' });
  }

  await connection();

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 0) Localiza o questionário para obter o _id
    const questionario = await mongoose.connection.db
      .collection('Questionario')
      .findOne({ codigo: codigoQuestionario }, { session });

    if (!questionario) {
      await session.abortTransaction();
      return response.status(404).json({
        success: false,
        message: 'Questionário não encontrado pelo código informado.'
      });
    }

    const questionarioId = questionario._id;

    // 1) Remove a referência SOMENTE do professor informado (coleção "Professor", campo "Usuario")
    // cobre ObjectId e string (caso o array misture tipos)
    const inSet = [questionarioId, questionarioId.toString()];
    await mongoose.connection.db
      .collection('Professor')
      .updateOne(
        {
          Usuario: String(usuario).trim(),
          Questionarios: { $in: inSet }
        },
        {
          $pull: { Questionarios: { $in: inSet } }
        },
        {
          session,
          collation: { locale: 'pt', strength: 1 } // case/acento insensitive
        }
      );

    // 2) Deleta questões associadas a esse questionário
    await QuestaoModel.deleteMany({ codigoQuestionario }, { session });

    // 3) Deleta o próprio questionário
    await QuestionarioModel.deleteOne({ _id: questionarioId }, { session });

    await session.commitTransaction();

    return response.status(200).json({
      success: true,
      message: 'Questionário removido com sucesso.'
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Erro ao deletar questionário e vínculos:', error);
    return response.status(500).json({
      success: false,
      message: 'Erro ao deletar questionário, questões ou referência no Professor.',
      error: error?.message ?? String(error)
    });
  } finally {
    session.endSession();
  }
}
  

/**
 * @async
 * @function atualizaQuestionario
 * @description Atualiza um questionário e suas questões associadas.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function atualizaQuestionario(request, response) {

    const { questionario } = request.body;
    console.log("Questionário:", questionario);
    if (!questionario) {
        return response.status(400).json({ error: "Erro ao ler o questionário" });
    }
    //conecta ao banco
    await connection(); 
    const session = await mongoose.startSession();
    try {
        session.startTransaction(); // Inicia a transação
        // 1. Buscar o questionário existente pelo código e atualizar
        console.log(questionario.codigo);
        const questionarioExistente = await QuestionarioModel.findOneAndUpdate(
          { codigo: questionario.codigo },
          { 
              nome: questionario.nome,
              descricao: questionario.descricao
          },
          { new: true, session }
      );
        
        if (!questionarioExistente) {
            throw new Error('Questionário não encontrado');
        }
        else{"questionario encontrado"}
        // 2. Remover questões antigas associadas ao questionário
        await QuestaoModel.deleteMany({ codigoQuestionario: questionario.codigo }, { session });

        // 3. Adicionar as novas questões ao questionário
        const questoes = questionario.questoes.map(questaoData => ({
            enunciado: questaoData.enunciado,
            resposta: normalizaResposta(questaoData.resposta),
            tema: questaoData.tema,
            codigoQuestionario: questionario.codigo
        }));
        
        // Inserir as novas questões em lote
         await QuestaoModel.insertMany(questoes, { session });

        // Commit da transação
        await session.commitTransaction();
        response.status(200).json({ success: true, message: "Questionário e questões atualizados com sucesso!", questionario: questionarioExistente });
    } catch (error) {
        await session.abortTransaction(); // Aborta a transação em caso de erro
        console.error('Erro ao atualizar questionário e questões:', error);
        response.status(500).json({ success: false, message: 'Erro ao atualizar questionário e questões.', error });
    } finally {
        session.endSession(); // Finaliza a sessão
        console.log("Sessão finalizada.");
    }
}


  module.exports = {
    cadastraQuestionario,
    deletarQuestionario,
    atualizaQuestionario
}
