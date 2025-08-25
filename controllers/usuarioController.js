/**
 * @file usuarioController.js
 * @description Este arquivo é responsável por controlar as operações relacionadas a usuários, como login e cadastro.
 */

const connection = require('../../dbConfig.js');
const WebSocket = require('ws');
const mongoose = require("mongoose");
const http = require('http');
const QuestaoModel = require("../../Models/questaoModel.js")
const QuestionarioModel = require('../../Models/questionarioModel.js');
const UsuarioModel = require('../../Models/usuarioModel.js');
const RespostasAluno = require('../../Models/respostasModel.js');  // Importa o modelo
//const questoes = mongoose.model('Questao', questaoModel);
const bodyParser = require('body-parser')
const turmaController = require('./turmaController.js')
const fs = require('fs');
const bcrypt = require('bcrypt');
// CONTROLLER PARA FUNÇÕES AUXILIARES

//envia email para o email de engajamento com uma lista de alunos que participaram do quesitonário
/**
 * @async
 * @function getUsuario
 * @description Verifica se um usuário existe e se a senha está correta.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function getUsuario(request, response) {
  try {
    await connection();
    const { usuario, senha } = request.body;

    const usuarioCadastrado = await UsuarioModel.findOne({ usuario: usuario });

    if (!usuarioCadastrado) {
      console.log('Usuário não encontrado.');
      return false;
    }

    const isMatch = await usuarioCadastrado.compararSenha(senha);
    if (isMatch) {
      console.log('Login autorizado!');
      response.status(200).json({ autorizado: true,message: "Usuario autorizado"});

    } else {
      console.log('Usuario ou senha incorretos.');
      return false;
    }
  } catch (err) {
    console.error('Erro ao buscar/verificar usuário:', err.message);
    return false;
  }
}

/**
 * @async
 * @function saveUsuario
 * @description Salva um novo usuário no banco de dados.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function saveUsuario(req, response) {
  try {
    const { usuario, senha } = req.body;
    await connection();
    const novoUsuario = new UsuarioModel({
      usuario: usuario,
      senha: senha 
    });

    await novoUsuario.save();
    console.log('Usuário inserido com sucesso!');
    response.status(200).json({ success: true, message: "Usuário Cadastrado!" });
  } catch (err) {
    console.error('Erro ao inserir usuário:', err.message);
  }
}
 
module.exports={
    saveUsuario,
    getUsuario
}
