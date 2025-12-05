const axios = require('axios');

class CdekService {
    constructor() {
        this.testMode = true;
        this.demoMode = !process.env.CDEK_CLIENT_ID;
        
        this.baseURL = this.testMode 
            ? 'https://api.edu.cdek.ru/v2'
            : 'https://api.cdek.ru/v2';
        
        this.credentials = {
            client_id: process.env.CDEK_CLIENT_ID || 'DEMO_MODE',
            client_secret: process.env.CDEK_CLIENT_SECRET || 'DEMO_MODE'
        };
        
        this.token = null;
        this.tokenExpiry = null;
        
        this.fromLocation = {
            code: 44,
            city: 'Москва',
            address: 'пр. Ленинградский, 39, стр.79'
        };
        
        console.log(`🔧 СДЭК Service инициализирован:`);
        console.log(`   Режим: ${this.demoMode ? '🎭 ДЕМО (без реального API)' : (this.testMode ? 'ТЕСТОВЫЙ' : 'PRODUCTION')}`);
        console.log(`   URL: ${this.baseURL}`);
        console.log(`   Client ID: ${this.credentials.client_id}`);
        
        if (this.demoMode) {
            console.log(`\n⚠️  ВНИМАНИЕ: Работа в ДЕМО-режиме!`);
            console.log(`   Для использования реального СДЭК API:`);
            console.log(`   1. Зарегистрируйтесь на https://www.cdek.ru/ru/integration`);
            console.log(`   2. Получите client_id и client_secret`);
            console.log(`   3. Установите переменные окружения:`);
            console.log(`      set CDEK_CLIENT_ID=ваш_client_id`);
            console.log(`      set CDEK_CLIENT_SECRET=ваш_client_secret`);
            console.log(`   4. Перезапустите сервер: npm start\n`);
        }
    }

    async authenticate() {
        if (this.demoMode) {
            console.log('🎭 ДЕМО-режим: Генерация фиктивного токена');
            this.token = 'DEMO_TOKEN_' + Date.now();
            this.tokenExpiry = Date.now() + 3600000;
            return this.token;
        }
        
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            console.log('✅ Используется существующий токен');
            return this.token;
        }

        console.log('🔑 Получение токена СДЭК API...');
        console.log(`   URL: ${this.baseURL}/oauth/token`);

