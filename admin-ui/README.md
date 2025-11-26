# iFood Admin UI

Interface React para administração do catálogo iFood.

## Funcionalidades

✅ **Dashboard com resumo do sistema**
✅ **Listagem de catálogos**
✅ **Gestão de categorias**
✅ **Listagem e criação de itens completos**
✅ **Criação de categorias**
✅ **Interface responsiva com Material-UI**
✅ **Integração completa com admin-api**

## Tecnologias

- **React 18** com TypeScript
- **Material-UI (MUI)** para componentes
- **React Router** para navegação
- **React Query** para gerenciamento de estado
- **React Hook Form** para formulários
- **Webpack** para build

## Instalação

1. **Instalar dependências:**
   ```bash
   cd admin-ui
   npm install
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env`:
   ```
   REACT_APP_API_URL=http://localhost:3001/api
   REACT_APP_DEFAULT_MERCHANT_ID=seu_merchant_id
   ```

3. **Executar:**
   ```bash
   # Desenvolvimento
   npm start
   
   # Build para produção
   npm run build
   ```

## Estrutura de Páginas

### 🏠 **Dashboard**
- Resumo de estatísticas
- Status da homologação
- Endpoints implementados
- Próximos passos

### 📦 **Catálogos**
- Listagem de catálogos por merchant
- Busca por merchant ID
- Navegação para categorias

### 📂 **Categorias**
- Listagem de categorias por catálogo
- Criação de novas categorias
- Navegação para itens

### 🍽️ **Itens**
- Listagem de itens por categoria
- Visualização de produtos, grupos de opções e opções
- Criação de itens completos
- Estatísticas por categoria

### ➕ **Criação de Item Completo**
- Formulário completo com todas as seções:
  - Informações do item
  - Produtos associados
  - Grupos de opções
  - Opções individuais
- Validação de campos obrigatórios
- Geração automática de UUIDs

## Como Usar

1. **Acesse o Dashboard** para visão geral
2. **Entre em Catálogos** e digite um Merchant ID
3. **Selecione um catálogo** para ver suas categorias
4. **Crie novas categorias** conforme necessário
5. **Adicione itens** às categorias
6. **Configure preços, status e opções** para cada item

## Integração com Admin API

A UI consome todos os endpoints da admin-api:

- `GET /catalogs` - Listagem de catálogos
- `GET /categories` - Listagem de categorias
- `POST /categories` - Criação de categorias
- `GET /categories/{id}/items` - Listagem de itens
- `PUT /items` - Criação de itens completos
- `PATCH /items/price` - Atualização de preços
- `PATCH /items/status` - Atualização de status
- `POST /image/upload` - Upload de imagens

## Estrutura do Projeto

```
admin-ui/
├── src/
│   ├── components/
│   │   └── Layout.tsx           # Layout principal
│   ├── pages/
│   │   ├── Dashboard.tsx        # Dashboard principal
│   │   ├── CatalogList.tsx      # Listagem de catálogos
│   │   ├── CategoryList.tsx     # Listagem de categorias
│   │   ├── ItemList.tsx         # Listagem de itens
│   │   ├── CreateItem.tsx       # Criação de itens
│   │   └── CreateCategory.tsx   # Criação de categorias
│   ├── services/
│   │   └── api.ts              # Serviços da API
│   ├── types/
│   │   └── IFood.ts            # Tipos TypeScript
│   ├── App.tsx                 # Componente principal
│   └── index.tsx               # Ponto de entrada
├── public/
│   └── index.html              # Template HTML
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## Evidências para Homologação

A interface permite criar evidências visuais mostrando:
- ✅ Imagens dos itens
- ✅ Nomes e descrições
- ✅ Valores e preços
- ✅ Estrutura de categorias
- ✅ Grupos de opções e complementos

Ideal para demonstrar o funcionamento completo da integração iFood!