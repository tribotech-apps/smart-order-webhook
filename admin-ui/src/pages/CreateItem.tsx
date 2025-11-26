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
  Divider,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation } from 'react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { IFoodAdminAPI } from '../services/api';
import { CreateCompleteItemRequest } from '../types/IFood';

const CreateItem: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const merchantId = searchParams.get('merchantId');
  const categoryId = searchParams.get('categoryId');
  
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, register, handleSubmit, formState: { errors }, watch } = useForm<CreateCompleteItemRequest>({
    defaultValues: {
      item: {
        id: '',
        type: 'DEFAULT',
        categoryId: categoryId || '',
        status: 'AVAILABLE',
        price: { value: 0, originalValue: 0 },
        externalCode: '',
        index: 0,
        productId: '',
        shifts: null,
        tags: null,
        contextModifiers: [],
      },
      products: [
        {
          id: '',
          name: '',
          description: '',
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
    },
  });

  const { fields: productFields, append: appendProduct, remove: removeProduct } = useFieldArray({
    control,
    name: 'products',
  });

  const { fields: optionGroupFields, append: appendOptionGroup, remove: removeOptionGroup } = useFieldArray({
    control,
    name: 'optionGroups',
  });

  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
    control,
    name: 'options',
  });

  const createItemMutation = useMutation(
    (data: CreateCompleteItemRequest) => IFoodAdminAPI.createCompleteItem(merchantId!, data),
    {
      onSuccess: () => {
        navigate(`/categories/${categoryId}/items?merchantId=${merchantId}`);
      },
      onError: (error: any) => {
        setSubmitError(error.response?.data?.message || 'Erro ao criar item');
      },
    }
  );

  const onSubmit = (data: CreateCompleteItemRequest) => {
    setSubmitError(null);
    
    // Generate UUIDs for new items if not provided
    if (!data.item.id) {
      data.item.id = crypto.randomUUID();
    }
    
    data.products.forEach(product => {
      if (!product.id) {
        product.id = crypto.randomUUID();
      }
    });

    data.optionGroups.forEach(group => {
      if (!group.id) {
        group.id = crypto.randomUUID();
      }
    });

    data.options.forEach(option => {
      if (!option.id) {
        option.id = crypto.randomUUID();
      }
    });

    // Set productId in item from first product
    if (data.products.length > 0) {
      data.item.productId = data.products[0].id;
    }

    createItemMutation.mutate(data);
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
        Criar Item Completo
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Merchant ID: {merchantId} | Category ID: {categoryId}
      </Typography>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Item Information */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Informações do Item</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="ID do Item"
                  {...register('item.id')}
                  placeholder="Será gerado automaticamente se vazio"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Tipo</InputLabel>
                  <Select {...register('item.type')} defaultValue="DEFAULT">
                    <MenuItem value="DEFAULT">Default</MenuItem>
                    <MenuItem value="PIZZA">Pizza</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Código Externo"
                  {...register('item.externalCode')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select {...register('item.status')} defaultValue="AVAILABLE">
                    <MenuItem value="AVAILABLE">Disponível</MenuItem>
                    <MenuItem value="UNAVAILABLE">Indisponível</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Preço"
                  type="number"
                  inputProps={{ step: "0.01" }}
                  {...register('item.price.value', { required: 'Preço é obrigatório' })}
                  error={!!errors.item?.price?.value}
                  helperText={errors.item?.price?.value?.message}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Preço Original"
                  type="number"
                  inputProps={{ step: "0.01" }}
                  {...register('item.price.originalValue')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Índice"
                  type="number"
                  {...register('item.index')}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Products */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Produtos ({productFields.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {productFields.map((field, index) => (
              <Paper key={field.id} sx={{ p: 2, mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="subtitle1">Produto {index + 1}</Typography>
                  {productFields.length > 1 && (
                    <IconButton onClick={() => removeProduct(index)} color="error">
                      <RemoveIcon />
                    </IconButton>
                  )}
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Nome"
                      {...register(`products.${index}.name`, { required: 'Nome é obrigatório' })}
                      error={!!errors.products?.[index]?.name}
                      helperText={errors.products?.[index]?.name?.message}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Código Externo"
                      {...register(`products.${index}.externalCode`)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Descrição"
                      multiline
                      rows={2}
                      {...register(`products.${index}.description`)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Informações Adicionais"
                      multiline
                      rows={2}
                      {...register(`products.${index}.additionalInformation`)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Caminho da Imagem"
                      {...register(`products.${index}.imagePath`)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="EAN"
                      {...register(`products.${index}.ean`)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>Porções</InputLabel>
                      <Select {...register(`products.${index}.serving`)} defaultValue="SERVES_1">
                        <MenuItem value="SERVES_1">Serve 1</MenuItem>
                        <MenuItem value="SERVES_2">Serve 2</MenuItem>
                        <MenuItem value="SERVES_3">Serve 3</MenuItem>
                        <MenuItem value="SERVES_4">Serve 4</MenuItem>
                        <MenuItem value="SERVES_5">Serve 5</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Paper>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={() => appendProduct({
                id: '',
                name: '',
                description: '',
                additionalInformation: '',
                imagePath: '',
                ean: '',
                serving: 'SERVES_1',
                dietaryRestrictions: null,
                quantity: null,
                optionGroups: null,
                tags: [],
                industrialized: false,
              })}
            >
              Adicionar Produto
            </Button>
          </AccordionDetails>
        </Accordion>

        {submitError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {submitError}
          </Alert>
        )}

        <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
          <Button
            type="submit"
            variant="contained"
            disabled={createItemMutation.isLoading}
          >
            {createItemMutation.isLoading ? 'Criando...' : 'Criar Item'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate(`/categories/${categoryId}/items?merchantId=${merchantId}`)}
          >
            Cancelar
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default CreateItem;