        try {
            const params = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.credentials.client_id,
                client_secret: this.credentials.client_secret
            });

            console.log('   Параметры:', {
                grant_type: 'client_credentials',
                client_id: this.credentials.client_id,
                client_secret: '***' + this.credentials.client_secret.slice(-4)
            });

            const response = await axios.post(
                `${this.baseURL}/oauth/token`, 
                params, 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 10000
                }
            );

            this.token = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
            
            console.log('✅ Токен получен успешно');
            console.log(`   Истекает через: ${Math.floor(response.data.expires_in / 60)} минут`);
            
            return this.token;
        } catch (error) {
            console.error('❌ Ошибка аутентификации СДЭК:');
            console.error('   URL:', `${this.baseURL}/oauth/token`);
            console.error('   Статус:', error.response?.status);
            console.error('   Данные:', error.response?.data);
            console.error('   Сообщение:', error.message);
            
            throw new Error(`Не удалось авторизоваться в СДЭК API: ${error.response?.data?.error_description || error.message}`);
        }
    }

    async calculateDelivery(params) {
        try {
            const token = await this.authenticate();
            
            const tariffCode = params.deliveryType === 'door' ? 136 : 138;
            
            const weight = params.weight || this.calculateWeight(params.items);
            
            let cityCode = params.cityCode;
            if (!cityCode && params.city) {
                const citiesResult = await this.getCities(params.city);
                if (citiesResult.success && citiesResult.cities.length > 0) {
                    cityCode = citiesResult.cities[0].code;
                    console.log(`🏙️ Найден код города ${params.city}: ${cityCode}`);
                }
            }
            
            const toLocation = cityCode 
                ? { code: cityCode }
                : { 
                    city: params.city || 'Санкт-Петербург',
                    address: params.address || ''
                  };
            
            const requestData = {
                type: 1,
                currency: 1,
                tariff_code: tariffCode,
                from_location: {
                    code: this.fromLocation.code
                },
                to_location: toLocation,
                packages: [{
                    weight: weight,
                    length: 30,
                    width: 20,
                    height: 10
                }]
            };

            console.log('📦 СДЭК запрос расчета:', JSON.stringify(requestData, null, 2));

            const response = await axios.post(
                `${this.baseURL}/calculator/tariff`,
                requestData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ СДЭК ответ:', JSON.stringify(response.data, null, 2));

            return {
                success: true,
                deliveryCost: response.data.total_sum || response.data.delivery_sum,
                deliveryDays: `${response.data.period_min || 2}-${response.data.period_max || 5}`,
                tariffCode: tariffCode,
                tariffName: tariffCode === 136 ? 'Посылка дверь-дверь' : 'Посылка склад-склад',
                currency: 'RUB',
                cityCode: cityCode,
                rawResponse: response.data
            };
        } catch (error) {
            console.error('❌ Ошибка расчета доставки СДЭК:');
            console.error('Статус:', error.response?.status);
            console.error('Данные ошибки:', JSON.stringify(error.response?.data, null, 2));
            console.error('Сообщение:', error.message);
            
            const errorDetails = error.response?.data?.errors?.[0];
            const errorMessage = errorDetails?.message || 
                               error.response?.data?.error || 
                               'Не удалось рассчитать стоимость доставки';
            
            const baseDeliveryCost = params.deliveryType === 'door' ? 500 : 350;
            
            return {
                success: false,
                error: errorMessage,
                errorCode: errorDetails?.code,
                details: error.response?.data?.errors || error.message,
                fallback: {
                    deliveryCost: baseDeliveryCost,
                    deliveryDays: '3-5',
                    tariffName: params.deliveryType === 'door' ? 
                        'Посылка дверь-дверь (примерная стоимость)' : 
                        'Посылка склад-склад (примерная стоимость)',
                    note: `API СДЭК: ${errorMessage}. Показана примерная стоимость на основе среднего тарифа.`
                }
            };
        }
    }

    async createDeliveryOrder(orderData) {
        try {
            const token = await this.authenticate();
            
            const cdekOrder = {
                type: 1,
                number: `ORDER-${orderData.orderId}-${Date.now()}`,
                tariff_code: orderData.tariffCode || 136,
                comment: orderData.comment || 'Заказ из интернет-магазина электроники',
                
                sender: {
                    name: 'Electronics Store',
                    phones: [{
                        number: '+74951234567'
                    }]
                },
                
                recipient: {
                    name: orderData.clientName,
                    phones: [{
                        number: orderData.clientPhone
                    }],
                    email: orderData.clientEmail
                },
                
                from_location: {
                    code: this.fromLocation.code,
                    address: this.fromLocation.address
                },
                
                to_location: {
                    code: orderData.cityCode,
                    city: orderData.city,
                    address: orderData.address
                },
                
                packages: [{
                    number: `PKG-${orderData.orderId}`,
                    weight: orderData.weight || 1000,
                    length: 30,
                    width: 20,
                    height: 10,
                    comment: `Товары из заказа #${orderData.orderId}`
                }],
                
                services: [
                    {
                        code: 'INSURANCE',
                        parameter: orderData.orderAmount?.toString() || '10000'
                    }
                ]
            };

            const response = await axios.post(
                `${this.baseURL}/orders`,
                cdekOrder,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                cdekOrderId: response.data.entity.uuid,
                cdekOrderNumber: response.data.entity.cdek_number,
                trackingUrl: `https://www.cdek.ru/ru/tracking?order_id=${response.data.entity.cdek_number}`,
                message: 'Заказ успешно создан в системе СДЭК',
                rawResponse: response.data
            };
        } catch (error) {
            console.error('Ошибка создания заказа СДЭК:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось создать заказ доставки',
                details: error.response?.data?.errors || error.message
            };
        }
    }

    async trackDelivery(cdekOrderId) {
        try {
            const token = await this.authenticate();

            const response = await axios.get(
                `${this.baseURL}/orders/${cdekOrderId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const order = response.data.entity;
            
            return {
                success: true,
                status: this.translateStatus(order.status_code),
                statusCode: order.status_code,
                location: order.location?.city || 'Неизвестно',
                trackingNumber: order.cdek_number,
                trackingUrl: `https://www.cdek.ru/ru/tracking?order_id=${order.cdek_number}`,
                history: order.statuses?.map(s => ({
                    status: this.translateStatus(s.code),
                    date: s.date_time,
                    location: s.city || ''
                })) || [],
                rawResponse: order
            };
        } catch (error) {
            console.error('Ошибка отслеживания:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось получить информацию о доставке',
                details: error.response?.data?.errors || error.message
            };
        }
    }

    async getDeliveryPoints(city) {
        if (this.demoMode) {
            console.log(`🎭 ДЕМО: Получение пунктов выдачи для города "${city}"`);
            
            const demoPoints = [
                {
                    code: 'MSK001',
                    name: 'СДЭК на Тверской',
                    address: 'г. ' + city + ', ул. Тверская, д. 1',
                    city: city,
                    coordinates: { latitude: 55.7558, longitude: 37.6173 },
                    workTime: 'Пн-Пт: 9:00-20:00, Сб-Вс: 10:00-18:00',
                    phones: [{ number: '+74951234567' }],
                    type: 'Пункт выдачи'
                },
                {
                    code: 'MSK002',
                    name: 'СДЭК Постамат',
                    address: 'г. ' + city + ', ул. Ленина, д. 10',
                    city: city,
                    coordinates: { latitude: 55.7600, longitude: 37.6100 },
                    workTime: 'Круглосуточно',
                    phones: [{ number: '+74951234568' }],
                    type: 'Постамат'
                },
                {
                    code: 'MSK003',
                    name: 'СДЭК в ТЦ Город',
                    address: 'г. ' + city + ', пр-т Мира, д. 150',
                    city: city,
                    coordinates: { latitude: 55.7700, longitude: 37.6400 },
                    workTime: 'Пн-Вс: 10:00-22:00',
                    phones: [{ number: '+74951234569' }],
                    type: 'Пункт выдачи'
                }
            ];
            
            return {
                success: true,
                points: demoPoints,
                count: demoPoints.length
            };
        }
        
        try {
            const token = await this.authenticate();

            const response = await axios.get(
                `${this.baseURL}/deliverypoints`,
                {
                    params: {
                        city: city,
                        type: 'PVZ'
                    },
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return {
                success: true,
                points: response.data.map(p => ({
                    code: p.code,
                    name: p.name,
                    address: p.location.address_full,
                    city: p.location.city,
                    coordinates: {
                        latitude: p.location.latitude,
                        longitude: p.location.longitude
                    },
                    workTime: p.work_time,
                    phones: p.phones,
                    type: p.type === 'PVZ' ? 'Пункт выдачи' : 'Постамат'
                })),
                count: response.data.length
            };
        } catch (error) {
            console.error('Ошибка получения ПВЗ:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось получить список пунктов выдачи',
                details: error.response?.data?.errors || error.message
            };
        }
    }

    calculateWeight(items) {
        if (!items || items.length === 0) return 1000;
        
        return items.reduce((total, item) => {
            const itemWeight = 500;
            return total + (itemWeight * item.quantity);
        }, 0);
    }

    translateStatus(statusCode) {
        const statuses = {
            'CREATED': 'Заказ создан',
            'ACCEPTED': 'Принят на склад',
            'READY_FOR_SHIPMENT': 'Готов к отправке',
            'DELIVERED_TO_SENDER': 'Передан курьеру',
            'IN_TRANSIT': 'В пути',
            'ACCEPTED_IN_DESTINATION': 'Прибыл в город получателя',
            'READY_FOR_RECIPIENT': 'Готов к выдаче',
            'DELIVERED': 'Доставлен',
            'NOT_DELIVERED': 'Не доставлен',
            'CANCELED': 'Отменен'
        };
        
        return statuses[statusCode] || statusCode;
    }

    async getCities(searchQuery) {
        if (this.demoMode) {
            console.log(`🎭 ДЕМО: Поиск города "${searchQuery}"`);
            
            const demoCities = {
                'Москва': [{ code: 44, city: 'Москва', region: 'Москва', country: 'Россия' }],
                'Санкт-Петербург': [{ code: 137, city: 'Санкт-Петербург', region: 'Санкт-Петербург', country: 'Россия' }],
                'Новосибирск': [{ code: 270, city: 'Новосибирск', region: 'Новосибирская область', country: 'Россия' }],
                'Екатеринбург': [{ code: 250, city: 'Екатеринбург', region: 'Свердловская область', country: 'Россия' }],
                'Казань': [{ code: 344, city: 'Казань', region: 'Республика Татарстан', country: 'Россия' }]
            };
            
            const cities = demoCities[searchQuery] || demoCities['Москва'];
            
            return {
                success: true,
                cities: cities
            };
        }
        
        try {
            const token = await this.authenticate();

            const response = await axios.get(
                `${this.baseURL}/location/cities`,
                {
                    params: {
                        city: searchQuery,
                        size: 10
                    },
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return {
                success: true,
                cities: response.data.map(c => ({
                    code: c.code,
                    city: c.city,
                    region: c.region,
                    country: c.country
                }))
            };
        } catch (error) {
            console.error('Ошибка поиска городов:', error.response?.data || error.message);
            
            return {
                success: false,
                error: 'Не удалось найти города',
                details: error.response?.data?.errors || error.message
            };
        }
    }

    async calculateDeliveryList(params) {
        console.log('\n🚀 === НАЧАЛО РАСЧЕТА ДОСТАВКИ СДЭК ===');
        console.log('Параметры:', JSON.stringify(params, null, 2));
        
        if (this.demoMode) {
            console.log('🎭 ДЕМО-режим: Возврат примерных данных');
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const baseCost = params.deliveryType === 'door' ? 450 : 320;
            const randomVariation = Math.floor(Math.random() * 100);
            
            const demoTariffs = [
                {
                    tariffCode: 136,
                    tariffName: 'Посылка дверь-дверь',
                    tariffDescription: 'Доставка до двери получателя',
                    deliveryMode: 1,
                    deliveryCost: baseCost + randomVariation,
                    deliveryDays: '2-4',
                    currency: 'RUB'
                },
                {
                    tariffCode: 138,
                    tariffName: 'Посылка склад-склад',
                    tariffDescription: 'Самовывоз из пункта выдачи',
                    deliveryMode: 2,
                    deliveryCost: 320 + randomVariation - 50,
                    deliveryDays: '2-3',
                    currency: 'RUB'
                },
                {
                    tariffCode: 139,
                    tariffName: 'Посылка дверь-склад',
                    tariffDescription: 'Забор от отправителя, самовывоз получателем',
                    deliveryMode: 3,
                    deliveryCost: 380 + randomVariation - 30,
                    deliveryDays: '2-4',
                    currency: 'RUB'
                }
            ];
            
            const selectedTariff = params.deliveryType === 'door' ? demoTariffs[0] : demoTariffs[1];
            
            console.log('✅ ДЕМО: Расчет выполнен');
            console.log(`   Стоимость: ${selectedTariff.deliveryCost}₽`);
            console.log(`   Срок: ${selectedTariff.deliveryDays} дней`);
            
            return {
                success: true,
                deliveryCost: selectedTariff.deliveryCost,
                deliveryDays: selectedTariff.deliveryDays,
                tariffCode: selectedTariff.tariffCode,
                tariffName: selectedTariff.tariffName + ' (ДЕМО)',
                tariffDescription: selectedTariff.tariffDescription,
                currency: 'RUB',
                cityCode: 999,
                allTariffs: demoTariffs,
                demoMode: true,
                note: '⚠️ Это демо-данные. Для реальных расчетов настройте СДЭК API.'
            };
        }
        
        try {
            const token = await this.authenticate();
            
            const weight = params.weight || this.calculateWeight(params.items);
            console.log(`⚖️ Вес посылки: ${weight} г`);
            
            let cityCode = params.cityCode;
            if (!cityCode && params.city) {
                console.log(`🔍 Поиск кода города: ${params.city}`);
                const citiesResult = await this.getCities(params.city);
                if (citiesResult.success && citiesResult.cities.length > 0) {
                    cityCode = citiesResult.cities[0].code;
                    console.log(`✅ Найден код города ${params.city}: ${cityCode}`);
                    console.log(`   Полная информация:`, citiesResult.cities[0]);
                } else {
                    console.error(`❌ Город "${params.city}" не найден в базе СДЭК`);
                    throw new Error(`Город "${params.city}" не найден в базе СДЭК`);
                }
            }
            
            if (!cityCode) {
                throw new Error('Необходимо указать город доставки');
            }
            
            const requestData = {
                type: 1,
                currency: 1,
                lang: 'rus',
                from_location: {
                    code: this.fromLocation.code
                },
                to_location: {
                    code: cityCode
                },
                packages: [{
                    weight: weight,
                    length: 30,
                    width: 20,
                    height: 10
                }]
            };

            console.log('\n📤 ЗАПРОС К СДЭК API:');
            console.log(`   URL: ${this.baseURL}/calculator/tarifflist`);
            console.log(`   Данные:`, JSON.stringify(requestData, null, 2));
            console.log(`   Токен: Bearer ${token.substring(0, 20)}...`);

            const response = await axios.post(
                `${this.baseURL}/calculator/tarifflist`,
                requestData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );

            console.log('\n📥 ОТВЕТ ОТ СДЭК API:');
            console.log(`   Статус: ${response.status}`);
            console.log(`   Данные:`, JSON.stringify(response.data, null, 2));

            if (!response.data.tariff_codes || response.data.tariff_codes.length === 0) {
                console.error('❌ СДЭК не вернул тарифов');
                throw new Error('СДЭК не вернул доступных тарифов для данного направления');
            }

            console.log(`✅ Получено тарифов: ${response.data.tariff_codes.length}`);

            const tariffs = response.data.tariff_codes.map(t => ({
                tariffCode: t.tariff_code,
                tariffName: t.tariff_name,
                tariffDescription: t.tariff_description,
                deliveryMode: t.delivery_mode,
                deliveryCost: t.delivery_sum,
                deliveryDays: `${t.period_min || 'н/д'}-${t.period_max || 'н/д'}`,
                currency: 'RUB'
            }));

            tariffs.forEach((t, i) => {
                console.log(`   ${i + 1}. ${t.tariffName} (${t.tariffCode}): ${t.deliveryCost}₽, ${t.deliveryDays} дней`);
            });

            const doorDelivery = tariffs.find(t => t.tariffCode === 136 || t.deliveryMode === 1);
            const pickupDelivery = tariffs.find(t => t.tariffCode === 138 || t.deliveryMode === 2);

            const selectedTariff = params.deliveryType === 'door' 
                ? (doorDelivery || tariffs[0]) 
                : (pickupDelivery || tariffs[0]);

            console.log(`\n🎯 Выбранный тариф: ${selectedTariff.tariffName} (${selectedTariff.tariffCode})`);
            console.log(`   Стоимость: ${selectedTariff.deliveryCost}₽`);
            console.log(`   Срок: ${selectedTariff.deliveryDays} дней`);
            console.log('\n✅ === РАСЧЕТ ЗАВЕРШЕН УСПЕШНО ===\n');

            return {
                success: true,
                deliveryCost: selectedTariff.deliveryCost,
                deliveryDays: selectedTariff.deliveryDays,
                tariffCode: selectedTariff.tariffCode,
                tariffName: selectedTariff.tariffName,
                tariffDescription: selectedTariff.tariffDescription,
                currency: 'RUB',
                cityCode: cityCode,
                allTariffs: tariffs,
                rawResponse: response.data
            };
        } catch (error) {
            console.error('\n❌ === ОШИБКА РАСЧЕТА ДОСТАВКИ ===');
            console.error('Тип ошибки:', error.constructor.name);
            console.error('Сообщение:', error.message);
            
            if (error.response) {
                console.error('HTTP статус:', error.response.status);
                console.error('Заголовки ответа:', error.response.headers);
                console.error('Тело ответа:', JSON.stringify(error.response.data, null, 2));
            } else if (error.request) {
                console.error('Запрос был отправлен, но ответа не получено');
                console.error('Request:', error.request);
            } else {
                console.error('Ошибка при формировании запроса');
            }
            
            console.error('Stack trace:', error.stack);
            console.error('=== КОНЕЦ ОШИБКИ ===\n');
            
            const errorDetails = error.response?.data?.errors?.[0];
            const errorMessage = errorDetails?.message || error.message;
            
            const baseDeliveryCost = params.deliveryType === 'door' ? 500 : 350;
            
            return {
                success: false,
                error: errorMessage,
                errorCode: errorDetails?.code,
                details: error.response?.data?.errors || error.message,
                fallback: {
                    deliveryCost: baseDeliveryCost,
                    deliveryDays: '3-5',
                    tariffName: params.deliveryType === 'door' ? 
                        'Посылка дверь-дверь (примерная стоимость)' : 
                        'Посылка склад-склад (примерная стоимость)',
                    note: `API СДЭК: ${errorMessage}. Показана примерная стоимость.`
                }
            };
        }
    }

    async testConnection() {
        console.log('\n🧪 === ТЕСТ ПОДКЛЮЧЕНИЯ К СДЭК API ===\n');
        
        try {
            console.log('1️⃣ Тест аутентификации...');
            const token = await this.authenticate();
            console.log('✅ Аутентификация успешна\n');
            
            console.log('2️⃣ Тест поиска городов (Москва)...');
            const citiesResult = await this.getCities('Москва');
            if (citiesResult.success && citiesResult.cities.length > 0) {
                console.log(`✅ Найдено городов: ${citiesResult.cities.length}`);
                console.log(`   Первый результат:`, citiesResult.cities[0]);
            } else {
                console.log('❌ Города не найдены');
            }
            console.log('');
            
            console.log('3️⃣ Тест расчета доставки (Москва → Санкт-Петербург)...');
            const deliveryResult = await this.calculateDeliveryList({
                city: 'Санкт-Петербург',
                deliveryType: 'door',
                weight: 1000
            });
            
            if (deliveryResult.success) {
                console.log('✅ Расчет доставки успешен');
                console.log(`   Стоимость: ${deliveryResult.deliveryCost}₽`);
                console.log(`   Срок: ${deliveryResult.deliveryDays} дней`);
                console.log(`   Тариф: ${deliveryResult.tariffName}`);
            } else {
                console.log('⚠️ Расчет не удался, используется fallback');
                console.log(`   Ошибка: ${deliveryResult.error}`);
            }
            console.log('');
            
            console.log('✅ === ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===\n');
            
            return {
                success: true,
                message: 'Подключение к СДЭК API работает',
                details: {
                    auth: true,
                    cities: citiesResult.success,
                    delivery: deliveryResult.success
                }
            };
        } catch (error) {
            console.error('❌ === ТЕСТ ПРОВАЛЕН ===');
            console.error('Ошибка:', error.message);
            console.error('Stack:', error.stack);
            console.error('\n');
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new CdekService();

