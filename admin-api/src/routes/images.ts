import { Router, Request, Response } from 'express';
import { ifoodApi } from '../services/ifood/ifoodApiService';
import { ImageUploadResponse } from '../types/IFood';
import multer from 'multer';

const router = Router({ mergeParams: true });

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// POST /merchants/{merchantId}/image/upload
router.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file provided',
        message: 'Please provide an image file'
      });
    }
    
    console.log(`Uploading image for merchant: ${merchantId}`, {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    // Create FormData for the image upload
    const formData = new FormData();
    const uint8Array = new Uint8Array(req.file.buffer);
    const blob = new Blob([uint8Array], { type: req.file.mimetype });
    formData.append('image', blob, req.file.originalname);
    
    const result: ImageUploadResponse = await ifoodApi.uploadImage(
      'catalog',
      `/merchants/${merchantId}/image/upload`,
      formData
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error uploading image:', error.message);
    res.status(500).json({
      error: 'Failed to upload image',
      message: error.message
    });
  }
});

export default router;