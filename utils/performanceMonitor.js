// Utilitários para monitoramento de performance do processamento de áudio
const fs = require('fs');
const path = require('path');
const audioConfig = require('../config/audioProcessing');

class PerformanceMonitor {
    constructor(sessionId, operation) {
        this.sessionId = sessionId;
        this.operation = operation; // 'splitting' ou 'transcription'
        this.startTime = Date.now();
        this.metrics = {
            startTime: this.startTime,
            operation: operation,
            sessionId: sessionId,
            chunks: [],
            totalProcessed: 0,
            errors: 0,
            warnings: []
        };
    }

    recordChunkStart(chunkName, chunkSize = null) {
        const chunk = {
            name: chunkName,
            size: chunkSize,
            startTime: Date.now(),
            endTime: null,
            duration: null,
            success: null,
            error: null
        };
        
        this.metrics.chunks.push(chunk);
        
        if (audioConfig.monitoring.enableDetailedLogs) {
            console.log(`📊 [${this.operation}] Iniciando: ${chunkName}`);
        }
        
        return chunk;
    }

    recordChunkEnd(chunkName, success = true, error = null) {
        const chunk = this.metrics.chunks.find(c => c.name === chunkName);
        if (chunk) {
            chunk.endTime = Date.now();
            chunk.duration = chunk.endTime - chunk.startTime;
            chunk.success = success;
            chunk.error = error;
            
            this.metrics.totalProcessed++;
            if (!success) this.metrics.errors++;
            
            if (audioConfig.monitoring.enableDetailedLogs) {
                const status = success ? '✅' : '❌';
                console.log(`📊 [${this.operation}] ${status} ${chunkName} - ${(chunk.duration/1000).toFixed(2)}s`);
            }
        }
    }

    logProgress() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = this.metrics.totalProcessed / elapsed;
        const total = this.metrics.chunks.length;
        const remaining = total - this.metrics.totalProcessed;
        const eta = remaining > 0 ? remaining / rate : 0;

        console.log(`📈 [${this.operation}] Progresso: ${this.metrics.totalProcessed}/${total} (${(this.metrics.totalProcessed/total*100).toFixed(1)}%)`);
        console.log(`⚡ Taxa: ${rate.toFixed(2)} chunks/s - ETA: ${eta.toFixed(0)}s`);
        
        // Verifica se está abaixo da performance esperada
        const expectedRate = this.operation === 'splitting' 
            ? audioConfig.monitoring.expectedPerformance.chunksPerSecondSplitting
            : audioConfig.monitoring.expectedPerformance.chunksPerSecondTranscription;
            
        if (rate < expectedRate * 0.7) { // 30% abaixo do esperado
            this.addWarning(`Performance abaixo do esperado: ${rate.toFixed(2)} chunks/s (esperado: ${expectedRate})`);
        }
    }

    addWarning(message) {
        const warning = {
            timestamp: Date.now(),
            message: message
        };
        this.metrics.warnings.push(warning);
        console.warn(`⚠️  [${this.operation}] ${message}`);
    }

    generateReport() {
        const endTime = Date.now();
        const totalDuration = (endTime - this.startTime) / 1000;
        
        const successfulChunks = this.metrics.chunks.filter(c => c.success);
        const failedChunks = this.metrics.chunks.filter(c => !c.success);
        
        const avgChunkTime = successfulChunks.length > 0 
            ? successfulChunks.reduce((sum, c) => sum + c.duration, 0) / successfulChunks.length / 1000
            : 0;
            
        const rate = this.metrics.totalProcessed / totalDuration;
        
        const report = {
            ...this.metrics,
            endTime: endTime,
            totalDuration: totalDuration,
            successfulChunks: successfulChunks.length,
            failedChunks: failedChunks.length,
            avgChunkTimeSeconds: avgChunkTime,
            chunksPerSecond: rate,
            efficiency: this.metrics.chunks.length > 0 ? (successfulChunks.length / this.metrics.chunks.length) * 100 : 0
        };

        if (audioConfig.monitoring.enablePerformanceMetrics) {
            this.saveReport(report);
        }

        return report;
    }

    saveReport(report) {
        try {
            const reportsDir = path.join(__dirname, '..', 'temp', this.sessionId, 'reports');
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            
            const filename = `${this.operation}_performance_${Date.now()}.json`;
            const filepath = path.join(reportsDir, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
            console.log(`📋 Relatório de performance salvo: ${filename}`);
        } catch (error) {
            console.error('❌ Erro ao salvar relatório de performance:', error);
        }
    }

    logFinalSummary() {
        const report = this.generateReport();
        
        console.log(`\n🎯 ===== RESUMO DE PERFORMANCE [${this.operation.toUpperCase()}] =====`);
        console.log(`📊 Sessão: ${this.sessionId}`);
        console.log(`⏱️  Tempo total: ${report.totalDuration.toFixed(2)}s`);
        console.log(`📦 Chunks processados: ${report.successfulChunks}/${report.chunks.length}`);
        console.log(`✅ Taxa de sucesso: ${report.efficiency.toFixed(1)}%`);
        console.log(`⚡ Performance: ${report.chunksPerSecond.toFixed(2)} chunks/segundo`);
        console.log(`⏰ Tempo médio por chunk: ${report.avgChunkTimeSeconds.toFixed(2)}s`);
        
        if (report.warnings.length > 0) {
            console.log(`⚠️  Avisos: ${report.warnings.length}`);
        }
        
        if (report.failedChunks > 0) {
            console.log(`❌ Falhas: ${report.failedChunks}`);
        }
        
        console.log(`🎯 ================================================\n`);
        
        return report;
    }
}

module.exports = { PerformanceMonitor };
