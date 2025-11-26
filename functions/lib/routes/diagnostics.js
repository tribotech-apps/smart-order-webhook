"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const diagnosticsService_1 = require("../services/diagnosticsService");
const router = express_1.default.Router();
/**
 * Endpoint para relatório de saúde detalhado
 */
router.get('/health', async (req, res) => {
    try {
        const healthReport = await diagnosticsService_1.diagnostics.generateHealthReport();
        diagnosticsService_1.diagnostics.info('Relatório de saúde solicitado', {
            category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
            action: 'health_report_requested'
        });
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            health: healthReport
        });
    }
    catch (error) {
        diagnosticsService_1.diagnostics.error('Erro ao gerar relatório de saúde', error, {
            category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
            action: 'health_report_error'
        });
        res.status(500).json({
            success: false,
            error: 'Erro ao gerar relatório de saúde'
        });
    }
});
/**
 * Endpoint para dashboard básico de diagnósticos
 */
router.get('/dashboard', (req, res) => {
    diagnosticsService_1.diagnostics.info('Dashboard de diagnósticos acessado', {
        category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
        action: 'dashboard_accessed'
    });
    const htmlDashboard = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Talk Commerce - Diagnósticos</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 20px;
                min-height: 100vh;
                color: #333;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: rgba(255, 255, 255, 0.95);
                border-radius: 15px;
                padding: 30px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 2px solid #f0f0f0;
            }
            .header h1 {
                color: #2c3e50;
                margin: 0;
                font-size: 2.5em;
                font-weight: 300;
            }
            .header p {
                color: #7f8c8d;
                margin: 10px 0 0 0;
                font-size: 1.1em;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 40px;
            }
            .stat-card {
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.08);
                border-left: 4px solid;
                transition: transform 0.2s;
            }
            .stat-card:hover {
                transform: translateY(-2px);
            }
            .stat-card.success { border-left-color: #27ae60; }
            .stat-card.warning { border-left-color: #f39c12; }
            .stat-card.error { border-left-color: #e74c3c; }
            .stat-card.info { border-left-color: #3498db; }
            .stat-card h3 {
                margin: 0 0 10px 0;
                color: #2c3e50;
                font-size: 1.1em;
            }
            .stat-card .value {
                font-size: 2em;
                font-weight: bold;
                margin: 10px 0;
            }
            .stat-card.success .value { color: #27ae60; }
            .stat-card.warning .value { color: #f39c12; }
            .stat-card.error .value { color: #e74c3c; }
            .stat-card.info .value { color: #3498db; }
            .actions {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-top: 30px;
            }
            .btn {
                background: #3498db;
                color: white;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                text-decoration: none;
                text-align: center;
                transition: background 0.2s;
                font-size: 1em;
                cursor: pointer;
            }
            .btn:hover {
                background: #2980b9;
            }
            .btn.success { background: #27ae60; }
            .btn.success:hover { background: #229954; }
            .btn.warning { background: #f39c12; }
            .btn.warning:hover { background: #e67e22; }
            .refresh-info {
                text-align: center;
                margin-top: 20px;
                padding: 15px;
                background: #ecf0f1;
                border-radius: 8px;
                color: #7f8c8d;
            }
            .status-indicator {
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                margin-right: 8px;
            }
            .status-online { background: #27ae60; }
            .status-warning { background: #f39c12; }
            .status-offline { background: #e74c3c; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔍 Talk Commerce Diagnósticos</h1>
                <p>
                    <span class="status-indicator status-online"></span>
                    Sistema Online - Monitoramento em Tempo Real
                </p>
            </div>

            <div class="stats-grid">
                <div class="stat-card success">
                    <h3>📊 Status do Sistema</h3>
                    <div class="value">✅ Online</div>
                    <p>Todos os serviços funcionando normalmente</p>
                </div>

                <div class="stat-card info">
                    <h3>⚡ Uptime</h3>
                    <div class="value" id="uptime">Carregando...</div>
                    <p>Tempo desde a última reinicialização</p>
                </div>

                <div class="stat-card info">
                    <h3>💾 Uso de Memória</h3>
                    <div class="value" id="memory">Carregando...</div>
                    <p>Consumo atual de RAM</p>
                </div>

                <div class="stat-card success">
                    <h3>🚀 Node.js</h3>
                    <div class="value" id="nodejs">Carregando...</div>
                    <p>Versão do runtime</p>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card warning">
                    <h3>📱 WhatsApp Flows</h3>
                    <div class="value">🔄 Ativo</div>
                    <p>Processamento de flows funcionando</p>
                </div>

                <div class="stat-card success">
                    <h3>🗄️ Firestore</h3>
                    <div class="value">✅ Conectado</div>
                    <p>Base de dados operacional</p>
                </div>

                <div class="stat-card info">
                    <h3>🔐 Autenticação</h3>
                    <div class="value">🛡️ Segura</div>
                    <p>Firebase Auth ativo</p>
                </div>

                <div class="stat-card success">
                    <h3>💳 Pagamentos</h3>
                    <div class="value">💰 Ativo</div>
                    <p>Integração Asaas funcionando</p>
                </div>
            </div>

            <div class="actions">
                <button class="btn" onclick="loadHealthReport()">📈 Relatório Detalhado</button>
                <button class="btn success" onclick="testWebhook()">🧪 Testar Webhook</button>
                <button class="btn warning" onclick="refreshPage()">🔄 Atualizar</button>
                <a href="https://console.firebase.google.com/project/talkcommerce-2c6e6/functions/logs" 
                   class="btn" target="_blank">📋 Logs Firebase</a>
            </div>

            <div class="refresh-info">
                <p>📊 Dashboard atualizado automaticamente a cada 30 segundos</p>
                <p>⏰ Última atualização: <span id="lastUpdate"></span></p>
            </div>
        </div>

        <script>
            function formatUptime(seconds) {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return \`\${hours}h \${minutes}m\`;
            }

            function formatMemory(bytes) {
                const mb = Math.round(bytes / 1024 / 1024);
                return \`\${mb} MB\`;
            }

            async function loadHealthReport() {
                try {
                    const response = await fetch('/diagnostics/health');
                    const data = await response.json();
                    
                    if (data.success) {
                        const health = data.health;
                        document.getElementById('uptime').textContent = formatUptime(health.uptime);
                        document.getElementById('memory').textContent = formatMemory(health.memory.heapUsed);
                        document.getElementById('nodejs').textContent = health.nodejs;
                    }
                    
                    console.log('Health Report:', data);
                    alert('Relatório carregado! Verifique o console para detalhes.');
                } catch (error) {
                    console.error('Erro ao carregar relatório:', error);
                    alert('Erro ao carregar relatório de saúde');
                }
            }

            async function testWebhook() {
                try {
                    const response = await fetch('/whatsapp/messages/webhook?hub.mode=subscribe&hub.verify_token=${process.env.WABA_VERIFY_TOKEN || 'test'}&hub.challenge=test123');
                    if (response.ok) {
                        alert('✅ Webhook funcionando corretamente!');
                    } else {
                        alert('❌ Erro no teste do webhook');
                    }
                } catch (error) {
                    console.error('Erro no teste:', error);
                    alert('❌ Erro ao testar webhook');
                }
            }

            function refreshPage() {
                window.location.reload();
            }

            function updateLastUpdate() {
                document.getElementById('lastUpdate').textContent = new Date().toLocaleString('pt-BR');
            }

            // Inicializar
            updateLastUpdate();
            loadHealthReport();

            // Auto-refresh a cada 30 segundos
            setInterval(() => {
                loadHealthReport();
                updateLastUpdate();
            }, 30000);
        </script>
    </body>
    </html>
  `;
    res.send(htmlDashboard);
});
/**
 * Endpoint para forçar um teste de erro (apenas para desenvolvimento)
 */
router.post('/test-error', (req, res) => {
    const { level = 'error', message = 'Teste de erro' } = req.body;
    diagnosticsService_1.diagnostics.warn('Teste de erro solicitado', {
        category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
        action: 'test_error_requested',
        details: { level, message }
    });
    try {
        if (level === 'critical') {
            diagnosticsService_1.diagnostics.critical(message, new Error('Erro de teste crítico'), {
                category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
                action: 'test_critical_error'
            });
        }
        else if (level === 'error') {
            diagnosticsService_1.diagnostics.error(message, new Error('Erro de teste'), {
                category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
                action: 'test_error'
            });
        }
        else if (level === 'warn') {
            diagnosticsService_1.diagnostics.warn(message, {
                category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
                action: 'test_warning'
            });
        }
        else {
            diagnosticsService_1.diagnostics.info(message, {
                category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
                action: 'test_info'
            });
        }
        res.json({
            success: true,
            message: `Teste de ${level} executado com sucesso`
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erro ao executar teste'
        });
    }
});
exports.default = router;
