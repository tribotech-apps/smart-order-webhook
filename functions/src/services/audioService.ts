import OpenAI from 'openai';
import { Store } from '../types/Store';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AudioMessage {
  id: string;
  mime_type: string;
  sha256: string;
}

/**
 * Downloads audio file from WhatsApp Business API
 */
async function downloadAudioFromWhatsApp(
  audioId: string, 
  wabaToken: string
): Promise<string> {
  try {
    // 1. Get media URL from WhatsApp API
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${audioId}`,
      {
        headers: {
          'Authorization': `Bearer ${wabaToken}`
        }
      }
    );

    const mediaUrl = mediaResponse.data.url;

    // 2. Download the actual file
    const fileResponse = await axios.get(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${wabaToken}`
      },
      responseType: 'arraybuffer'
    });

    // 3. Save to temporary file
    const tempDir = tmpdir();
    const tempFileName = `audio_${audioId}_${Date.now()}.ogg`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    fs.writeFileSync(tempFilePath, fileResponse.data);
    
    console.log('Arquivo de áudio baixado:', tempFilePath);
    return tempFilePath;
    
  } catch (error) {
    console.error('Erro ao baixar áudio do WhatsApp:', error);
    throw new Error('Falha ao baixar arquivo de áudio');
  }
}

/**
 * Converts audio to text using OpenAI Whisper
 */
async function transcribeAudio(audioFilePath: string): Promise<string> {
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
    
  } catch (error) {
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
export async function processVoiceMessage(
  audioMessage: AudioMessage,
  store: Store
): Promise<string> {
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
    
  } catch (error) {
    console.error('Erro ao processar mensagem de voz:', error);
    throw error;
  }
}

/**
 * Checks if message is a voice message
 */
export function isVoiceMessage(message: any): boolean {
  return message?.type === 'audio' && message?.audio;
}

/**
 * Extracts audio data from WhatsApp message
 */
export function extractAudioFromMessage(message: any): AudioMessage | null {
  if (!isVoiceMessage(message)) {
    return null;
  }
  
  return {
    id: message.audio.id,
    mime_type: message.audio.mime_type,
    sha256: message.audio.sha256
  };
}