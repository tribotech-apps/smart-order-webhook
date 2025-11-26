import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { QueryClient, QueryClientProvider } from 'react-query';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CatalogList from './pages/CatalogList';
import CategoryList from './pages/CategoryList';
import ItemList from './pages/ItemList';
import CreateItem from './pages/CreateItemSimple';
import CreateCategory from './pages/CreateCategory';

const theme = createTheme({
  palette: {
    primary: {
      main: '#ea1d2c', // iFood red
    },
    secondary: {
      main: '#ffb300', // iFood yellow
    },
  },
});

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Box sx={{ display: 'flex' }}>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/catalogs" element={<CatalogList />} />
                <Route path="/catalogs/:catalogId/categories" element={<CategoryList />} />
                <Route path="/categories/:categoryId/items" element={<ItemList />} />
                <Route path="/items/create" element={<CreateItem />} />
                <Route path="/categories/create" element={<CreateCategory />} />
              </Routes>
            </Layout>
          </Box>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;