const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Carrega as variáveis de ambiente
require('dotenv').config();

// Função para obter a API key dinamicamente
function getApiKey() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY não encontrada nas variáveis de ambiente');
    }
    return apiKey;
}

// Configuração centralizada do axios para OpenAI
const axiosOpenAI = axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 60000, // 60 segundos para chamadas longas de transcrição
    headers: {
        'Content-Type': 'application/json'
    },
    // Connection pooling para melhor performance
    httpAgent: new (require('http').Agent)({ keepAlive: true }),
    httpsAgent: new (require('https').Agent)({ keepAlive: true })
});

// Interceptor para adicionar Authorization header dinamicamente
axiosOpenAI.interceptors.request.use(config => {
    // Adiciona o header de autorização dinamicamente
    config.headers['Authorization'] = `Bearer ${getApiKey()}`;
    console.log(`🚀 OpenAI Request: ${config.method?.toUpperCase()} ${config.url}`);
    config.metadata = { startTime: Date.now() };
    return config;
});

axiosOpenAI.interceptors.response.use(
    response => {
        const duration = Date.now() - response.config.metadata.startTime;
        console.log(`✅ OpenAI Response em ${duration}ms`);
        return response;
    },
    error => {
        const duration = Date.now() - error.config?.metadata?.startTime;
        console.log(`❌ OpenAI Error após ${duration}ms:`, error.message);
        return Promise.reject(error);
    }
);

// Função para chamadas de chat completion com retry automático
async function createChatCompletion(payload, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axiosOpenAI.post('/chat/completions', payload);
            return response.data;
        } catch (error) {
            console.log(`🔄 Chat completion tentativa ${attempt}/${maxRetries} falhou:`, error.message);
            
            // Se for erro de rate limit, aguarda mais tempo
            if (error.response?.status === 429) {
                const waitTime = Math.pow(2, attempt) * 2000; // Backoff exponencial começando em 2s
                console.log(`⏳ Rate limit detectado. Aguardando ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // Se for erro de quota ou auth, não tenta novamente
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error('❌ Erro de autenticação/autorização OpenAI');
                throw new Error('Credenciais OpenAI inválidas ou quota excedida');
            }
            
            // Se for último retry, lança o erro
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Backoff exponencial para outros erros
            const waitTime = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Função para transcrições de áudio com retry automático
async function createTranscription(audioFilePath, config = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let formData;
        try {
            // Cria FormData para upload de arquivo
            formData = new FormData();
            formData.append('file', fs.createReadStream(audioFilePath));
            formData.append('model', config.model || 'whisper-1');
            
            if (config.response_format) formData.append('response_format', config.response_format);
            if (config.language) formData.append('language', config.language);
            if (config.prompt) formData.append('prompt', config.prompt);
            if (config.temperature) formData.append('temperature', config.temperature.toString());

            const response = await axiosOpenAI.post('/audio/transcriptions', formData, {
                headers: {
                    ...formData.getHeaders()
                    // Authorization será adicionado automaticamente pelo interceptor
                },
                timeout: 120000 // 2 minutos para transcrições
            });

            return response.data;
        } catch (error) {
            console.log(`🔄 Transcrição tentativa ${attempt}/${maxRetries} falhou:`, error.message);
            
            // Se for erro de formato de arquivo, não tenta novamente
            if (error.response?.data?.error?.message?.includes('Invalid file format') || 
                error.response?.data?.error?.message?.includes('file format')) {
                console.error('📄 Erro de formato detectado - parando tentativas');
                throw error;
            }
            
            // Se for erro de rate limit, aguarda mais tempo
            if (error.response?.status === 429) {
                const waitTime = Math.pow(2, attempt) * 3000; // Backoff maior para áudio
                console.log(`⏳ Rate limit detectado. Aguardando ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // Se for erro de auth, não tenta novamente
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error('❌ Erro de autenticação/autorização OpenAI');
                throw new Error('Credenciais OpenAI inválidas ou quota excedida');
            }
            
            // Se for último retry, lança o erro
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Backoff exponencial para outros erros
            const waitTime = Math.pow(2, attempt) * 2000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Função para tratamento de erros padronizado
function handleOpenAIError(error) {
    if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout: OpenAI demorou muito para responder');
    }
    
    if (error.response?.status === 429) {
        throw new Error('Rate limit excedido. Tente novamente em alguns segundos');
    }
    
    if (error.response?.status === 401) {
        throw new Error('Credenciais OpenAI inválidas');
    }
    
    if (error.response?.status === 403) {
        throw new Error('Quota OpenAI excedida');
    }

    if (error.response?.data?.error?.message) {
        throw new Error(`OpenAI Error: ${error.response.data.error.message}`);
    }
    
    throw error;
}

module.exports = {
    axiosOpenAI,
    createChatCompletion,
    createTranscription,
    handleOpenAIError
};
