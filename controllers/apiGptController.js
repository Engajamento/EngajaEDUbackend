/**
 * @file apiGptController.js
 * @description Este arquivo é responsável por controlar as interações com a API do ChatGPT, como a geração de explicações para as questões.
 */

const connection = require('../dbConfig.js');
const WebSocket = require('ws');
const mongoose = require("mongoose");
const http = require('http');
const QuestaoModel = require("../Models/questaoModel.js")
const QuestionarioModel = require('../Models/questionarioModel.js');
const RespostasAluno = require('../Models/respostasModel.js');  // Importa o modelo
const bodyParser = require('body-parser')
const turmaController = require('./turmaController.js')
const webSocketController = require('../webSocketController.js');
// CONTROLLER PARA FUNÇÕES AUXILIARES
const nodemailer = require('nodemailer');
const axios = require('axios');
require('dotenv').config();
const { createChatCompletion, handleOpenAIError } = require('../utils/openaiAxios');
const { response } = require('express');

/**
 * @async
 * @function getChatGPTResponse
 * @description Envia um questionário para a API do ChatGPT e retorna o questionário com um campo de 'explicacao' adicionado a cada questão.
 * @param {Object} questionario - O questionário a ser enviado para a API.
 * @returns {Promise<Object>} O questionário com as explicações adicionadas.
 */
async function getChatGPTResponse(questionario) {
  try {
    const prompt = `
    Você é um assistente especializado em análise de questionários. Abaixo está um questionário em formato JSON. Para cada questão, por favor, adicione um campo 'explicacao' contendo uma breve descrição sobre a resposta correta. O questionário está no formato JSON. Retorne o questionário com o campo 'explicacao' adicionado para cada questão.
    Questionário. Retorne apenas o questionario atualizado, sem nenhum comentário adicional: 
    ${JSON.stringify(questionario)}
  ;`
    
    // Fazendo a chamada com axios usando nossa função utilitária
    const completion = await createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: prompt },
      ],
    });

    const messageContent = completion.choices[0].message.content;
    
    // Exibe a resposta gerada pelo modelo
    console.log("Resposta do ChatGPT:", messageContent);
    const parsedContent = JSON.parse(messageContent);

    return parsedContent;
  } catch (error) {
    console.error("Erro ao obter resposta:", error);
    handleOpenAIError(error);
  }
}






/**
 * @async
 * @function apiTeste
 * @description Rota de teste para a API do ChatGPT. Recebe um questionário, obtém a resposta do ChatGPT e a envia de volta.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function  apiTeste(request,response){
    const questionario = request.body;
    const chatGPTResponse = await getChatGPTResponse(questionario);
    response.status(200).send({ message: chatGPTResponse });

}

module.exports={
    apiTeste,
    getChatGPTResponse
    
}
