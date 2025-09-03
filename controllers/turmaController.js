/**
 * @file turmaController.js
 * @description Este arquivo é responsável por controlar as operações relacionadas a turmas, como buscar turmas e alunos.
 */

const connection = require('../dbConfig.js');
const WebSocket = require('ws');
const mongoose = require("mongoose");
const alunoModel = require("../Models/alunoModel.js")
const Aluno = mongoose.model('Aluno', alunoModel);




/**
 * @async
 * @function getTurmaQuiz
 * @description Busca os alunos de uma turma específica ou todos os alunos se o código da turma for 0.
 * @param {number} codigoTurma - O código da turma a ser buscada.
 * @returns {Promise<Array<Object>>} Uma lista de alunos.
 */
async function getTurmaQuiz(codigoTurma) {
    try {
      // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
      await connection(); 
      console.log("codigo turma recebido:"+codigoTurma);
      // Verifica se a coleção "aluno" existe
      if(codigoTurma!=0){
        const alunos = await mongoose.connection.db.collection("Aluno").find({Turmas:codigoTurma}).toArray();
        console.log(alunos);
        return alunos;
      }
      else{
         const alunos = await mongoose.connection.db.collection("Aluno").find().toArray();
         console.log(alunos);
         return alunos;
        }
      // Retorna o resultado
      //descomentar somente para teste em localhost, impacta no desempenho do servidor.
      //console.log(alunos);
    } catch (error) {
    }
  }
 

// async function getTurma(request, response) {
//     try {
//       // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
//       await connection(); 
//       // Verifica se a coleção "aluno" existe
//     const  alunos = await mongoose.connection.db.collection("Aluno").find().toArray();
     
//       // Retorna o resultado
//       response.json(alunos);
//     } catch (error) {
//       console.error('Erro ao consultar a coleção aluno:', error);
//       response.status(500).json({ error: 'Erro ao consultar a coleção aluno' });
//     }
//   }

/**
 * @async
 * @function getTurmaTeste
 * @description Busca os alunos de uma turma específica.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
async function getTurmaTeste(request, response) {
  try {
    // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
    const {codigoTurma} = request.body;
    console.log(codigoTurma);
    await connection(); 
    // Verifica se a coleção "aluno" existe
  const  alunos = await mongoose.connection.db.collection("Aluno").find({ Turmas: Number(codigoTurma) }).toArray();
   
    // Retorna o resultado
    response.json(alunos);
  } catch (error) {
    console.error('Erro ao consultar a coleção aluno:', error);
    response.status(500).json({ error: 'Erro ao consultar a coleção aluno' });
  }
}



/**
 * @async
 * @function getTurma
 * @description Busca todos os alunos.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
  async function getTurma(request, response) {
    try {
      // Conecta ao banco de dados (certifique-se de que a conexão está aberta)
      await connection(); 
      // Verifica se a coleção "aluno" existe
    const  alunos = await mongoose.connection.db.collection("Aluno").find().toArray();
     
      // Retorna o resultado
      response.json(alunos);
    } catch (error) {
      console.error('Erro ao consultar a coleção aluno:', error);
      response.status(500).json({ error: 'Erro ao consultar a coleção aluno' });
    }
  }

/**
 * @async
 * @function getTurmas
 * @description Busca todas as turmas.
 * @param {Object} request - O objeto de requisição do Express.
 * @param {Object} response - O objeto de resposta do Express.
 */
  async function getTurmas(request, response) {
    try {
    const { usuario } = request.query;
    if (!usuario) {
      return response.status(400).json({ error: 'usuario do professor é obrigatório' });
    }
    await connection();

    const professor = await mongoose.connection.db
      .collection('Professor')
      .findOne(
        { Usuario: String(usuario).trim() },
        {
          projection: { Turmas: 1 },
          collation: { locale: 'pt', strength: 1 }, 
        }
      );

    if (!professor) {
      return response.status(404).json({ error: 'Professor não encontrado' });
    }

    const ids = Array.isArray(professor.Turmas) ? professor.Turmas : [];
    if (!ids.length) {
      return response.status(200).json([]);
    }

    const turmaIds = ids.map((id) =>
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    const turmas = await mongoose.connection.db
      .collection('Turma')
      .find(
        { _id: { $in: turmaIds } },
        {
          projection: { _id: 1, nome: 1, codigo: 1, periodo: 1}
        }
      )
      .sort({ _id: -1 })
      .limit(200)
      .toArray();

    return response.status(200).json(turmas);
  } catch (error) {
    console.error('Erro ao consultar as coleções:', error);
    return response.status(500).json({ error: 'Erro ao consultar as coleções', message: error.message });
  }
}

/**
 * @function findAluno
 * @description Encontra um aluno em uma turma pela matrícula.
 * @param {Array<Object>} turma - A lista de alunos da turma.
 * @param {string} matricula - A matrícula do aluno a ser encontrado.
 * @returns {Object|undefined} O objeto do aluno se encontrado, caso contrário, undefined.
 */
function findAluno(turma,matricula){
  for (let item of turma) {

      if(item['Matricula']== matricula){
          console.log("ALUNO ENCONTRADO");
          return item;
      }
  }
     // Debug: Log do aluno encontrado
     console.log("Aluno não encontrado:");
}

module.exports = {
getTurmaQuiz,
getTurma,
getTurmas,
getTurmaTeste,
findAluno,


}