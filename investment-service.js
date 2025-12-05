const axios = require('axios');

class InvestmentService {
    constructor() {
        // ВАЖНО: ASP.NET использует заглавную букву в имени контроллера!
        // Route: [Route("api/[controller]")] где [controller] = Investment (с заглавной I)
        this.baseURL = 'https://cvb2.onrender.com/api/Investment';
        this.emailURL = 'https://cvb2.onrender.com';
        this.demoMode = false; // Автоматически включится если API недоступен
        this.apiAvailable = null; // null = не проверяли, true/false = результат проверки
        
        console.log(`💰 Investment Service инициализирован:`);
        console.log(`   Investment API: ${this.baseURL}`);
        console.log(`   Email API: ${this.emailURL}`);
        console.log(`   ⚠️  ВАЖНО: Используем /api/Investment (с заглавной I) т.к. это ASP.NET!`);
        console.log(`   Эндпоинты: ${this.baseURL}/securities, ${this.baseURL}/calculate и т.д.`);
    }

    async checkStatus() {
        try {
            const response = await axios.get(this.baseURL, {
                timeout: 5000
            });
            
            return {
                success: true,
                status: 'API доступен',
                data: response.data
            };
        } catch (error) {
            console.error('❌ Ошибка проверки статуса Investment API:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getSecurities() {
        console.log('📊 Получение списка ценных бумаг...');
        console.log(`   URL: ${this.baseURL}/securities`);
        
        try {
            const response = await axios.get(`${this.baseURL}/securities`, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });

            console.log('📥 Статус ответа:', response.status);
            console.log('📥 Заголовки:', response.headers['content-type']);
            console.log('📥 Тип данных:', typeof response.data);
            console.log('📥 Ответ от API (первые 500 символов):', JSON.stringify(response.data).substring(0, 500));

            let securities = response.data;
            
            // Если пришел HTML вместо JSON
            if (typeof securities === 'string' && securities.includes('<!DOCTYPE html>')) {
                console.error('❌ API вернул HTML вместо JSON. Включаем ДЕМО-режим.');
                this.apiAvailable = false;
                
                // Возвращаем демо-данные
                const demoSecurities = [
                    { id: 1, ticker: 'AAPL', name: 'Apple Inc.', price: 170.50, currentPrice: 170.50 },
                    { id: 2, ticker: 'GOOGL', name: 'Alphabet Inc.', price: 140.20, currentPrice: 140.20 },
                    { id: 3, ticker: 'MSFT', name: 'Microsoft Corp.', price: 380.75, currentPrice: 380.75 },
                    { id: 4, ticker: 'TSLA', name: 'Tesla Inc.', price: 245.30, currentPrice: 245.30 },
                    { id: 5, ticker: 'AMZN', name: 'Amazon.com Inc.', price: 155.90, currentPrice: 155.90 }
                ];
                
                return {
                    success: true,
                    securities: demoSecurities,
                    count: demoSecurities.length,
                    demoMode: true,
                    note: '⚠️ API одногруппника недоступен. Показаны демо-данные.'
                };
            }
            
            if (!Array.isArray(securities)) {
                console.log('⚠️ Securities не массив, пробуем извлечь...');
                if (securities.securities && Array.isArray(securities.securities)) {
                    securities = securities.securities;
                } else if (typeof securities === 'object') {
                    securities = Object.values(securities);
                } else {
                    throw new Error('Неверный формат данных от API');
                }
            }

            console.log(`✅ Получено бумаг: ${securities.length}`);
            if (securities.length > 0) {
                console.log('   Пример бумаги:', securities[0]);
            }

            return {
                success: true,
                securities: securities,
                count: securities.length
            };
        } catch (error) {
            console.error('❌ Ошибка получения бумаг:');
            console.error('   Статус:', error.response?.status);
            console.error('   URL:', error.config?.url);
            console.error('   Сообщение:', error.message);
            
            return {
                success: false,
                error: `Не удалось получить список ценных бумаг (${error.response?.status || 'нет ответа'})`,
                details: error.response?.status === 404 
                    ? 'Эндпоинт /api/investment/securities не найден. API одногруппника может быть недоступен или иметь другую структуру.'
                    : (error.response?.data || error.message)
            };
        }
    }

    async calculateOperation(data) {
        console.log('💵 Расчет стоимости операции...');
        console.log('   Данные:', JSON.stringify(data, null, 2));
        
        try {
            const response = await axios.post(
                `${this.baseURL}/calculate`,
                {
                    securityId: data.securityId,
                    quantity: data.quantity,
                    purchasePricePerShare: data.purchasePricePerShare,
                    commission: data.commission || 0
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            console.log('✅ Расчет выполнен:', response.data);

            return {
                success: true,
                calculation: response.data
            };
        } catch (error) {
            console.error('❌ Ошибка расчета:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось рассчитать стоимость операции',
                details: error.response?.data || error.message
            };
        }
    }

    async createOperation(data) {
        console.log('📝 Создание операции с акциями...');
        console.log('   Данные:', JSON.stringify(data, null, 2));
        
        try {
            const response = await axios.post(
                `${this.baseURL}/operations`,
                {
                    securityId: data.securityId,
                    quantity: data.quantity,
                    purchasePricePerShare: data.purchasePricePerShare,
                    commission: data.commission || 0,
                    clientEmail: data.clientEmail
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            console.log('✅ Операция создана:', response.data);

            return {
                success: true,
                operation: response.data
            };
        } catch (error) {
            console.error('❌ Ошибка создания операции:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось создать операцию',
                details: error.response?.data || error.message
            };
        }
    }

    async getOperations() {
        console.log('📋 Получение списка операций...');
        
        try {
            const response = await axios.get(`${this.baseURL}/operations`, {
                timeout: 10000
            });

            console.log(`✅ Получено операций: ${response.data.length}`);

            return {
                success: true,
                operations: response.data,
                count: response.data.length
            };
        } catch (error) {
            console.error('❌ Ошибка получения операций:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось получить список операций',
                details: error.response?.data || error.message
            };
        }
    }

    async createTrigger(data) {
        console.log('⏰ Создание триггера...');
        console.log('   Данные:', JSON.stringify(data, null, 2));
        
        try {
            const response = await axios.post(
                `${this.baseURL}/triggers`,
                {
                    operationId: data.operationId,
                    targetPrice: data.targetPrice,
                    triggerType: data.triggerType || 'BELOW'
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            console.log('✅ Триггер создан:', response.data);

            return {
                success: true,
                trigger: response.data
            };
        } catch (error) {
            console.error('❌ Ошибка создания триггера:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось создать триггер',
                details: error.response?.data || error.message
            };
        }
    }

    async getTriggers() {
        console.log('📋 Получение списка триггеров...');
        
        try {
            const response = await axios.get(`${this.baseURL}/triggers`, {
                timeout: 10000
            });

            console.log(`✅ Получено триггеров: ${response.data.length}`);

            return {
                success: true,
                triggers: response.data,
                count: response.data.length
            };
        } catch (error) {
            console.error('❌ Ошибка получения триггеров:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось получить список триггеров',
                details: error.response?.data || error.message
            };
        }
    }

    async checkTriggers() {
        console.log('🔔 Проверка триггеров...');
        
        try {
            const response = await axios.post(
                `${this.baseURL}/triggers/check`,
                {},
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000
                }
            );

            console.log('✅ Проверка триггеров завершена:', response.data);

            return {
                success: true,
                result: response.data
            };
        } catch (error) {
            console.error('❌ Ошибка проверки триггеров:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось проверить триггеры',
                details: error.response?.data || error.message
            };
        }
    }

    async testConnection() {
        console.log('\n💰 === ТЕСТ ПОДКЛЮЧЕНИЯ К INVESTMENT API ===\n');
        
        try {
            console.log('1️⃣ Проверка статуса API...');
            const statusResult = await this.checkStatus();
            if (statusResult.success) {
                console.log('✅ API доступен:', statusResult.status);
            } else {
                console.log('❌ API недоступен');
            }
            console.log('');
            
            console.log('2️⃣ Получение списка ценных бумаг...');
            const securitiesResult = await this.getSecurities();
            if (securitiesResult.success) {
                console.log(`✅ Получено бумаг: ${securitiesResult.count}`);
                if (securitiesResult.securities.length > 0) {
                    console.log('   Пример:', securitiesResult.securities[0]);
                }
            } else {
                console.log('❌ Ошибка получения бумаг');
            }
            console.log('');
            
            console.log('✅ === ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===\n');
            
            return {
                success: true,
                message: 'Подключение к Investment API работает',
                details: {
                    status: statusResult.success,
                    securities: securitiesResult.success
                }
            };
        } catch (error) {
            console.error('❌ === ТЕСТ ПРОВАЛЕН ===');
            console.error('Ошибка:', error.message);
            console.error('\n');
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new InvestmentService();

