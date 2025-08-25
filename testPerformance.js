// Teste das otimizações de performance do processamento de áudio
// Execute com: node testPerformance.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5001';

class PerformanceTest {
    constructor() {
        this.results = {
            splitting: null,
            transcription: null,
            errors: []
        };
    }

    async testSplitting(sessionId, filename) {
        console.log('🧪 Testando divisão otimizada de áudio...');
        const startTime = Date.now();

        try {
            const response = await axios.post(`${BASE_URL}/audioSession/split`, {
                sessionId,
                filename
            });

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            this.results.splitting = {
                success: true,
                duration: duration,
                chunks: response.data.chunks.length,
                chunksPerSecond: response.data.chunks.length / duration,
                metadata: response.data.metadata
            };

            console.log(`✅ Divisão concluída: ${response.data.chunks.length} chunks em ${duration.toFixed(2)}s`);
            console.log(`⚡ Performance: ${(response.data.chunks.length / duration).toFixed(2)} chunks/s`);

        } catch (error) {
            this.results.errors.push({
                operation: 'splitting',
                error: error.message
            });
            console.error('❌ Erro na divisão:', error.message);
        }
    }

    async testTranscription(sessionId) {
        console.log('🧪 Testando transcrição otimizada...');
        const startTime = Date.now();

        try {
            // Inicia transcrição
            await axios.post(`${BASE_URL}/audioSession/transcribeAll`, {
                sessionId
            });

            // Monitora progresso
            let progress;
            do {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2s
                const response = await axios.get(`${BASE_URL}/audioSession/progress?sessionId=${sessionId}`);
                progress = response.data;
                
                if (progress.status === 'processing') {
                    console.log(`📈 Progresso: ${progress.done}/${progress.total} chunks`);
                    if (progress.estimatedTimeRemaining) {
                        console.log(`⏱️  ETA: ${progress.estimatedTimeRemaining.toFixed(0)}s`);
                    }
                }
            } while (progress.status === 'processing');

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            this.results.transcription = {
                success: progress.status === 'done',
                duration: duration,
                chunks: progress.total,
                chunksProcessed: progress.done,
                errors: progress.errors.length,
                chunksPerSecond: progress.done / duration,
                finalStats: progress.finalStats
            };

            console.log(`✅ Transcrição concluída: ${progress.done}/${progress.total} chunks em ${duration.toFixed(2)}s`);
            console.log(`⚡ Performance: ${(progress.done / duration).toFixed(2)} chunks/s`);

        } catch (error) {
            this.results.errors.push({
                operation: 'transcription',
                error: error.message
            });
            console.error('❌ Erro na transcrição:', error.message);
        }
    }

    generateReport() {
        console.log('\n🎯 ===== RELATÓRIO DE TESTE DE PERFORMANCE =====');
        
        if (this.results.splitting) {
            console.log('\n📊 DIVISÃO DE ÁUDIO:');
            console.log(`   ✅ Sucesso: ${this.results.splitting.success}`);
            console.log(`   ⏱️  Duração: ${this.results.splitting.duration.toFixed(2)}s`);
            console.log(`   📦 Chunks: ${this.results.splitting.chunks}`);
            console.log(`   ⚡ Performance: ${this.results.splitting.chunksPerSecond.toFixed(2)} chunks/s`);
        }

        if (this.results.transcription) {
            console.log('\n🎙️  TRANSCRIÇÃO:');
            console.log(`   ✅ Sucesso: ${this.results.transcription.success}`);
            console.log(`   ⏱️  Duração: ${this.results.transcription.duration.toFixed(2)}s`);
            console.log(`   📦 Chunks: ${this.results.transcription.chunksProcessed}/${this.results.transcription.chunks}`);
            console.log(`   ❌ Erros: ${this.results.transcription.errors}`);
            console.log(`   ⚡ Performance: ${this.results.transcription.chunksPerSecond.toFixed(2)} chunks/s`);
        }

        if (this.results.errors.length > 0) {
            console.log('\n❌ ERROS:');
            this.results.errors.forEach(error => {
                console.log(`   - ${error.operation}: ${error.error}`);
            });
        }

        console.log('\n🎯 ============================================\n');

        // Salva relatório
        const reportPath = path.join(__dirname, 'performance_test_report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            results: this.results
        }, null, 2));
        
        console.log(`📋 Relatório salvo em: ${reportPath}`);
    }
}

// Função principal de teste
async function runPerformanceTest() {
    const test = new PerformanceTest();
    
    console.log('🚀 Iniciando teste de performance das otimizações...\n');
    
    // Você precisa fornecer um sessionId e filename válidos
    const sessionId = 'test-session-' + Date.now();
    const filename = 'test-audio.mp3'; // Substitua por um arquivo real
    
    console.log(`📁 Sessão de teste: ${sessionId}`);
    console.log(`🎵 Arquivo: ${filename}\n`);
    
    // Teste de divisão
    await test.testSplitting(sessionId, filename);
    
    // Teste de transcrição (apenas se divisão foi bem-sucedida)
    if (test.results.splitting && test.results.splitting.success) {
        await test.testTranscription(sessionId);
    }
    
    // Gera relatório final
    test.generateReport();
}

// Executa se chamado diretamente
if (require.main === module) {
    runPerformanceTest().catch(console.error);
}

module.exports = { PerformanceTest };
