const fs = require('fs');
const path = require('path');
const axios = require('axios');
const audioConfig = require('../config/audioProcessing');

const API_URL = 'http://localhost:5001/audioSession/transcribe'; // ajuste a porta se necessário

async function transcribeAllChunks(sessionId) {
    const base = path.join(__dirname, '..', 'temp', sessionId);
    const chunksDir = path.join(base, 'chunks');
    const progressFile = path.join(base, 'progress.json');

    console.log(`🎯 Iniciando transcrição otimizada para sessão: ${sessionId}`);
    const startTime = Date.now();

    // Lê todos os chunks
    const chunks = fs.readdirSync(chunksDir).filter(f => f.endsWith('.mp3')).sort();
    console.log(`📊 Total de ${chunks.length} chunks para transcrever`);

    let progress = {
        total: chunks.length,
        done: 0,
        status: 'processing',
        errors: [],
        current: null,
        startTime: startTime,
        estimatedTimeRemaining: null,
        chunks: chunks.map((chunkName, index) => ({
            id: index + 1, // ID baseado na posição do chunk
            name: chunkName,
            status: 'pending',
            startTime: null,
            endTime: null,
            processingTime: null,
            error: null
        }))
    };
    fs.writeFileSync(progressFile, JSON.stringify(progress));

    // Função para atualizar progresso com estimativa de tempo
    function updateProgress(done, current, error, chunkId = null) {
        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        const rate = done / elapsed;
        const remaining = done > 0 ? (chunks.length - done) / rate : null;

        progress.done = done;
        progress.current = current;
        progress.estimatedTimeRemaining = remaining;
        
        // Atualizar status específico do chunk
        if (chunkId !== null) {
            const chunkIndex = progress.chunks.findIndex(c => c.id === chunkId);
            if (chunkIndex !== -1) {
                if (current && !error) {
                    // Chunk iniciando
                    progress.chunks[chunkIndex].status = 'processing';
                    progress.chunks[chunkIndex].startTime = now;
                } else if (done > 0 && !error) {
                    // Chunk concluído
                    progress.chunks[chunkIndex].status = 'completed';
                    progress.chunks[chunkIndex].endTime = now;
                    progress.chunks[chunkIndex].processingTime = now - (progress.chunks[chunkIndex].startTime || now);
                } else if (error) {
                    // Chunk com erro
                    progress.chunks[chunkIndex].status = 'error';
                    progress.chunks[chunkIndex].error = error;
                    progress.chunks[chunkIndex].endTime = now;
                }
            }
        }
        
        if (error && current) {
            progress.errors.push({
                chunk: current,
                error: error,
                timestamp: now
            });
        }
        
        fs.writeFileSync(progressFile, JSON.stringify(progress));
        
        if (done > 0) {
            console.log(`📈 Progresso transcrição: ${done}/${chunks.length} (${(done/chunks.length*100).toFixed(1)}%) - ETA: ${remaining ? remaining.toFixed(0) + 's' : 'N/A'}`);
        }
    }

    // Otimização: Ajuste dinâmico do paralelismo baseado no tamanho dos chunks
    // Chunks menores = mais paralelismo, chunks maiores = menos paralelismo
    const avgChunkSize = getAverageChunkSize(chunksDir, chunks);
    const MAX_PARALLEL = calculateOptimalParallelism(avgChunkSize, chunks.length);
    
    console.log(`⚡ Configuração otimizada: ${MAX_PARALLEL} transcrições paralelas`);

    let processedCount = 0;

    async function processChunk(chunkName, chunkIndex) {
        const chunkId = chunkIndex + 1;
        const MAX_RETRIES = 3;
        const RETRY_TIMEOUTS = [audioConfig.transcription.whisper.timeoutMs, 
                              audioConfig.transcription.whisper.timeoutMs * 2, 
                              audioConfig.transcription.whisper.timeoutMs * 3];
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                updateProgress(processedCount, chunkName, null, chunkId);
                
                // Verifica integridade do arquivo antes de processar
                const chunkPath = path.join(chunksDir, chunkName);
                let validation = validateAudioFile(chunkPath);
                
                if (!validation.valid) {
                    console.warn(`⚠️  Chunk ${chunkName} inválido (tentativa ${attempt + 1}): ${validation.error}`);
                    
                    // Tenta reparar o chunk se possível
                    const repaired = await repairAudioChunk(chunkPath);
                    if (repaired) {
                        validation = validateAudioFile(chunkPath);
                        if (!validation.valid) {
                            throw new Error(`Falha ao reparar arquivo: ${validation.error}`);
                        }
                    } else {
                        throw new Error(`Arquivo inválido e não pôde ser reparado: ${validation.error}`);
                    }
                }
                
                console.log(`🔍 Chunk ${chunkName} validado (${Math.round(validation.size / 1024)}KB) - Tentativa ${attempt + 1}`);
                
                // Configuração de timeout progressivo
                const currentTimeout = RETRY_TIMEOUTS[attempt];
                console.log(`⏱️  Usando timeout de ${currentTimeout/1000}s para ${chunkName}`);
                
                const response = await axios.post(API_URL, {
                    sessionId,
                    chunkName
                }, {
                    timeout: currentTimeout,
                });
                
                processedCount++;
                updateProgress(processedCount, null, null, chunkId);
                
                console.log(`✅ Chunk ${chunkName} transcrito com sucesso na tentativa ${attempt + 1}`);
                return { success: true, chunk: chunkName, chunkId, attempt: attempt + 1 };
                
            } catch (err) {
                const isLastAttempt = attempt === MAX_RETRIES - 1;
                
                console.error(`❌ Erro no chunk ${chunkName} (tentativa ${attempt + 1}/${MAX_RETRIES}):`, err.message);
                
                // Log específico para diferentes tipos de erro
                if (err.code === 'ECONNABORTED') {
                    console.error(`⏰ Timeout no chunk ${chunkName} - timeout: ${RETRY_TIMEOUTS[attempt]/1000}s`);
                } else if (err.response?.status === 400) {
                    console.error(`📄 Erro de formato no chunk ${chunkName} - verificar integridade do arquivo`);
                } else if (err.message.includes('Arquivo inválido')) {
                    console.error(`🚫 Validação falhou para ${chunkName}`);
                }
                
                if (isLastAttempt) {
                    // Última tentativa falhou - marcar como erro definitivo
                    updateProgress(processedCount, chunkName, `Falha após ${MAX_RETRIES} tentativas: ${err.message}`, chunkId);
                    
                    console.error(`💥 Chunk ${chunkName} DEFINITIVAMENTE perdido após ${MAX_RETRIES} tentativas`);
                    return { 
                        success: false, 
                        chunk: chunkName, 
                        chunkId, 
                        error: err.message,
                        attempts: MAX_RETRIES,
                        finalError: true
                    };
                } else {
                    // Aguardar antes da próxima tentativa
                    const delayMs = 2000 * (attempt + 1); // 2s, 4s, 6s...
                    console.log(`⏳ Aguardando ${delayMs/1000}s antes da próxima tentativa...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
    }

    try {
        // Processa em batches otimizados para balancear performance e recursos
        const results = [];
        
        for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
            const batch = chunks.slice(i, i + MAX_PARALLEL);
            const batchNumber = Math.floor(i/MAX_PARALLEL) + 1;
            const totalBatches = Math.ceil(chunks.length/MAX_PARALLEL);
            
            console.log(`🚀 Processando batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`);
            
            const batchResults = await Promise.allSettled(
                batch.map((chunkName, batchIndex) => processChunk(chunkName, i + batchIndex))
            );
            
            // Processa resultados do batch
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    console.error(`❌ Falha crítica no chunk ${batch[index]}:`, result.reason);
                    results.push({ 
                        success: false, 
                        chunk: batch[index], 
                        error: result.reason?.message || 'Erro desconhecido' 
                    });
                }
            });
            
            // Pequena pausa entre batches para evitar sobrecarga
            if (i + MAX_PARALLEL < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, audioConfig.transcription.batchDelayMs));
            }
        }

        // Finaliza progresso
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;

        progress.status = 'done';
        progress.current = null;
        progress.finalStats = {
            totalTime: totalTime,
            successCount: successCount,
            errorCount: errorCount,
            chunksPerSecond: chunks.length / totalTime
        };
        
        fs.writeFileSync(progressFile, JSON.stringify(progress));
        
        console.log(`🎉 Transcrição concluída!`);
        console.log(`📊 Estatísticas: ${successCount} sucessos, ${errorCount} erros em ${totalTime.toFixed(2)}s`);
        console.log(`⚡ Performance: ${(chunks.length / totalTime).toFixed(2)} chunks/segundo`);
        
        if (errorCount > 0) {
            console.warn(`⚠️  ${errorCount} chunks falharam na transcrição`);
        }

    } catch (error) {
        progress.status = 'error';
        progress.current = null;
        progress.errors.push({
            error: error.message,
            timestamp: Date.now(),
            type: 'critical'
        });
        fs.writeFileSync(progressFile, JSON.stringify(progress));
        
        console.error('💥 Erro crítico na transcrição:', error);
        throw error;
    }
}

// Função para calcular tamanho médio dos chunks
function getAverageChunkSize(chunksDir, chunks) {
    let totalSize = 0;
    let validChunks = 0;
    
    chunks.forEach(chunk => {
        try {
            const stats = fs.statSync(path.join(chunksDir, chunk));
            totalSize += stats.size;
            validChunks++;
        } catch (err) {
            console.warn(`⚠️  Não foi possível ler stats do chunk: ${chunk}`);
        }
    });
    
    return validChunks > 0 ? totalSize / validChunks : 0;
}

// Função para calcular paralelismo ótimo baseado no tamanho dos chunks
function calculateOptimalParallelism(avgChunkSize, totalChunks) {
    const MB = 1024 * 1024;
    const config = audioConfig.transcription.parallelism;
    
    // Lógica adaptativa baseada no tamanho médio dos chunks
    if (avgChunkSize < config.smallChunks.sizeLimitMB * MB) {
        return Math.min(config.smallChunks.maxParallel, totalChunks);
    } else if (avgChunkSize < config.mediumChunks.sizeLimitMB * MB) {
        return Math.min(config.mediumChunks.maxParallel, totalChunks);
    } else {
        return Math.min(config.largeChunks.maxParallel, totalChunks);
    }
}

// Função para verificar integridade do arquivo de áudio
function validateAudioFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return { valid: false, error: 'Arquivo não encontrado' };
        }
        
        const stats = fs.statSync(filePath);
        
        // Verifica se o arquivo não está vazio
        if (stats.size === 0) {
            return { valid: false, error: 'Arquivo vazio' };
        }
        
        // Verifica se o arquivo é muito pequeno (suspeito)
        if (stats.size < 1024) { // Menor que 1KB
            return { valid: false, error: `Arquivo muito pequeno (${stats.size} bytes)` };
        }
        
        // Verifica se o arquivo é muito grande (pode causar timeout)
        const maxSizeMB = 25; // 25MB limit
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (stats.size > maxSizeBytes) {
            return { valid: false, error: `Arquivo muito grande (${Math.round(stats.size / 1024 / 1024)}MB > ${maxSizeMB}MB)` };
        }
        
        // Verifica se o arquivo pode ser lido
        try {
            fs.accessSync(filePath, fs.constants.R_OK);
        } catch (accessError) {
            return { valid: false, error: 'Arquivo não pode ser lido' };
        }
        
        return { valid: true, size: stats.size };
        
    } catch (error) {
        return { valid: false, error: `Erro ao validar arquivo: ${error.message}` };
    }
}

// Função para tentar reparar arquivo de áudio corrompido
async function repairAudioChunk(chunkPath) {
    const path = require('path');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
        const repairedPath = chunkPath.replace('.mp3', '_repaired.mp3');
        
        // Comando FFmpeg para recodificar e reparar o arquivo
        const command = `ffmpeg -y -i "${chunkPath}" -acodec libmp3lame -ab 128k -ar 22050 -ac 1 "${repairedPath}"`;
        
        console.log(`🔧 Tentando reparar ${path.basename(chunkPath)}...`);
        
        await execAsync(command);
        
        // Verifica se o arquivo reparado foi criado e é válido
        const validation = validateAudioFile(repairedPath);
        if (validation.valid) {
            // Substitui o arquivo original pelo reparado
            fs.renameSync(repairedPath, chunkPath);
            console.log(`✅ Chunk reparado com sucesso: ${path.basename(chunkPath)}`);
            return true;
        } else {
            // Remove arquivo reparado se não for válido
            if (fs.existsSync(repairedPath)) {
                fs.unlinkSync(repairedPath);
            }
            return false;
        }
    } catch (error) {
        console.error(`❌ Falha ao reparar chunk:`, error.message);
        return false;
    }
}

module.exports = { transcribeAllChunks };