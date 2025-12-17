"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVoiceMessage = processVoiceMessage;
exports.isVoiceMessage = isVoiceMessage;
exports.extractAudioFromMessage = extractAudioFromMessage;
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os_1 = require("os");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
/**
 * Downloads audio file from WhatsApp Business API
 */
async function downloadAudioFromWhatsApp(audioId, wabaToken) {
    try {
        // 1. Get media URL from WhatsApp API
        const mediaResponse = await axios_1.default.get(`https://graph.facebook.com/v18.0/${audioId}`, {
            headers: {
                'Authorization': `Bearer ${wabaToken}`
            }
        });
        const mediaUrl = mediaResponse.data.url;
        // 2. Download the actual file
        const fileResponse = await axios_1.default.get(mediaUrl, {
            headers: {
                'Authorization': `Bearer ${wabaToken}`
            },
            responseType: 'arraybuffer'
        });
        // 3. Save to temporary file
        const tempDir = (0, os_1.tmpdir)();
        const tempFileName = `audio_${audioId}_${Date.now()}.ogg`;
        const tempFilePath = path.join(tempDir, tempFileName);
        fs.writeFileSync(tempFilePath, fileResponse.data);
        console.log('Arquivo de áudio baixado:', tempFilePath);
        return tempFilePath;
    }
    catch (error) {
        console.error('Erro ao baixar áudio do WhatsApp:', error);
        throw new Error('Falha ao baixar arquivo de áudio');
    }
}
/**
 * Converts audio to text using OpenAI Whisper
 */
async function transcribeAudio(audioFilePath) {
    try {
        console.log('Iniciando transcrição do áudio:', audioFilePath);
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioFilePath),
            model: 'whisper-1',
            language: 'pt', // Portuguese
            response_format: 'text'
        });
        console.log('Transcrição concluída:', transcription);
        // Clean up temporary file
        if (fs.existsSync(audioFilePath)) {
            fs.unlinkSync(audioFilePath);
            console.log('Arquivo temporário removido:', audioFilePath);
        }
        return transcription.trim();
    }
    catch (error) {
        console.error('Erro na transcrição do áudio:', error);
        // Clean up on error
        if (fs.existsSync(audioFilePath)) {
            fs.unlinkSync(audioFilePath);
        }
        throw new Error('Falha na transcrição do áudio');
    }
}
/**
 * Main function to process voice message and convert to text
 */
async function processVoiceMessage(audioMessage, store) {
    if (!store.wabaEnvironments?.wabaAccessToken) {
        throw new Error('Token WABA não configurado para a loja');
    }
    const wabaToken = store.wabaEnvironments.wabaAccessToken;
    try {
        // 1. Download audio file
        const audioFilePath = await downloadAudioFromWhatsApp(audioMessage.id, wabaToken);
        // 2. Transcribe to text
        const transcription = await transcribeAudio(audioFilePath);
        if (!transcription || transcription.length < 3) {
            throw new Error('Transcrição muito curta ou vazia');
        }
        console.log('Mensagem de voz processada com sucesso:', transcription);
        return transcription;
    }
    catch (error) {
        console.error('Erro ao processar mensagem de voz:', error);
        throw error;
    }
}
/**
 * Checks if message is a voice message
 */
function isVoiceMessage(message) {
    return message?.type === 'audio' && message?.audio;
}
/**
 * Extracts audio data from WhatsApp message
 */
function extractAudioFromMessage(message) {
    if (!isVoiceMessage(message)) {
        return null;
    }
    return {
        id: message.audio.id,
        mime_type: message.audio.mime_type,
        sha256: message.audio.sha256
    };
}
