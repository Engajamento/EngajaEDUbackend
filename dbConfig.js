const mysql = require("mysql");
const mongoose = require("mongoose");


// Configuração da conexão com MongoDB Atlas
const connection = async () => {
    try {
        await mongoose.connect('mongodb+srv://devTime:dev%40engaj24@dbengajamento.yntmu.mongodb.net/DBEngajamento?retryWrites=true&w=majority', {
            // Configurações de timeout otimizadas
            serverSelectionTimeoutMS: 30000, // 30 segundos para seleção do servidor
            connectTimeoutMS: 30000, // 30 segundos para conectar
            socketTimeoutMS: 45000, // 45 segundos para operações
            maxPoolSize: 10, // Máximo de 10 conexões simultâneas
            minPoolSize: 2,  // Mínimo de 2 conexões ativas
            maxIdleTimeMS: 30000, // Fecha conexões inativas após 30s
        });
        console.info("✅ Connected to the database");
    } catch (error) {
        console.error("❌ Error connecting to the database:", error);
        throw error; // Re-throw the error to be handled by the caller
    }
};

  
module.exports = connection;