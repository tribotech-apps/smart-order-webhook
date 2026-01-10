import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { WABAEnvironments } from '../types/Store';
import { sendMessage } from './messagingService';
import axios from 'axios';
import FormData from 'form-data';

// Initialize the Text-to-Speech client
const ttsClient = new TextToSpeechClient();

/**
 * Converte texto em áudio usando Google Cloud Text-to-Speech
 * @param text Texto para converter em áudio
 * @returns Buffer com dados do áudio
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  try {
    // Remove emojis e formatação especial do texto para melhor síntese
    const cleanText = text
      .replace(/[📍🚚🔍❌✅💰🔹👆📋📝🏠⬇️❓💬🍽️📦💳📱🛒💵]/g, '') // Remove emojis
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove formatação negrito
      .replace(/\n\n+/g, '. ') // Substitui quebras duplas por pausa
      .replace(/\n/g, ' ') // Substitui quebras simples por espaço
      .replace(/[A-Z]\s+[A-Z]/g, (match) => match.replace(/\s/g, '')) // Remove espaços entre letras maiúsculas
      .trim();

    const request = {
      input: { text: cleanText },
      voice: {
        languageCode: 'pt-BR',
        name: 'pt-BR-Neural2-A', // Voz feminina neural brasileira
        ssmlGender: 'FEMALE' as const
      },
      audioConfig: {
        audioEncoding: 'OGG_OPUS' as const, // Formato compatível com WhatsApp
        speakingRate: 0.9, // Velocidade um pouco mais lenta para acessibilidade
        pitch: 0.0,
        volumeGainDb: 0.0
      }
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    if (!response.audioContent) {
      throw new Error('Não foi possível gerar o áudio');
    }

    return Buffer.from(response.audioContent as Uint8Array);
  } catch (error) {
    console.error('Erro no Text-to-Speech:', error);
    throw error;
  }
}

/**
 * Faz upload do áudio para o WhatsApp Business API
 * @param audioBuffer Buffer com dados do áudio
 * @param wabaEnvironments Configurações do WABA
 * @returns ID do áudio no WhatsApp
 */
export async function uploadAudioToWABA(audioBuffer: Buffer, wabaEnvironments: WABAEnvironments): Promise<string> {
  try {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/media`;
    
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.ogg',
      contentType: 'audio/ogg'
    });
    formData.append('type', 'audio/ogg');
    formData.append('messaging_product', 'whatsapp');

    const response = await axios.post(url, formData, {
      headers: {
        'Authorization': `Bearer ${wabaEnvironments.wabaAccessToken}`,
        ...formData.getHeaders(),
      },
    });

    return response.data.id;
  } catch (error) {
    console.error('Erro no upload do áudio para WABA:', error);
    throw error;
  }
}

/**
 * Envia mensagem de texto com áudio opcional para acessibilidade
 * @param to Número de telefone do destinatário
 * @param textBody Texto da mensagem
 * @param wabaEnvironments Configurações do WABA
 * @param includeAudio Se deve incluir versão em áudio (padrão: true)
 */
export async function sendMessageWithAudio(
  to: string,
  textBody: string,
  wabaEnvironments: WABAEnvironments,
  includeAudio: boolean = true
): Promise<void> {
  try {
    // Sempre enviar a mensagem de texto primeiro
    await sendMessage({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: textBody }
    }, wabaEnvironments);

    // Se solicitado, enviar também versão em áudio
    if (includeAudio) {
      try {
        const audioBuffer = await textToSpeech(textBody);
        const audioId = await uploadAudioToWABA(audioBuffer, wabaEnvironments);
        
        await sendMessage({
          messaging_product: 'whatsapp',
          to: to,
          type: 'audio',
          audio: { id: audioId }
        }, wabaEnvironments);
        
        console.log('✅ Mensagem enviada com áudio para:', to);
      } catch (audioError) {
        console.error('⚠️ Erro ao enviar áudio, apenas texto enviado:', audioError);
        // Não falha se o áudio não funcionar - texto já foi enviado
      }
    }
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    throw error;
  }
}