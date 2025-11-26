# 🚀 Quick Start - iFood Admin System

## Executar o Sistema Completo

### 1. **Admin API (Backend)**
```bash
cd admin-api
npm install
cp .env.example .env
# Editar .env e adicionar IFOOD_ACCESS_TOKEN=seu_token
npm run dev
```
A API estará em: http://localhost:3001

### 2. **Admin UI (Frontend)**
```bash
cd admin-ui
npm install
npm start
```
A interface estará em: http://localhost:3000

### 3. **Webhook (Functions)**
```bash
cd functions
npm install
npm run serve
```
O webhook estará em: http://localhost:5001

## ✅ Checklist de Homologação iFood

### Endpoints Obrigatórios Implementados:
- ✅ `GET /merchants/{merchantId}/catalogs`
- ✅ `GET /merchants/{merchantId}/catalogs/{catalogId}/categories`  
- ✅ `POST /merchants/{merchantId}/catalogs/{catalogId}/categories`
- ✅ `GET /merchants/{merchantId}/categories/{categoryId}/items`
- ✅ `PUT /merchants/{merchantId}/items` (criação completa)
- ✅ `PATCH /merchants/{merchantId}/items/price`
- ✅ `PATCH /merchants/{merchantId}/items/status`
- ✅ `PATCH /merchants/{merchantId}/options/price`
- ✅ `PATCH /merchants/{merchantId}/options/status`
- ✅ `POST /merchants/{merchantId}/image/upload`

### Evidências para Homologação:
1. **Interface Admin**: Screenshots mostrando criação de categorias e itens
2. **Cardápio Configurado**: Evidências com imagens, nomes, descrições e valores
3. **API Funcionando**: Logs das chamadas bem-sucedidas
4. **Estrutura Completa**: Items com produtos, grupos de opções e complementos

## 🗂️ Estrutura do Projeto

```
/
├── functions/          # Webhook para Meta API (WhatsApp)
├── admin-api/         # API REST para administração
├── admin-ui/          # Interface React para administração
└── QUICK_START.md     # Este arquivo
```

## 🔧 Configuração Necessária

### Admin API (.env):
```
IFOOD_ACCESS_TOKEN=seu_token_ifood
PORT=3001
NODE_ENV=development
```

### Functions (.env):
```
# Configurações existentes do WhatsApp
# + configurações específicas se necessário
```

## 📊 Como Usar a Interface

1. **Acesse**: http://localhost:3000
2. **Dashboard**: Visão geral do sistema
3. **Catálogos**: Digite um Merchant ID para listar catálogos
4. **Categorias**: Crie e gerencie categorias
5. **Itens**: Crie itens completos com produtos e opções

## 🎯 Para Homologação

1. **Execute** ambas as aplicações (admin-api + admin-ui)
2. **Configure** um merchant ID válido
3. **Crie** categorias e itens usando a interface
4. **Capture** screenshots mostrando o cardápio funcionando
5. **Documente** as evidências para envio ao iFood

## 🆘 Solução de Problemas

- **API não conecta**: Verifique se admin-api está em localhost:3001
- **Token inválido**: Verifique IFOOD_ACCESS_TOKEN no .env
- **CORS errors**: Certifique-se que admin-api está rodando
- **Build errors**: Execute `npm install` em ambas as pastas

🎉 **Sistema pronto para homologação iFood!**