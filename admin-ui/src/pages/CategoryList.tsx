import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Fab,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useQuery } from 'react-query';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { IFoodAdminAPI } from '../services/api';
import { IFoodCategory } from '../types/IFood';

const CategoryList: React.FC = () => {
  const { catalogId } = useParams<{ catalogId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const merchantId = searchParams.get('merchantId');

  const { data: categories, isLoading, error } = useQuery<IFoodCategory[]>(
    ['categories', merchantId, catalogId],
    () => IFoodAdminAPI.getCategories(merchantId!, catalogId!),
    {
      enabled: !!(merchantId && catalogId),
      retry: false,
    }
  );

  const handleViewItems = (categoryId: string) => {
    navigate(`/categories/${categoryId}/items?merchantId=${merchantId}`);
  };

  const handleCreateCategory = () => {
    navigate(`/categories/create?merchantId=${merchantId}&catalogId=${catalogId}`);
  };

  if (!merchantId || !catalogId) {
    return (
      <Alert severity="error">
        Merchant ID e Catalog ID são obrigatórios.
      </Alert>
    );
  }

  return (
    <>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Categorias do Catálogo
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateCategory}
        >
          Nova Categoria
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Merchant ID: {merchantId} | Catalog ID: {catalogId}
      </Typography>

      {isLoading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Erro ao carregar categorias: {error instanceof Error ? error.message : 'Erro desconhecido'}
        </Alert>
      )}

      {categories && categories.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Nome</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ordem</TableCell>
                <TableCell>Template</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>{category.id}</TableCell>
                  <TableCell>{category.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={category.status}
                      color={category.status === 'AVAILABLE' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{category.order || '-'}</TableCell>
                  <TableCell>{category.template || '-'}</TableCell>
                  <TableCell>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => handleViewItems(category.id)}
                    >
                      Ver Itens
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {categories && categories.length === 0 && (
        <Alert severity="info">
          Nenhuma categoria encontrada para este catálogo.
        </Alert>
      )}

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={handleCreateCategory}
      >
        <AddIcon />
      </Fab>
    </>
  );
};

export default CategoryList;