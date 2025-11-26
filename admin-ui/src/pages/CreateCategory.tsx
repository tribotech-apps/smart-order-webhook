import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Alert,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useMutation } from 'react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { IFoodAdminAPI } from '../services/api';
import { CreateCategoryRequest } from '../types/IFood';

const CreateCategory: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const merchantId = searchParams.get('merchantId');
  const catalogId = searchParams.get('catalogId');
  
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<CreateCategoryRequest>();

  const createCategoryMutation = useMutation(
    (data: CreateCategoryRequest) => IFoodAdminAPI.createCategory(merchantId!, catalogId!, data),
    {
      onSuccess: () => {
        navigate(`/catalogs/${catalogId}/categories?merchantId=${merchantId}`);
      },
      onError: (error: any) => {
        setSubmitError(error.response?.data?.message || 'Erro ao criar categoria');
      },
    }
  );

  const onSubmit = (data: CreateCategoryRequest) => {
    setSubmitError(null);
    createCategoryMutation.mutate(data);
  };

  if (!merchantId || !catalogId) {
    return (
      <Alert severity="error">
        Merchant ID e Catalog ID são obrigatórios.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Criar Nova Categoria
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Merchant ID: {merchantId} | Catalog ID: {catalogId}
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nome da Categoria"
                {...register('name', { 
                  required: 'Nome da categoria é obrigatório',
                  minLength: { value: 2, message: 'Nome deve ter pelo menos 2 caracteres' }
                })}
                error={!!errors.name}
                helperText={errors.name?.message}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Ordem"
                type="number"
                {...register('order')}
                helperText="Ordem de exibição da categoria (opcional)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Template"
                {...register('template')}
                helperText="Template da categoria (opcional)"
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
              disabled={createCategoryMutation.isLoading}
            >
              {createCategoryMutation.isLoading ? 'Criando...' : 'Criar Categoria'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(`/catalogs/${catalogId}/categories?merchantId=${merchantId}`)}
            >
              Cancelar
            </Button>
          </Box>
        </form>
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Alert severity="info">
          <Typography variant="subtitle2" gutterBottom>
            Informações importantes:
          </Typography>
          <ul>
            <li>O nome da categoria é obrigatório</li>
            <li>A ordem determina a posição da categoria no cardápio</li>
            <li>O template pode ser usado para aplicar estilos específicos</li>
            <li>Após criar, você poderá adicionar itens à categoria</li>
          </ul>
        </Alert>
      </Box>
    </Box>
  );
};

export default CreateCategory;