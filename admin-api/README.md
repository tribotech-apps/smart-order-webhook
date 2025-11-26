# iFood Admin API

Admin API para gerenciar catálogos do iFood conforme exigido para homologação.

## Estrutura

Esta API implementa todos os endpoints obrigatórios do iFood para homologação:

### Endpoints Implementados

1. **GET** `/api/merchants/{merchantId}/catalogs` - Listar catálogos
2. **GET** `/api/merchants/{merchantId}/catalogs/{catalogId}/categories` - Listar categorias  
3. **POST** `/api/merchants/{merchantId}/catalogs/{catalogId}/categories` - Criar categoria
4. **GET** `/api/merchants/{merchantId}/categories/{categoryId}/items` - Listar itens de categoria
5. **PUT** `/api/merchants/{merchantId}/items` - Criar/editar item completo
6. **PATCH** `/api/merchants/{merchantId}/items/price` - Alterar preço de item
7. **PATCH** `/api/merchants/{merchantId}/items/status` - Alterar status de item
8. **PATCH** `/api/merchants/{merchantId}/options/price` - Alterar preço de complemento
9. **PATCH** `/api/merchants/{merchantId}/options/status` - Alterar status de complemento
10. **POST** `/api/merchants/{merchantId}/image/upload` - Upload de imagens

## Configuração

1. **Instalar dependências:**
   ```bash
   cd admin-api
   npm install
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env` com suas credenciais:
   ```
   IFOOD_ACCESS_TOKEN=seu_token_aqui
   PORT=3001
   NODE_ENV=development
   ```

3. **Executar:**
   ```bash
   # Desenvolvimento
   npm run dev
   
   # Produção
   npm run build
   npm start
   ```

## Estrutura de Item Completo

Para criar um item completo, use o endpoint PUT `/merchants/{merchantId}/items` com a seguinte estrutura:

```json
{
  "item": {
    "id": "uuid-do-item",
    "type": "DEFAULT",
    "categoryId": "uuid-da-categoria",
    "status": "AVAILABLE",
    "price": {
      "value": 11.00,
      "originalValue": 12.50
    },
    "externalCode": "codigo_externo",
    "index": 0,
    "productId": "uuid-do-produto",
    "contextModifiers": [
      {
        "catalogContext": "WHITELABEL",
        "status": "AVAILABLE",
        "price": {
          "value": 13,
          "originalValue": 16
        },
        "externalCode": "whitelabel_ec"
      }
    ]
  },
  "products": [
    {
      "id": "uuid-do-produto",
      "externalCode": "produto_codigo",
      "name": "X-Burguer",
      "description": "Pão, carne, queijo e salada",
      "additionalInformation": "Informação adicional",
      "imagePath": "caminho/para/imagem.png",
      "ean": "EAN112233414",
      "serving": "SERVES_2",
      "optionGroups": [
        {
          "id": "uuid-grupo-opcoes",
          "min": 0,
          "max": 1
        }
      ]
    }
  ],
  "optionGroups": [
    {
      "id": "uuid-grupo-opcoes",
      "name": "Acompanhamentos",
      "externalCode": "grupo_codigo",
      "status": "AVAILABLE",
      "index": 0,
      "optionGroupType": "DEFAULT",
      "optionIds": ["uuid-opcao-1"]
    }
  ],
  "options": [
    {
      "id": "uuid-opcao-1",
      "status": "AVAILABLE",
      "index": 0,
      "productId": "uuid-produto-opcao",
      "price": {
        "value": 4,
        "originalValue": 7
      },
      "externalCode": "opcao_codigo"
    }
  ]
}
```

## Health Check

- **GET** `/health` - Verificar status da API

## Estrutura do Projeto

```
admin-api/
├── src/
│   ├── types/IFood.ts          # Tipos TypeScript para iFood API
│   ├── services/ifood/         # Serviços de integração com iFood
│   ├── routes/                 # Definições das rotas
│   │   ├── catalog.ts
│   │   ├── categories.ts  
│   │   ├── items.ts
│   │   ├── options.ts
│   │   └── images.ts
│   └── index.ts               # Servidor principal
├── package.json
├── tsconfig.json
└── README.md
```

## Arquitetura

- **functions/**: Webhook para Meta API (WhatsApp)
- **admin-api/**: API administrativa para gerenciar catálogos iFood

Ambas as aplicações são independentes e podem ser executadas separadamente.