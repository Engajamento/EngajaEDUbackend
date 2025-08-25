/**
 * @file auxController.js
 * @description Este arquivo é responsável por funções auxiliares, como o envio de emails.
 */

const connection = require('../dbConfig.js');
const WebSocket = require('ws');
const mongoose = require("mongoose");
const http = require('http');
const QuestaoModel = require("../Models/questaoModel.js")
const QuestionarioModel = require('../Models/questionarioModel.js');
const RespostasAluno = require('../Models/respostasModel.js');  // Importa o modelo
//const questoes = mongoose.model('Questao', questaoModel);
const bodyParser = require('body-parser')
const turmaController = require('./turmaController.js')
const webSocketController = require('../webSocketController.js');
const { response } = require('express');
const fs = require('fs');
// CONTROLLER PARA FUNÇÕES AUXILIARES
const nodemailer = require('nodemailer');

// Configura o transporte SMTP
let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'emailengajamentoservico@gmail.com', // Seu e-mail
        pass: 'uxlj dxpb fzdm lklj' // Senha de aplicativo gerada
    }
});

/**
 * @function carregarTemplateEmail
 * @description Carrega o template HTML do email e substitui os placeholders com os dados do aluno.
 * @param {number} totalErros - O número total de erros do aluno.
 * @param {string} data - A data do questionário.
 * @param {Array<string>} assuntosErrados - A lista de assuntos que o aluno errou.
 * @param {number} pontuacao - A pontuação do aluno.
 * @returns {string} O template HTML do email com os dados substituídos.
 */
function carregarTemplateEmail(totalErros, data, assuntosErrados,pontuacao) {
    let template = fs.readFileSync('./resources/emailTemplate.html', 'utf8');
    if(assuntosErrados>0){
        let template = fs.readFileSync('./resources/emailTemplate.html', 'utf8');
        // Substitui os placeholders pelas variáveis dinâmicas
        template = template.replace('{{totalErros}}', totalErros);
        template = template.replace('{{data}}', data);
        template = template.replace('{{assuntosErrados}}', assuntosErrados.map(assunto => `<li class="erro-item">${assunto}</li>`).join(''));
    }else{
        template = fs.readFileSync('./resources/emailTemplateAcerto.html', 'utf8');
        // Substitui os placeholders pelas variáveis dinâmicas
        //template = template.replace('{{totalErros}}', totalErros);
        template = template.replace('{{data}}', data);
        template = template.replace('{{pontuacao}}', pontuacao);

    }

  
    return template;
  }
  

/**
 * @function enviaEmail
 * @description Envia um email de relatório de desempenho para o aluno.
 * @param {string} email - O email do aluno.
 * @param {Object} dadosAluno - Os dados do aluno, incluindo as questões respondidas.
 * @param {Object} questionario - O questionário que o aluno respondeu.
 */
  function enviaEmail(email, dadosAluno, questionario) {
    // Filtra as questões que o aluno errou
    let questoesErradas = dadosAluno.questoes.filter(questao => !questao.acertou);
    //console.log(questoesErradas);
    // Mapeia os temas das questões erradas, garantindo que os IDs sejam comparados corretamente
    let temasErrados = questoesErradas.map(questaoErrada => {
        let questaoInfo = questionario.questoes.find(q => String(q._id) === String(questaoErrada.idQuestao));
        console.log(questaoInfo); // Debug: Verifique se a questão é encontrada corretamente
        return questaoInfo ? questaoInfo.tema : 'Tema não encontrado';
    });

    // Set para evitar repetição de texto/temas no email
    let temasErradosArray = Array.from(new Set(temasErrados)); // Converte o Set em um array
    const emailHTML = carregarTemplateEmail(questoesErradas.length, questionario.nome, temasErradosArray,pontuacao);


    // Configura os detalhes do e-mail
    let mailOptions = {
        from: 'emailengajamentoservico@gmail.com',
        to: email, // E-mail do destinatário
        subject: 'Relatório de Desempenho - Questões Erradas',
        html: emailHTML
    };

    // Envia o e-mail somente para quem errou alguma questao
    if(questoesErradas.length > 0) {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
            console.log('E-mail enviado: ' + info.response);
        });
    }
}

/**
 * @function enviaListaControle
 * @description Envia uma lista de controle de alunos que participaram do questionário.
 * @param {Array<Object>} listaDadosAlunos - A lista de dados dos alunos.
 */
function enviaListaControle(listaDadosAlunos){
}

module.exports={
    enviaEmail,
}