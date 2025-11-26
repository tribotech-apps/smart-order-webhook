import React, { useState } from 'react';
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
  TextField,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { IFoodAdminAPI } from '../services/api';
import { IFoodCatalog } from '../types/IFood';

const CatalogList: React.FC = () => {
  const [merchantId, setMerchantId] = useState('');
  const navigate = useNavigate();

  const { data: catalogs, isLoading, error, refetch } = useQuery<IFoodCatalog[]>(
    ['catalogs', merchantId],
    () => IFoodAdminAPI.getCatalogs(merchantId),
    {
      enabled: !!merchantId,
      retry: false,
    }
  );

  const handleSearch = () => {
    if (merchantId.trim()) {
      refetch();
    }
  };

  const handleViewCategories = (catalogId: string) => {
    navigate(`/catalogs/${catalogId}/categories?merchantId=${merchantId}`);
  };

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Catálogos
      </Typography>

      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          label="Merchant ID"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          placeholder="Digite o ID do merchant"
          variant="outlined"
          sx={{ minWidth: 300 }}
        />
        <Button 
          variant="contained" 
          onClick={handleSearch}
          disabled={!merchantId.trim() || isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Buscar Catálogos'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Erro ao carregar catálogos: {error instanceof Error ? error.message : 'Erro desconhecido'}
        </Alert>
      )}

      {catalogs && catalogs.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Nome</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Última Modificação</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {catalogs.map((catalog) => (
                <TableRow key={catalog.id}>
                  <TableCell>{catalog.id}</TableCell>
                  <TableCell>{catalog.name}</TableCell>
                  <TableCell>{catalog.description || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={catalog.status}
                      color={catalog.status === 'AVAILABLE' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {catalog.modifiedAt 
                      ? new Date(catalog.modifiedAt).toLocaleDateString('pt-BR')
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => handleViewCategories(catalog.id)}
                    >
                      Ver Categorias
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {catalogs && catalogs.length === 0 && (
        <Alert severity="info">
          Nenhum catálogo encontrado para este merchant.
        </Alert>
      )}

      {!merchantId && !isLoading && (
        <Alert severity="info">
          Digite um Merchant ID para visualizar os catálogos disponíveis.
        </Alert>
      )}
    </>
  );
};

export default CatalogList;