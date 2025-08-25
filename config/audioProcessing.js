// Configurações otimizadas para processamento de áudio
// Este arquivo permite ajustar facilmente os parâmetros de performance

module.exports = {
    // Configurações de divisão de áudio
    chunking: {
        // Duração de cada chunk em segundos (10 minutos = 600s)
        chunkDurationSeconds: 600,
        
        // Número máximo de processos FFmpeg paralelos para divisão
        maxParallelSplitting: 4,
        
        // Configurações de qualidade para otimizar velocidade
        audio: {
            codec: 'libmp3lame',
            bitrate: '128k',        // Bitrate otimizado para speech
            channels: 1,            // Mono para reduzir tamanho
            frequency: 22050,       // Frequência reduzida mas suficiente
            preset: 'fast',         // Preset mais rápido do FFmpeg
            threads: 2              // Threads por processo FFmpeg
        }
    },

    // Configurações de transcrição
    transcription: {
        // Configurações adaptativas de paralelismo baseadas no tamanho dos chunks
        parallelism: {
            smallChunks: {
                sizeLimitMB: 5,
                maxParallel: 12
            },
            mediumChunks: {
                sizeLimitMB: 15,
                maxParallel: 8
            },
            largeChunks: {
                maxParallel: 4
            }
        },
        
        // Configurações da API Whisper
        whisper: {
            model: 'whisper-1',
            responseFormat: 'text',
            language: 'pt',         // Português para acelerar
            prompt: 'Esta é uma transcrição de uma aula em português brasileiro.',
            
            // Configurações de retry
            maxRetries: 3,
            retryDelayMs: 1000,     // Delay inicial, cresce exponencialmente
            timeoutMs: 90000       // 1 minuto e meio por chunk
        },
        
        // Pausa entre batches para evitar sobrecarga
        batchDelayMs: 1000
    },

    // Configurações de logging e monitoramento
    monitoring: {
        enableDetailedLogs: true,
        enablePerformanceMetrics: true,
        logProgressInterval: 5,     // Log a cada N chunks processados
        
        // Métricas de performance esperadas (para alertas)
        expectedPerformance: {
            chunksPerSecondSplitting: 2.0,
            chunksPerSecondTranscription: 0.5
        }
    },

    // Configurações de cache e otimização
    optimization: {
        // Verifica se chunk já foi transcrito antes de processar
        skipExistingTranscriptions: true,
        
        // Salva metadados para análise de performance
        saveProcessingMetadata: true,
        
        // Limpa arquivos temporários automaticamente
        autoCleanupTemp: true
    }
};
