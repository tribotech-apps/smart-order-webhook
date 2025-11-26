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
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { useQuery } from 'react-query';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { IFoodAdminAPI } from '../services/api';
import { IFoodCategoryItemsResponse } from '../types/IFood';

const ItemList: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const merchantId = searchParams.get('merchantId');

  const { data: categoryData, isLoading, error } = useQuery<IFoodCategoryItemsResponse>(
    ['categoryItems', merchantId, categoryId],
    () => IFoodAdminAPI.getCategoryItems(merchantId!, categoryId!),
    {
      enabled: !!(merchantId && categoryId),
      retry: false,
    }
  );

  const handleCreateItem = () => {
    navigate(`/items/create?merchantId=${merchantId}&categoryId=${categoryId}`);
  };

  const handleEditItem = (itemId: string) => {
    navigate(`/items/edit/${itemId}?merchantId=${merchantId}&categoryId=${categoryId}`);
  };

  if (!merchantId || !categoryId) {
    return (
      <Alert severity="error">
        Merchant ID e Category ID são obrigatórios.
      </Alert>
    );
  }

  return (
    <>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Itens da Categoria
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateItem}
        >
          Novo Item
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Merchant ID: {merchantId} | Category ID: {categoryId}
      </Typography>

      {isLoading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Erro ao carregar itens: {error instanceof Error ? error.message : 'Erro desconhecido'}
        </Alert>
      )}

      {categoryData && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{categoryData.items.length}</Typography>
                  <Typography color="text.secondary">Itens</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{categoryData.products.length}</Typography>
                  <Typography color="text.secondary">Produtos</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{categoryData.optionGroups.length}</Typography>
                  <Typography color="text.secondary">Grupos de Opções</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{categoryData.options.length}</Typography>
                  <Typography color="text.secondary">Opções</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Items Table */}
          {categoryData.items.length > 0 ? (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Preço</TableCell>
                    <TableCell>Código Externo</TableCell>
                    <TableCell>Produto ID</TableCell>
                    <TableCell>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {categoryData.items.map((item) => {
                    const product = categoryData.products.find(p => p.id === item.productId);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.id}</TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell>
                          <Chip
                            label={item.status}
                            color={item.status === 'AVAILABLE' ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          R$ {item.price.value.toFixed(2)}
                          {item.price.originalValue && item.price.originalValue !== item.price.value && (
                            <Typography variant="caption" sx={{ ml: 1, textDecoration: 'line-through' }}>
                              R$ {item.price.originalValue.toFixed(2)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{item.externalCode || '-'}</TableCell>
                        <TableCell>
                          {product?.name || item.productId}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={() => handleEditItem(item.id)}
                          >
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">
              Nenhum item encontrado para esta categoria.
            </Alert>
          )}

          {/* Products Section */}
          {categoryData.products.length > 0 && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Produtos Associados
              </Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Nome</TableCell>
                      <TableCell>Descrição</TableCell>
                      <TableCell>Porções</TableCell>
                      <TableCell>EAN</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {categoryData.products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{product.id}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.description || '-'}</TableCell>
                        <TableCell>{product.serving || '-'}</TableCell>
                        <TableCell>{product.ean || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </>
      )}

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={handleCreateItem}
      >
        <AddIcon />
      </Fab>
    </>
  );
};

export default ItemList;