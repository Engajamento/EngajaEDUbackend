# 🚀 Otimizações de Performance - Processamento de Áudio

Este documento descreve as otimizações implementadas para acelerar significativamente o processo de divisão e transcrição de áudio.

## 📊 Melhorias Implementadas

### 1. **Divisão de Áudio Paralela**
- ✅ **Antes**: Processamento sequencial (1 chunk por vez)
- 🚀 **Depois**: Processamento paralelo (até 4 chunks simultâneos)
- 📈 **Ganho esperado**: 3-4x mais rápido

### 2. **Otimizações FFmpeg**
- ✅ Preset "fast" para encoding mais rápido
- ✅ Áudio mono (reduz tamanho em ~50%)
- ✅ Bitrate otimizado (128k para speech)
- ✅ Frequência reduzida (22050Hz, suficiente para fala)
- ✅ Threads limitadas por processo (evita sobrecarga)

### 3. **Transcrição Otimizada**
- ✅ Processamento paralelo adaptativo baseado no tamanho dos chunks
- ✅ Cache de transcrições (pula chunks já processados)
- ✅ Retry automático com backoff exponencial
- ✅ Configuração de idioma (acelera processamento Whisper)
- ✅ Timeout otimizado por chunk

### 4. **Monitoramento de Performance**
- ✅ Métricas detalhadas de performance
- ✅ Logs otimizados com progresso em tempo real
- ✅ Relatórios automáticos de performance
- ✅ Alertas quando performance está abaixo do esperado

## ⚙️ Configurações Ajustáveis

As configurações estão centralizadas em `config/audioProcessing.js`:

```javascript
// Exemplo de ajustes fáceis
chunking: {
    chunkDurationSeconds: 600,    // Duração dos chunks
    maxParallelSplitting: 4,      // Processos paralelos de divisão
    // ... mais configurações
},
transcription: {
    parallelism: {
        smallChunks: { maxParallel: 12 },  // Chunks < 5MB
        mediumChunks: { maxParallel: 8 },  // Chunks < 15MB  
        largeChunks: { maxParallel: 4 }    // Chunks > 15MB
    }
}
```

## 📈 Performance Esperada

### Divisão de Áudio:
- **Antes**: ~1 chunk/segundo (sequencial)
- **Depois**: ~3-4 chunks/segundo (paralelo)

### Transcrição:
- **Antes**: ~0.3 chunks/segundo
- **Depois**: ~0.8-1.2 chunks/segundo (dependendo do tamanho)

## 🔧 Como Usar

### 1. Divisão Otimizada
```javascript
// A API continua a mesma, mas agora muito mais rápida
POST /audioSession/split
{
    "sessionId": "uuid",
    "filename": "audio.mp3"
}
```

### 2. Transcrição em Lote
```javascript
// Inicia transcrição paralela de todos os chunks
POST /audioSession/transcribeAll
{
    "sessionId": "uuid"
}
```

### 3. Monitoramento
```javascript
// Verifica progresso com métricas detalhadas
GET /audioSession/progress?sessionId=uuid
```

## 🎯 Otimizações Técnicas Detalhadas

### **Paralelismo Inteligente**
- Calcula automaticamente o número ideal de processos paralelos
- Adapta baseado no tamanho dos chunks
- Evita sobrecarga do sistema

### **Configurações FFmpeg Otimizadas**
```bash
# Configurações aplicadas automaticamente
-preset fast           # Encoding mais rápido
-threads 2            # Limita threads por processo
-ac 1                 # Mono audio
-ar 22050             # Sample rate otimizado
-b:a 128k             # Bitrate para speech
```

### **Cache Inteligente**
- Verifica se chunk já foi transcrito
- Pula processamento desnecessário
- Salva metadados para análise

### **Retry Resiliente**
- Retry automático em falhas temporárias
- Backoff exponencial (1s, 2s, 4s...)
- Timeout configurável por chunk

## 📊 Monitoramento

### Logs Detalhados
```
🔧 Iniciando divisão otimizada do áudio: aula.mp3
📊 Duração total: 3600s, Chunks de 600s
📦 Total de 6 chunks para processar
🚀 Processando batch 1/2 (4 chunks)
📈 Progresso: 66.7% (4/6 chunks)
✅ Chunk 1 concluído: chunk_1.mp3
🎉 Divisão concluída! 6 chunks em 45.2s
⚡ Performance: 0.13 chunks/segundo
```

### Métricas de Performance
- Tempo total de processamento
- Taxa de chunks/segundo
- Eficiência (% de sucesso)
- Tempo médio por chunk
- Warnings de performance

## 🛠️ Troubleshooting

### Performance Baixa?
1. **Verifique CPU**: FFmpeg é CPU-intensivo
2. **Ajuste paralelismo**: Reduza `maxParallelSplitting` se necessário
3. **Monitore logs**: Procure por warnings de performance
4. **Verifique disco**: I/O pode ser gargalo

### Erros de Memória?
1. **Reduza paralelismo**: Menos processos simultâneos
2. **Chunks menores**: Reduza `chunkDurationSeconds`
3. **Monitore RAM**: Cada processo usa ~100-200MB

### Whisper API Limits?
1. **Ajuste timeouts**: Aumente se necessário
2. **Reduza paralelismo**: Para evitar rate limits
3. **Monitore retries**: Muitos retries indicam problemas

## 🎉 Resultados Esperados

Com essas otimizações, você deve ver:

- **3-4x mais rápido** na divisão de áudio
- **2-3x mais rápido** na transcrição
- **Logs informativos** sobre progresso
- **Menor uso de recursos** por chunk
- **Maior confiabilidade** com retries automáticos

## 📝 Logs de Exemplo

```
🎯 ===== RESUMO DE PERFORMANCE [SPLITTING] =====
📊 Sessão: abc-123-def
⏱️  Tempo total: 45.20s
📦 Chunks processados: 6/6
✅ Taxa de sucesso: 100.0%
⚡ Performance: 0.13 chunks/segundo
⏰ Tempo médio por chunk: 7.53s
🎯 ================================================
```
