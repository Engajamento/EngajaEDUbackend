/**
 * @file audioSessionController.js
 * @description Este arquivo é responsável por controlar as sessões de processamento de áudio, incluindo upload, divisão, transcrição e geração de questões.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { createTranscription, createChatCompletion, handleOpenAIError } = require('../utils/openaiAxios');
const { transcribeAllChunks } = require('../workers/transcribeWorker');
const audioConfig = require('../config/audioProcessing');

/**
 * @function createSessionFolders
 * @description Cria as pastas necessárias para uma nova sessão de processamento de áudio.
 * @param {string} sessionId - O ID da sessão.
 * @returns {string} O caminho base para a sessão.
 */
function createSessionFolders(sessionId) {
    const base = path.join(__dirname, '..', 'temp', sessionId);
    ['uploads', 'chunks', 'transcricoes'].forEach(dir =>
        fs.mkdirSync(path.join(base, dir), { recursive: true })
    );
    return base;
}

/**
 * @async
 * @function uploadAudio
 * @description Faz o upload de um arquivo de áudio e cria uma nova sessão de processamento.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function uploadAudio(req, res) {
    try {
        const sessionId = uuidv4();
        const base = createSessionFolders(sessionId);
        const uploadPath = path.join(base, 'uploads', req.file.originalname);
        fs.renameSync(req.file.path, uploadPath);
        res.json({ sessionId, filename: req.file.originalname });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar upload.' });
    }
}

/**
 * @async
 * @function splitAudio
 * @description Divide o áudio de uma sessão em chunks.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function splitAudio(req, res) {
    try {
        const { sessionId, filename } = req.body;
        const base = path.join(__dirname, '..', 'temp', sessionId);
        const inputPath = path.join(base, 'uploads', filename);
        const chunksDir = path.join(base, 'chunks');
        
        if (!fs.existsSync(inputPath)) {
            return res.status(400).json({ error: 'Arquivo não encontrado.' });
        }

        console.log(`🔧 Iniciando divisão otimizada do áudio: ${filename}`);
        const startTime = Date.now();

        // Descobre duração do áudio
        ffmpeg.ffprobe(inputPath, async (err, metadata) => {
            if (err) {
                console.error('Erro ao ler metadata do áudio:', err);
                return res.status(500).json({ error: 'Erro ao ler áudio.' });
            }

            const duration = metadata.format.duration;
            const chunkDuration = audioConfig.chunking.chunkDurationSeconds;
            const maxParallelProcesses = audioConfig.chunking.maxParallelSplitting;
            
            console.log(`📊 Duração total: ${duration}s, Chunks de ${chunkDuration}s`);

            // Pré-calcula todos os pontos de divisão
            const chunkSpecs = [];
            let start = 0, idx = 1;
            
            while (start < duration) {
                const end = Math.min(start + chunkDuration, duration);
                const chunkName = `chunk_${idx}.mp3`;
                const outputPath = path.join(chunksDir, chunkName);
                
                chunkSpecs.push({
                    start,
                    duration: end - start,
                    chunkName,
                    outputPath,
                    idx
                });
                
                start += chunkDuration;
                idx++;
            }

            console.log(`📦 Total de ${chunkSpecs.length} chunks para processar`);

            // Função para processar um chunk individual
            const processChunk = (spec) => {
                return new Promise((resolve, reject) => {
                    console.log(`⚡ Processando chunk ${spec.idx}/${chunkSpecs.length}: ${spec.chunkName}`);
                    
                    ffmpeg(inputPath)
                        .setStartTime(spec.start)
                        .setDuration(spec.duration)
                        // Otimizações para acelerar o processamento
                        .audioCodec(audioConfig.chunking.audio.codec)
                        .audioBitrate(audioConfig.chunking.audio.bitrate)
                        .audioChannels(audioConfig.chunking.audio.channels)
                        .audioFrequency(audioConfig.chunking.audio.frequency)
                        .format('mp3')
                        // Configurações adicionais para performance
                        .addOptions([
                            `-preset ${audioConfig.chunking.audio.preset}`,
                            `-threads ${audioConfig.chunking.audio.threads}`,
                            '-avoid_negative_ts make_zero' // Evita problemas de timestamp
                        ])
                        .output(spec.outputPath)
                        .on('end', () => {
                            console.log(`✅ Chunk ${spec.idx} concluído: ${spec.chunkName}`);
                            resolve(spec.chunkName);
                        })
                        .on('error', (err) => {
                            console.error(`❌ Erro no chunk ${spec.idx}:`, err.message);
                            reject(err);
                        })
                        .run();
                });
            };

            try {
                // Processa chunks em batches paralelos para otimizar performance
                const chunks = [];
                
                for (let i = 0; i < chunkSpecs.length; i += maxParallelProcesses) {
                    const batch = chunkSpecs.slice(i, i + maxParallelProcesses);
                    console.log(`🚀 Processando batch ${Math.floor(i/maxParallelProcesses) + 1}/${Math.ceil(chunkSpecs.length/maxParallelProcesses)} (${batch.length} chunks)`);
                    
                    const batchResults = await Promise.all(
                        batch.map(processChunk)
                    );
                    
                    chunks.push(...batchResults);
                    
                    // Log de progresso
                    const progress = ((i + batch.length) / chunkSpecs.length * 100).toFixed(1);
                    console.log(`📈 Progresso: ${progress}% (${i + batch.length}/${chunkSpecs.length} chunks)`);
                }

                const endTime = Date.now();
                const totalTime = (endTime - startTime) / 1000;
                
                console.log(`🎉 Divisão concluída! ${chunks.length} chunks em ${totalTime.toFixed(2)}s`);
                console.log(`⚡ Performance: ${(chunks.length / totalTime).toFixed(2)} chunks/segundo`);
                
                res.json({ 
                    chunks,
                    metadata: {
                        totalChunks: chunks.length,
                        processingTimeSeconds: totalTime,
                        chunksPerSecond: chunks.length / totalTime
                    }
                });

            } catch (error) {
                console.error('❌ Erro durante processamento paralelo:', error);
                res.status(500).json({ error: 'Erro ao dividir áudio em chunks.' });
            }
        });

    } catch (err) {
        console.error('❌ Erro geral na divisão de áudio:', err);
        res.status(500).json({ error: 'Erro ao dividir áudio.' });
    }
}

// 3. Transcrição de um chunk - OTIMIZADA
/**
 * @async
 * @function transcribeChunk
 * @description Transcreve um único chunk de áudio de uma sessão.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function transcribeChunk(req, res) {
    try {
        const { sessionId, chunkName } = req.body;
        const base = path.join(__dirname, '..', 'temp', sessionId);
        const chunkPath = path.join(base, 'chunks', chunkName);
        const transDir = path.join(base, 'transcricoes');
        
        if (!fs.existsSync(chunkPath)) {
            return res.status(400).json({ error: 'Chunk não encontrado.' });
        }

        console.log(`🎙️  Iniciando transcrição do chunk: ${chunkName}`);
        const startTime = Date.now();

        // Verifica se já existe transcrição para este chunk
        const transFile = path.join(transDir, chunkName.replace('.mp3', '.txt'));
        if (fs.existsSync(transFile)) {
            console.log(`⚡ Transcrição já existe para ${chunkName}, pulando...`);
            return res.json({ 
                message: 'Transcrição já existente.', 
                transFile: path.basename(transFile),
                cached: true 
            });
        }

        // Verifica e prepara arquivo para Whisper
        let audioPath = chunkPath;
        let tempPath = null;

        // Validação do arquivo antes de processar
        try {
            const stats = fs.statSync(chunkPath);
            if (stats.size === 0) {
                throw new Error('Arquivo de chunk está vazio');
            }
            if (stats.size < 1024) { // Menor que 1KB é suspeito
                console.warn(`⚠️  Arquivo ${chunkName} muito pequeno (${stats.size} bytes)`);
            }
        } catch (statError) {
            throw new Error(`Erro ao verificar arquivo ${chunkName}: ${statError.message}`);
        }

        // Se não terminar com .mp3, cria uma cópia temporária
        if (!chunkPath.endsWith('.mp3')) {
            tempPath = chunkPath + '.mp3';
            fs.copyFileSync(chunkPath, tempPath);
            audioPath = tempPath;
        }

        // Configurações otimizadas para a API Whisper
        const transcriptionConfig = {
            model: audioConfig.transcription.whisper.model,
            response_format: audioConfig.transcription.whisper.responseFormat,
            language: audioConfig.transcription.whisper.language,
            prompt: audioConfig.transcription.whisper.prompt,
        };

        console.log(`🚀 Enviando para Whisper API: ${chunkName}`);
        
        // Chamada otimizada para Whisper com retry
        let transcription;
        let retryCount = 0;
        const maxRetries = audioConfig.transcription.whisper.maxRetries;

        while (retryCount < maxRetries) {
            try {
                transcription = await createTranscription(audioPath, transcriptionConfig);
                break; // Sucesso, sai do loop
            } catch (error) {
                retryCount++;
                console.warn(`⚠️  Tentativa ${retryCount}/${maxRetries} falhou para ${chunkName}:`, error.message);
                
                // Se for erro de formato, não faz sentido tentar novamente
                if (error.message && error.message.includes('Invalid file format')) {
                    console.error(`📄 Erro de formato detectado em ${chunkName} - parando tentativas`);
                    throw error;
                }
                
                if (retryCount >= maxRetries) {
                    throw error; // Última tentativa falhou
                }
                
                // Espera exponencial entre tentativas
                const delay = Math.min(
                    audioConfig.transcription.whisper.retryDelayMs * Math.pow(2, retryCount), 
                    10000
                );
                console.log(`⏱️  Aguardando ${delay}ms antes da próxima tentativa...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Salva transcrição com metadados
        const transcriptionData = {
            chunk: chunkName,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
            text: transcription.trim()
        };

        // Salva apenas o texto para compatibilidade
        fs.writeFileSync(transFile, transcription.trim() + '\n');
        
        // Salva metadados em arquivo separado para análise
        const metaFile = path.join(transDir, chunkName.replace('.mp3', '.meta.json'));
        fs.writeFileSync(metaFile, JSON.stringify(transcriptionData, null, 2));

        // Limpa arquivo temporário se foi criado
        if (tempPath && fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }

        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000;

        console.log(`✅ Chunk ${chunkName} transcrito em ${processingTime.toFixed(2)}s`);

        res.json({ 
            message: 'Transcrição concluída.', 
            transFile: path.basename(transFile),
            metadata: {
                processingTimeSeconds: processingTime,
                chunkName: chunkName,
                textLength: transcription.length,
                retryCount: retryCount
            }
        });

    } catch (err) {
        // Cleanup de streams e arquivos temporários em caso de erro
        try {
            if (transcriptionConfig && transcriptionConfig.file && typeof transcriptionConfig.file.destroy === 'function') {
                transcriptionConfig.file.destroy();
            }
        } catch (cleanupError) {
            console.warn(`⚠️  Erro durante cleanup de stream: ${cleanupError.message}`);
        }
        
        // Limpa arquivo temporário se foi criado
        if (tempPath && fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupError) {
                console.warn(`⚠️  Erro ao limpar arquivo temporário: ${cleanupError.message}`);
            }
        }

        console.error(`❌ Erro ao transcrever chunk:`, err);
        
        // Log detalhado do erro para debugging
        const errorDetails = {
            message: err.message,
            stack: err.stack,
            chunk: req.body.chunkName,
            sessionId: req.body.sessionId,
            timestamp: new Date().toISOString()
        };
        
        console.error('Detalhes do erro:', errorDetails);
        
        // Retorna erro específico baseado no tipo
        if (err.message && err.message.includes('Invalid file format')) {
            res.status(400).json({ 
                error: 'Formato de arquivo inválido', 
                details: err.message,
                chunk: req.body.chunkName 
            });
        } else if (err.code === 'ENOENT') {
            res.status(404).json({ 
                error: 'Arquivo de chunk não encontrado', 
                chunk: req.body.chunkName 
            });
        } else {
            res.status(500).json({ 
                error: 'Erro ao transcrever chunk.',
                details: err.message,
                chunk: req.body.chunkName
            });
        }
    }
}

/**
 * @async
 * @function concatAndCleanup
 * @description Concatena as transcrições de uma sessão e limpa os arquivos temporários.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function concatAndCleanup(req, res) {
    try {
        const { sessionId } = req.body;
        const base = path.join(__dirname, '..', 'temp', sessionId);
        const transDir = path.join(base, 'transcricoes');
        const chunksDir = path.join(base, 'chunks');
        const progressFile = path.join(base, 'progress.json');
        
        // Ler informações de progresso para verificar chunks perdidos
        let progressData = {};
        if (fs.existsSync(progressFile)) {
            progressData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        }
        
        // Verificar quantos chunks existiam originalmente
        const originalChunks = fs.existsSync(chunksDir) ? 
            fs.readdirSync(chunksDir).filter(f => f.endsWith('.mp3')).length : 0;
        
        // Verificar quantos foram transcritos com sucesso
        const transcriptionFiles = fs.readdirSync(transDir).filter(f => f.endsWith('.txt')).sort();
        const transcribedCount = transcriptionFiles.length;
        const lostChunks = originalChunks - transcribedCount;
        
        // Calcular porcentagem de conteúdo perdido
        const completionRate = originalChunks > 0 ? (transcribedCount / originalChunks) * 100 : 0;
        const lossRate = 100 - completionRate;
        
        // Concatenar apenas as transcrições disponíveis
        let fullText = '';
        for (const file of transcriptionFiles) {
            fullText += fs.readFileSync(path.join(transDir, file), 'utf8') + '\n';
        }
        
        // Preparar resposta com informações de completude
        const response = {
            transcription: fullText,
            completeness: {
                totalChunks: originalChunks,
                transcribedChunks: transcribedCount,
                lostChunks: lostChunks,
                completionRate: Math.round(completionRate * 100) / 100,
                lossRate: Math.round(lossRate * 100) / 100,
                isComplete: lostChunks === 0,
                hasSignificantLoss: lossRate > 20 // Mais de 20% perdido é considerado significativo
            }
        };
        
        // Incluir detalhes dos chunks que falharam se disponível
        if (progressData.errors && progressData.errors.length > 0) {
            response.completeness.failedChunks = progressData.errors.map(error => ({
                chunk: error.chunk,
                error: error.error,
                timestamp: error.timestamp
            }));
        }
        
        // Log de aviso se houver perda significativa
        if (response.completeness.hasSignificantLoss) {
            console.warn(`⚠️  ATENÇÃO: ${lossRate.toFixed(1)}% do conteúdo foi perdido na transcrição!`);
            console.warn(`📊 Chunks: ${transcribedCount}/${originalChunks} transcritos com sucesso`);
        }
        
        // Limpa tudo
        fs.rmSync(base, { recursive: true, force: true });
        
        res.json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao concatenar/limpar sessão.' });
    }
}

/**
 * @async
 * @function transcribeAll
 * @description Inicia a transcrição de todos os chunks de uma sessão em background.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function transcribeAll(req, res) {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId obrigatório' });

    // Dispara o worker (não espera terminar)
    transcribeAllChunks(sessionId)
        .then(() => console.log(`Transcrição em lote finalizada para sessão ${sessionId}`))
        .catch(err => console.error('Erro no worker:', err));

    res.json({ message: 'Transcrição em lote iniciada', sessionId });
}

/**
 * @async
 * @function getProgress
 * @description Obtém o progresso da transcrição de uma sessão.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function getProgress(req, res) {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId obrigatório' });

    const progressFile = path.join(__dirname, '..', 'temp', sessionId, 'progress.json');
    if (!fs.existsSync(progressFile)) return res.json({ status: 'not_started' });

    const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    res.json(progress);
}

// Retry de chunks específicos que falharam ou ficaram travados
/**
 * @async
 * @function retryChunks
 * @description Tenta transcrever novamente os chunks que falharam ou ficaram travados.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function retryChunks(req, res) {
    try {
        const { sessionId, chunks } = req.body;
        
        if (!sessionId || !chunks || !Array.isArray(chunks)) {
            return res.status(400).json({ 
                error: 'sessionId e chunks (array) são obrigatórios' 
            });
        }

        const base = path.join(__dirname, '..', 'temp', sessionId);
        const chunksDir = path.join(base, 'chunks');
        const transDir = path.join(base, 'transcricoes');
        const progressFile = path.join(base, 'progress.json');

        // Verificar se a sessão existe
        if (!fs.existsSync(base) || !fs.existsSync(chunksDir)) {
            return res.status(404).json({ error: 'Sessão não encontrada' });
        }

        console.log(`🔄 Iniciando retry de ${chunks.length} chunks para sessão ${sessionId}`);

        // Atualizar progresso - marcar chunks como "processing" novamente
        let progress = { status: 'processing', done: 0, total: 0, errors: [], chunks: [] };
        
        if (fs.existsSync(progressFile)) {
            progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        }

        // Resetar status dos chunks que vão ser reprocessados
        chunks.forEach(chunkId => {
            const chunkIndex = progress.chunks.findIndex(c => c.id === chunkId);
            if (chunkIndex !== -1) {
                progress.chunks[chunkIndex].status = 'processing';
                progress.chunks[chunkIndex].startTime = Date.now();
                
                // Remover arquivo de transcrição anterior se existir
                const transcriptionFile = path.join(transDir, `chunk_${chunkId}.txt`);
                if (fs.existsSync(transcriptionFile)) {
                    fs.unlinkSync(transcriptionFile);
                    console.log(`🗑️ Removido arquivo de transcrição anterior: chunk_${chunkId}.txt`);
                }
            } else {
                // Adicionar novo chunk se não estiver no progresso
                progress.chunks.push({
                    id: chunkId,
                    status: 'processing',
                    startTime: Date.now()
                });
            }
        });

        // Recalcular contadores
        progress.done = progress.chunks.filter(c => c.status === 'completed').length;
        progress.total = progress.chunks.length;
        progress.status = 'processing';

        // Salvar progresso atualizado
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

        // Processar chunks específicos de forma assíncrona
        setImmediate(async () => {
            for (const chunkId of chunks) {
                try {
                    const chunkName = `chunk_${chunkId}.mp3`;
                    const audioPath = path.join(chunksDir, chunkName);
                    
                    if (!fs.existsSync(audioPath)) {
                        console.error(`❌ Chunk não encontrado: ${chunkName}`);
                        continue;
                    }

                    console.log(`🔄 Reprocessando chunk: ${chunkName}`);
                    
                    // Simular a chamada de transcrição (usando a mesma lógica do transcribeChunk)
                    const startTime = Date.now();
                    
                    const transcriptionConfig = {
                        model: audioConfig.transcription.whisper.model,
                        response_format: audioConfig.transcription.whisper.responseFormat,
                        language: audioConfig.transcription.whisper.language,
                        prompt: audioConfig.transcription.whisper.prompt,
                    };

                    let transcription;
                    let retryCount = 0;
                    const maxRetries = audioConfig.transcription.whisper.maxRetries;

                    while (retryCount < maxRetries) {
                        try {
                            transcription = await createTranscription(audioPath, transcriptionConfig);
                            break;
                        } catch (error) {
                            retryCount++;
                            console.warn(`⚠️ Retry tentativa ${retryCount}/${maxRetries} falhou para ${chunkName}:`, error.message);
                            
                            if (retryCount >= maxRetries) {
                                throw error;
                            }
                            
                            const delay = Math.min(
                                audioConfig.transcription.whisper.retryDelayMs * Math.pow(2, retryCount), 
                                10000
                            );
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }

                    // Salvar transcrição
                    const transFile = path.join(transDir, `chunk_${chunkId}.txt`);
                    fs.writeFileSync(transFile, transcription.trim() + '\n');

                    // Atualizar progresso
                    const currentProgress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
                    const chunkIndex = currentProgress.chunks.findIndex(c => c.id === chunkId);
                    
                    if (chunkIndex !== -1) {
                        currentProgress.chunks[chunkIndex].status = 'completed';
                        currentProgress.chunks[chunkIndex].endTime = Date.now();
                        currentProgress.chunks[chunkIndex].processingTime = Date.now() - startTime;
                    }

                    currentProgress.done = currentProgress.chunks.filter(c => c.status === 'completed').length;
                    
                    // Verificar se todos os chunks foram processados
                    if (currentProgress.done >= currentProgress.total) {
                        currentProgress.status = 'done';
                    }

                    fs.writeFileSync(progressFile, JSON.stringify(currentProgress, null, 2));
                    
                    console.log(`✅ Retry concluído para chunk: ${chunkName}`);
                    
                } catch (error) {
                    console.error(`❌ Erro no retry do chunk ${chunkId}:`, error);
                    
                    // Marcar chunk como erro no progresso
                    const currentProgress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
                    const chunkIndex = currentProgress.chunks.findIndex(c => c.id === chunkId);
                    
                    if (chunkIndex !== -1) {
                        currentProgress.chunks[chunkIndex].status = 'error';
                        currentProgress.chunks[chunkIndex].error = error.message;
                    }
                    
                    currentProgress.errors.push(`Erro no chunk ${chunkId}: ${error.message}`);
                    fs.writeFileSync(progressFile, JSON.stringify(currentProgress, null, 2));
                }
            }
        });

        res.json({ 
            success: true, 
            message: `Retry iniciado para ${chunks.length} chunks`,
            chunks: chunks 
        });

    } catch (error) {
        console.error('❌ Erro na função retryChunks:', error);
        res.status(500).json({ 
            error: 'Erro ao processar retry de chunks',
            details: error.message 
        });
    }
}

// Geração de questões a partir da transcrição
/**
 * @async
 * @function generateQuestions
 * @description Gera questões a partir de uma transcrição de áudio usando a API do ChatGPT.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function generateQuestions(req, res) {
    try {
        const { transcript, quant_topicos, quant_questoes } = req.body;

        if (!transcript || !quant_topicos || !quant_questoes) {
            return res.status(400).json({ error: 'transcript, quant_topicos e quant_questoes são obrigatórios.' });
        }

        const prompt_text = `
        Com base na seguinte transcrição de aula, identifique os ${quant_topicos} tópicos mais importantes que, **com certeza**, devem ser cobrados em uma avaliação. Foque apenas no conteúdo essencial e fundamental da aula.

        Para cada um desses ${quant_topicos} tópicos, gere exatamente ${quant_questoes} questões de Verdadeiro ou Falso.

        **Regras Essenciais para a Geração das Questões:**
        1.  **Não Contradição Direta:** As ${quant_questoes} questões para o mesmo tópico **NÃO PODEM ser a negação direta ou o oposto uma da outra**. Por exemplo, se uma pergunta é "X é Verdadeiro", as outras duas não podem ser "X é Falso" ou variações muito próximas que apenas invertem o gabarito sobre o mesmo fato.
        2.  **Diversidade de Aspectos:** Cada uma das ${quant_questoes} questões dentro do mesmo tópico deve abordar um **aspecto, característica, conceito ou fato diferente** do tópico. Pense em testar diferentes pontos de conhecimento sobre aquele tópico.
        3.  **Base na Transcrição (Explicitude):** As questões devem se referir a informações que estão **explicitamente declaradas ou claramente inferíveis** na transcrição da aula. Não invente informações ou conceitos não mencionados na aula.
        4.  **Clareza e Concisão:** As questões devem ser claras, concisas e diretamente relacionadas ao tópico.
        5.  **Gabarito:** Inclua o gabarito (Verdadeiro ou Falso) para cada questão.
        6.  **Explicação:** Para cada questão, inclua uma breve explicação do porquê a resposta correta é aquela, baseada na transcrição.
        7.  **Imparcialidade nas Explicações: As explicações NÃO devem citar ou mencionar a transcrição, nem usar frases como "a transcrição afirma", "segundo a transcrição", "conforme dito", etc. Apenas explique o motivo da resposta de forma direta, objetiva e impessoal, como em um gabarito de prova.

        **Retorne APENAS o objeto JSON puro, sem nenhum texto adicional antes ou depois.**

        **Formato de Saída (JSON):**
        \`\`\`json
        {
        "topicos": [
            {
            "nome_topico": "Introdução à Redes",
            "questoes": [
                {
                "pergunta": "Uma rede de computadores permite o compartilhamento de recursos.",
                "gabarito": "Verdadeiro",
                "explicacao": "A transcrição afirma que redes permitem compartilhar recursos como arquivos e impressoras."
                },
                {
                "pergunta": "A internet é um exemplo de rede local (LAN).",
                "gabarito": "Falso",
                "explicacao": "A transcrição diferencia a internet (rede mundial) de redes locais (LANs)."
                },
                {
                "pergunta": "Protocolos definem as regras de comunicação em uma rede.",
                "gabarito": "Verdadeiro",
                "explicacao": "A transcrição explica que protocolos são essenciais para a comunicação em redes."
                }
            ]
            }
        ]
        }
        \`\`\`

        **Transcrição da Aula:**
        ${transcript}
        `;

        try {
            // Chamada à OpenAI usando axios
            const completion = await createChatCompletion({
                model: "gpt-4o",
                messages: [
                    { role: "user", content: prompt_text }
                ],
                temperature: 0.2,
                max_tokens: 2048
            });

            // Extrai o JSON puro da resposta
            const resposta = completion.choices[0].message.content.trim();
            let jsonResult = null;
            try {
                // Remove markdown se vier com ```json ... ```
                const match = resposta.match(/```json\s*([\s\S]*?)```/);
                jsonResult = match ? JSON.parse(match[1]) : JSON.parse(resposta);
            } catch (err) {
                return res.status(500).json({ error: "Erro ao interpretar JSON da IA", resposta });
            }

            res.json({ questions: jsonResult });
        } catch (error) {
            console.error('Erro OpenAI:', error);
            try {
                handleOpenAIError(error);
            } catch (handledError) {
                return res.status(500).json({ error: handledError.message });
            }
            return res.status(500).json({ error: "Erro ao gerar questões", details: error.message });
        }
    } catch (err) {
        console.error('Erro geral:', err);
        res.status(500).json({ error: "Erro ao gerar questões" });
    }
}

module.exports = {
    uploadAudio,
    splitAudio,
    transcribeChunk,
    concatAndCleanup,
    getProgress,
    transcribeAll,
    generateQuestions,
    retryChunks
};