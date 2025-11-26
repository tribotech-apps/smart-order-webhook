import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import { sendConfirmationMessage, sendDeliveredMessage, sendDeliveryMessage, sendMessage } from '../../services/messagingService.js';
import { deleteImageFromWABA, uploadImageFromUrlToWABAGeneric } from '../../services/imageService.js';
import path from 'path';

require("firebase-functions/logger/compat");

const router = express.Router();
router.use(cors());

// Fazer upload da imagem
// Lista de extensões de imagens permitidas pelo WABA
const allowedImageExtensions = ['jpeg', 'png', 'webp'];

router.post('/uploadImageToWaba', async (req, res) => {
  const wabaEnvironments = typeof req.body.wabaEnvironments === 'string'
    ? JSON.parse(req.body.wabaEnvironments)
    : req.body.wabaEnvironments;

  console.log('wabaEnvironments recebido de uploadImagemToWaba', wabaEnvironments);

  if (!wabaEnvironments) {
    res.status(425).send({ error: 'wabaEnvironments não encontrado ou inválido.' });
    return;
  }

  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      res.status(400).send({ error: 'imageUrl não fornecido.' });
      return;
    }

    // Extrair a extensão da URL da imagem
    const imageExtension = path.extname(new URL(imageUrl).pathname).replace('.', '').toLowerCase();

    console.log('Extensão da imagem extraída:', imageExtension);

    // Verificar se a extensão é permitida
    if (!allowedImageExtensions.includes(imageExtension)) {
      res.status(400).send({ error: `Extensão de imagem não permitida. Permitidas: ${allowedImageExtensions.join(', ')}` });
      return;
    }

    // Construir o formato correto para o upload (image/jpeg, image/png, etc.)
    const imageMimeType = `image/${imageExtension}`;

    // Passar a URL da imagem, o formato e os ambientes WABA para a função de upload
    const response = await uploadImageFromUrlToWABAGeneric(imageUrl, imageMimeType, wabaEnvironments);
    res.status(200).send(response);
  } catch (error: any) {
    console.error('Erro ao fazer upload da imagem:', error.message);
    res.status(500).send({ error: error.message });
  }
});


// Deletar imagem
router.post('/deleteImageFromWaba', async (req, res) => {
  console.log('deleteImageFromWaba', req.body);
  const { mediaId } = req.body;
  const wabaEnvironments = req.body.wabaEnvironments || null;
  console.log('wabaEnvironments recebido de deleteImageFromWaba', wabaEnvironments, mediaId);
  if (!wabaEnvironments) {
    res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
    return;
  }


  try {
    const response = await deleteImageFromWABA(mediaId, req.body.wabaEnvironments);
    res.status(200).send(response);
  } catch (error: any) {
    res.status(500).send({ error: error.message });
  }
});


router.post('/sendOrderProduction', async (req, res) => {
  const { to, name } = req.body;
  const wabaEnvironments = req.body.wabaEnvironments || null;
  if (!wabaEnvironments) {
    res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
    return;
  }

  try {
    sendConfirmationMessage(to, wabaEnvironments);

    res.status(200);
  } catch (error: any) {
    res.status(500).send({ error: error.message });
  }
});

router.post('/sendOrderDeliveryRoute', async (req, res) => {
  const { to, name } = req.body;
  console.log('sendOrderDeliveryRoute', req.body);

  const wabaEnvironments = req.body.wabaEnvironments || null;
  if (!wabaEnvironments) {
    res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
    return;
  }

  try {
    sendDeliveryMessage(to, wabaEnvironments);


    res.status(200);
  } catch (error: any) {
    res.status(500).send({ error: error.message });
  }
});

router.post('/sendOrderDelivered', async (req, res) => {
  const { to, name } = req.body;
  const wabaEnvironments = req.body.wabaEnvironments || null;
  if (!wabaEnvironments) {
    res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
    return;
  }

  try {
    sendDeliveredMessage(to, wabaEnvironments);

    res.status(200);
  } catch (error: any) {
    res.status(500).send({ error: error.message });
  }
});

export default router;