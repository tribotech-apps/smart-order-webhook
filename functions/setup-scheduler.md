# Setup Cloud Scheduler para Verificação de Pedidos em Atraso

## Passos para configurar o Cloud Scheduler

### 1. Primeiro, faça o deploy da função

```bash
# Deploy da função
cd functions
npm run build
firebase deploy --only functions:checkOverdueOrders
```

### 2. Configurar Cloud Scheduler via gcloud CLI

```bash
# Configurar projeto
gcloud config set project talkcommerce-2c6e6

# Criar o job do scheduler
gcloud scheduler jobs create http overdue-orders-checker \
    --schedule="*/1 * * * *" \
    --uri="https://us-central1-talkcommerce-2c6e6.cloudfunctions.net/checkOverdueOrders" \
    --http-method=POST \
    --time-zone="America/Sao_Paulo" \
    --description="Verifica pedidos em atraso e envia alertas via WhatsApp" \
    --headers="Content-Type=application/json" \
    --message-body="{}"
```

### 3. Configurar Cloud Scheduler via Console (Alternativo)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/cloudscheduler)
2. Selecione o projeto: `talkcommerce-2c6e6`
3. Clique em "CREATE JOB"
4. Configurações:
   - **Name**: `overdue-orders-checker`
   - **Description**: `Verifica pedidos em atraso e envia alertas via WhatsApp`
   - **Frequency**: `*/1 * * * *` (executa a cada minuto)
   - **Timezone**: `America/Sao_Paulo`
   - **Target Type**: HTTP
   - **URL**: `https://us-central1-talkcommerce-2c6e6.cloudfunctions.net/checkOverdueOrders`
   - **HTTP Method**: POST
   - **Body**: `{}`
   - **Headers**: `Content-Type: application/json`

### 4. Verificar Jobs

```bash
# Listar jobs do scheduler
gcloud scheduler jobs list

# Ver detalhes de um job específico
gcloud scheduler jobs describe overdue-orders-checker

# Executar manualmente para teste
gcloud scheduler jobs run overdue-orders-checker
```

### 5. Monitoramento

```bash
# Ver logs da função
gcloud functions logs read checkOverdueOrders --limit=50

# Ver logs do scheduler
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=overdue-orders-checker" --limit=10
```

## Como funciona

1. **Execução**: O Cloud Scheduler executa a função `checkOverdueOrders` a cada minuto
2. **Verificação**: A função busca todos os pedidos ativos (stages 1, 2, 3)
3. **Cálculo**: Para cada pedido, calcula o tempo decorrido desde a criação
4. **Alertas**: 
   - 🟡 **Alerta Amarelo (75%)**: Enviado quando o pedido atinge 75% do tempo limite do estágio
   - 🔴 **Alerta Vermelho (100%+)**: Enviado quando o pedido está oficialmente em atraso
5. **Evita duplicatas**: Verifica o `alertStatus` do pedido para não enviar alertas repetidos

## Tempos por Estágio

- **Estágio 1 (Aguardando Confirmação)**: `store.rowTime` minutos (padrão: 30 min)
- **Estágio 2 (Em Preparação)**: `store.rowTime + store.productionTime` minutos (padrão: 75 min)
- **Estágio 3 (Em Rota de Entrega)**: `store.rowTime + store.productionTime + store.deliveryTime` minutos (padrão: 105 min)

## Desabilitar/Pausar

```bash
# Pausar o job
gcloud scheduler jobs pause overdue-orders-checker

# Retomar o job
gcloud scheduler jobs resume overdue-orders-checker

# Deletar o job
gcloud scheduler jobs delete overdue-orders-checker
```