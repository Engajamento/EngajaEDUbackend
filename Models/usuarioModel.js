const mongoose = require("mongoose");
const bcrypt = require('bcrypt');


const saltRounds = 10; 
// Define o modelo de dados para a coleção 'Aluno'
const usuarioSchema = new mongoose.Schema({
    usuario: { type: String, required: true },
    senha: { type: String, default: null }, 
});


//Middleware para encriptar a senha antes de salvar
usuarioSchema.pre('save', async function (next) {
    if (!this.isModified('senha')) return next(); // só encripta se a senha foi modificada
  
    try {
      const hash = await bcrypt.hash(this.senha, saltRounds);
      this.senha = hash;
      next();
    } catch (err) {
      next(err);
    }
  });
  
  // 🔍 Método para comparar senha digitada com o hash
  usuarioSchema.methods.compararSenha = function (senhaDigitada) {
    return bcrypt.compare(senhaDigitada, this.senha);
  };
  
  const Usuario = mongoose.model('Usuario', usuarioSchema,"Usuarios");
  
  module.exports = Usuario;