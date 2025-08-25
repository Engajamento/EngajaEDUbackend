/**
 * @file audioController.js
 * @description Este arquivo é responsável por controlar as operações relacionadas a áudio, como dividir e transcrever arquivos de áudio.
 */

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { createTranscription, handleOpenAIError } = require('../utils/openaiAxios');
const { v4: uuidv4 } = require('uuid');

/**
 * @async
 * @function dividirAudio
 * @description Divide um arquivo de áudio em chunks de 10 minutos.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function dividirAudio(req, res) {
  try {
    // 1. Pega o arquivo enviado
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ error: 'Arquivo de áudio não enviado.' });
    }

    // 2. Define onde salvar os chunks
    const outputDir = path.join(__dirname, '..', 'chunks_temp');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // 3. Caminho do arquivo original
    const inputPath = audioFile.path;

    // 4. Descobre a duração do áudio
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return res.status(500).json({ error: 'Erro ao ler o áudio.' });

      const duration = metadata.format.duration; // em segundos
      const chunkDuration = 600; // 10 minutos = 600 segundos
      const chunks = [];
      let start = 0, idx = 1;

      function processNextChunk() {
        if (start >= duration) {
          // Terminou
          return res.json({ chunks });
        }
        const end = Math.min(start + chunkDuration, duration);
        const outputPath = path.join(outputDir, `chunk_${idx}.mp3`);
        ffmpeg(inputPath)
          .setStartTime(start)
          .setDuration(end - start)
          .output(outputPath)
          .on('end', () => {
            chunks.push(outputPath);
            start += chunkDuration;
            idx += 1;
            processNextChunk();
          })
          .on('error', (err) => {
            return res.status(500).json({ error: 'Erro ao dividir o áudio.' });
          })
          .run();
      }
      processNextChunk();
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao dividir o áudio.' });
  }
}

/**
 * @async
 * @function transcreverAudio
 * @description Transcreve um arquivo de áudio usando a API do Whisper da OpenAI.
 * @param {Object} req - O objeto de requisição do Express.
 * @param {Object} res - O objeto de resposta do Express.
 */
async function transcreverAudio(req, res) {
  try {
    console.log('🔹 [transcreverAudio] Início da função');

    // 1. Verifica se o arquivo foi enviado
    const audioFile = req.file;
    console.log('🔹 [transcreverAudio] Arquivo recebido:', audioFile ? audioFile.originalname : 'NENHUM');
    if (!audioFile) {
      return res.status(400).json({ error: 'Arquivo de áudio não enviado.' });
    }

    // 2. Recebe e valida o nome do arquivo de saída
    let { outputFile } = req.body;
    console.log('🔹 [transcreverAudio] outputFile recebido:', outputFile);
    if (!/^[a-zA-Z0-9_\-]{3,50}$/.test(outputFile)) {
      console.log('❌ [transcreverAudio] Nome de arquivo inválido:', outputFile);
      return res.status(400).json({ error: 'Nome de arquivo inválido.' });
    }

    // 3. Cria diretório de saída se necessário
    const outputDir = path.join(__dirname, '..', 'transcricoes');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
      console.log('🔹 [transcreverAudio] Diretório transcricoes criado:', outputDir);
    } else {
      console.log('🔹 [transcreverAudio] Diretório transcricoes já existe:', outputDir);
    }

    // 4. Gera nome seguro para o arquivo de saída
    const safeFileName = `${outputFile}_${uuidv4()}.txt`;
    const resolvedPath = path.resolve(outputDir, safeFileName);
    console.log('🔹 [transcreverAudio] resolvedPath:', resolvedPath);

    // 5. Verificação path traversal
    const relative = path.relative(outputDir, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      console.log('❌ [transcreverAudio] Path traversal detectado:', resolvedPath);
      return res.status(400).json({ error: 'Tentativa de path traversal detectada.' });
    }

    // 6. Log info do arquivo salvo pelo multer
    console.log('🔹 [transcreverAudio] Caminho do arquivo salvo pelo multer:', audioFile.path);
    console.log('🔹 [transcreverAudio] mimetype:', audioFile.mimetype);

    // 7. Log tamanho do arquivo
    const stats = fs.statSync(audioFile.path);
    console.log('🔹 [transcreverAudio] Tamanho do arquivo:', stats.size, 'bytes');

    // 8. Chama a API do Whisper para transcrever
    console.log('🔹 [transcreverAudio] Enviando arquivo para OpenAI Whisper...');

    const originalExt = path.extname(audioFile.originalname) || '.mp3';
    const tempPath = audioFile.path + originalExt;
    fs.copyFileSync(audioFile.path, tempPath);

    try {
      const transcription = await createTranscription(tempPath, {
        model: 'whisper-1',
        response_format: 'text'
      });
      
      console.log('🔹 [transcreverAudio] Transcrição recebida da OpenAI');

      // 9. Salva a transcrição no arquivo (write, não append)
      fs.writeFileSync(resolvedPath, transcription + '\n', { flag: 'wx' });
      console.log('🔹 [transcreverAudio] Transcrição salva em:', resolvedPath);

      fs.unlinkSync(tempPath);

      res.json({ message: 'Transcrição realizada com sucesso.', output: resolvedPath });
    } catch (error) {
      fs.unlinkSync(tempPath);
      throw error;
    }

    res.json({ message: 'Transcrição realizada com sucesso.', output: resolvedPath });
  } catch (error) {
    console.error('❌ [transcreverAudio] Erro:', error);
    if (error.code === 'EEXIST') {
      return res.status(409).json({ error: 'Arquivo de transcrição já existe.' });
    }
    
    try {
      handleOpenAIError(error);
    } catch (handledError) {
      return res.status(500).json({ error: handledError.message });
    }
    
    res.status(500).json({ error: 'Erro ao transcrever o áudio.', details: error.message });
  }
}

module.exports = { dividirAudio, transcreverAudio };