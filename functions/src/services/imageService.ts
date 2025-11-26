import axios from 'axios';
import FormData from 'form-data';
import { notifyAdmin } from '../services/messagingService';
import { WABAEnvironments } from '../types/Store';

export const uploadImageFromUrlToWABA = async (imageUrl: string, wabaEnvironments: WABAEnvironments): Promise<string> => {
  const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/media`;

  try {
    // Faz o download da imagem como um buffer
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    // Cria um formulário com a imagem
    const formData = new FormData();
    formData.append('file', Buffer.from(imageResponse.data), {
      filename: 'image.jpg',
      contentType: imageResponse.headers['content-type'] || 'image/jpeg',
    });
    formData.append('type', 'image/jpeg'); // Tipo de mídia
    formData.append('messaging_product', 'whatsapp'); // Produto de mensagens

    console.log('Enviando imagem para o WABA:', formData);
    // Faz a requisição para o WABA
    const response = await axios.post(url, formData, {
      headers: {
        Authorization: `Bearer ${wabaEnvironments.wabaAccessToken}`,
        ...formData.getHeaders(), // Inclui os cabeçalhos do FormData
      },
    });

    const mediaId = response.data.id;
    // console.log('Imagem enviada com sucesso. ID da mídia:', mediaId);
    return mediaId;
  } catch (error: any) {
    notifyAdmin('Erro ao enviar imagem ao WABA:', error.response?.data || error.message);
    throw new Error('Erro ao enviar imagem ao WABA');
  }
};

export const uploadImageFromUrlToWABAGeneric = async (imageUrl: string, contentType: string, wabaEnvironments: WABAEnvironments): Promise<string> => {
  const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/media`;

  try {
    // Faz o download da imagem como um buffer
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    // Cria um formulário com a imagem
    const formData = new FormData();
    formData.append('file', Buffer.from(imageResponse.data), {
      filename: `image.${contentType.split('/')[1]}`, // Define a extensão com base no tipo de conteúdo
      contentType: contentType, // Tipo de conteúdo recebido como parâmetro
    });
    formData.append('type', contentType); // Tipo de mídia
    formData.append('messaging_product', 'whatsapp'); // Produto de mensagens

    // Faz a requisição para o WABA
    const response = await axios.post(url, formData, {
      headers: {
        Authorization: `Bearer ${wabaEnvironments.wabaAccessToken}`,
        ...formData.getHeaders(), // Inclui os cabeçalhos do FormData
      },
    });

    const mediaId = response.data.id;
    console.log('Imagem enviada com sucesso. ID da mídia:', mediaId);
    return mediaId;
  } catch (error: any) {
    notifyAdmin('Erro ao enviar imagem ao WABA:', error.response?.data || error.message);
    throw new Error('Erro ao enviar imagem ao WABA');
  }
};

export const deleteImageFromWABA = async (mediaId: string, wabaEnvironments: WABAEnvironments): Promise<void> => {
  const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${mediaId}`;

  try {
    const response = await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${wabaEnvironments.wabaAccessToken}`,
      },
    });

    // console.log('Imagem deletada com sucesso. Resposta:', response.data);
  } catch (error: any) {
    notifyAdmin('Erro ao deletar imagem do WABA:', error.response?.data || error.message);
    throw new Error('Erro ao deletar imagem do WABA');
  }
};

export async function uploadImageToWABA(imageUrl: string, wabaEnvironments: WABAEnvironments): Promise<{ id: string }> {
  try {
    const id = await uploadImageFromUrlToWABA(imageUrl, wabaEnvironments);
    return { id }
  } catch (error: any) {
    notifyAdmin('Erro ao fazer upload da imagem para o WABA:', error.response?.data || error.message);
    throw new Error('Erro ao fazer upload da imagem para o WABA.');
  }
}