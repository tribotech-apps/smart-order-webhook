import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Category as CategoryIcon,
  Restaurant as RestaurantIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';

const Dashboard: React.FC = () => {
  const stats = [
    { title: 'Catálogos Ativos', value: '1', icon: <InventoryIcon /> },
    { title: 'Categorias', value: '12', icon: <CategoryIcon /> },
    { title: 'Itens', value: '156', icon: <RestaurantIcon /> },
  ];

  const requiredEndpoints = [
    'GET /merchants/{merchantId}/catalogs',
    'GET /merchants/{merchantId}/catalogs/{catalogId}/categories',
    'POST /merchants/{merchantId}/catalogs/{catalogId}/categories',
    'GET /merchants/{merchantId}/categories/{categoryId}/items',
    'PUT /merchants/{merchantId}/items',
    'PATCH /merchants/{merchantId}/items/price',
    'PATCH /merchants/{merchantId}/items/status',
    'PATCH /merchants/{merchantId}/options/price',
    'PATCH /merchants/{merchantId}/options/status',
    'POST /merchants/{merchantId}/image/upload',
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard - Administração iFood
      </Typography>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Box sx={{ mr: 2, color: 'primary.main' }}>
                    {stat.icon}
                  </Box>
                  <Box>
                    <Typography variant="h5" component="div">
                      {stat.value}
                    </Typography>
                    <Typography color="text.secondary">
                      {stat.title}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Status da Homologação iFood
            </Typography>
            <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
              <CheckIcon color="success" sx={{ mr: 1 }} />
              <Typography>
                Todos os endpoints obrigatórios implementados
              </Typography>
            </Box>
            <Chip label="Pronto para Homologação" color="success" />
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Endpoints Implementados
            </Typography>
            <List dense>
              {requiredEndpoints.slice(0, 5).map((endpoint, index) => (
                <ListItem key={index} sx={{ py: 0.5 }}>
                  <CheckIcon color="success" sx={{ mr: 1, fontSize: 16 }} />
                  <ListItemText 
                    primary={endpoint}
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                  />
                </ListItem>
              ))}
              <ListItem sx={{ py: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  + {requiredEndpoints.length - 5} outros endpoints...
                </Typography>
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Próximos Passos
          </Typography>
          <List>
            <ListItem>
              <ListItemText 
                primary="1. Configurar merchant ID no sistema"
                secondary="Definir o ID do merchant para as chamadas da API"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="2. Testar todos os endpoints"
                secondary="Validar funcionamento completo da integração"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="3. Criar evidências do cardápio"
                secondary="Preparar screenshots com imagens, nomes, descrições e valores"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="4. Submeter para homologação iFood"
                secondary="Enviar evidências e links da API para análise"
              />
            </ListItem>
          </List>
        </Paper>
      </Box>
    </Box>
  );
};

export default Dashboard;