import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import { useSearchParams, useNavigate } from 'react-router-dom';

const CreateItemSimple: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const merchantId = searchParams.get('merchantId');
  const categoryId = searchParams.get('categoryId');
  
  const [formData, setFormData] = useState({
    itemName: '',
    itemPrice: '',
    itemDescription: '',
    productName: '',
    productDescription: '',
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSubmitError(null);

    try {
      const itemData = {
        item: {
          id: crypto.randomUUID(),
          type: 'DEFAULT',
          categoryId: categoryId,
          status: 'AVAILABLE',
          price: {
            value: parseFloat(formData.itemPrice),
            originalValue: parseFloat(formData.itemPrice)
          },
          externalCode: `item_${Date.now()}`,
          index: 0,
          productId: crypto.randomUUID(),
          shifts: null,
          tags: null,
          contextModifiers: [],
        },
        products: [
          {
            id: crypto.randomUUID(),
            name: formData.productName || formData.itemName,
            description: formData.productDescription || formData.itemDescription,
            additionalInformation: '',
            imagePath: '',
            ean: '',
            serving: 'SERVES_1',
            dietaryRestrictions: null,
            quantity: null,
            optionGroups: null,
            tags: [],
            industrialized: false,
          }
        ],
        optionGroups: [],
        options: [],
      };

      const response = await fetch(`http://localhost:3001/api/merchants/${merchantId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        throw new Error('Erro ao criar item');
      }

      navigate(`/categories/${categoryId}/items?merchantId=${merchantId}`);
    } catch (error: any) {
      setSubmitError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!merchantId || !categoryId) {
    return (
      <Alert severity="error">
        Merchant ID e Category ID são obrigatórios.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Criar Item Simples
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Merchant ID: {merchantId} | Category ID: {categoryId}
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nome do Item"
                value={formData.itemName}
                onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Preço"
                type="number"
                value={formData.itemPrice}
                onChange={(e) => setFormData({ ...formData, itemPrice: e.target.value })}
                required
                inputProps={{ step: "0.01" }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descrição do Item"
                multiline
                rows={3}
                value={formData.itemDescription}
                onChange={(e) => setFormData({ ...formData, itemDescription: e.target.value })}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nome do Produto"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                helperText="Se vazio, será usado o nome do item"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descrição do Produto"
                multiline
                rows={3}
                value={formData.productDescription}
                onChange={(e) => setFormData({ ...formData, productDescription: e.target.value })}
                helperText="Se vazio, será usada a descrição do item"
              />
            </Grid>
          </Grid>

          {submitError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {submitError}
            </Alert>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading || !formData.itemName || !formData.itemPrice}
            >
              {isLoading ? 'Criando...' : 'Criar Item'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(`/categories/${categoryId}/items?merchantId=${merchantId}`)}
            >
              Cancelar
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
};

export default CreateItemSimple;