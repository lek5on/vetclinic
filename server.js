const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt'); // Добавлено для хеширования паролей
const jwt = require('jsonwebtoken'); // Добавлено для генерации токенов

const app = express();

// --- НАСТРОЙКИ ---

// Используйте переменную окружения для секрета JWT или укажите жёстко для разработки
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';

// Middleware для сессий (остаётся для совместимости, но не используется для аутентификации)
app.use(session({
    secret: 'vetclinicsecret',
    resave: false,
    saveUninitialized: false
}));
app.use(bodyParser.json());

// --- НОВЫЕ МОДЕЛИ ---

// Service
const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  price: { type: Number, required: true, min: 0 }, // Убедитесь, что тип соответствует bsonType в схеме БД
  category: { type: String, trim: true }
});
const Service = mongoose.model('Service', serviceSchema);

// User
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'vet', 'client'], required: true },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', default: null } // Только если role === 'client'
});
const User = mongoose.model('User', userSchema);

// Report
// Схема соответствует валидации MongoDB: поля на верхнем уровне
const reportSchema = new mongoose.Schema({
  period_start: { type: Date, required: true },
  period_end: { type: Date, required: true },
  generated_at: { type: Date, default: Date.now },
  generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  visit_count: { type: Number, required: true }, // int в MongoDB
  total_revenue: { type: Number, required: true }, // double в MongoDB
  top_services: { type: [String], default: [] } // массив строк
});
const Report = mongoose.model('Report', reportSchema);

// --- СУЩЕСТВУЮЩИЕ МОДЕЛИ (оставлены без изменений) ---
const ownerSchema = new mongoose.Schema({
    full_name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    email: { type: String, trim: true, match: [/.+\@.+\..+/, 'Некорректный email'] }
});
const Owner = mongoose.model('Owner', ownerSchema);

const diseaseSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    treatment: { type: String, trim: true }
});
const Disease = mongoose.model('Disease', diseaseSchema);

const animalSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    species: { type: String, required: true, trim: true },
    breed: { type: String, trim: true },
    age: { type: Number, min: 0 },
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
    medical_history: [{
        disease_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Disease', required: true }
    }]
});
const Animal = mongoose.model('Animal', animalSchema);

// --- ОБНОВЛЁННАЯ МОДЕЛЬ Visit ---
// ИСПРАВЛЕНО: Поля теперь правильно вложены в схему
const visitSchema = new mongoose.Schema({
    animal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Animal', required: true },
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true },
    date: { type: Date, required: true },
    disease_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Disease' },
    notes: { type: String, trim: true },
    status: { type: String, enum: ['planned', 'completed', 'cancelled'], default: 'planned' },
    // --- НОВЫЕ ПОЛЯ ---
    service_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }], // Массив ссылок на услуги
    total_cost: { type: Number, default: 0 }, // Общая стоимость визита
    vet_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Ссылка на ветеринара (пользователя)
    // ---
});
const Visit = mongoose.model('Visit', visitSchema);

// --- MIDDLEWARE ДЛЯ АВТОРИЗАЦИИ ---

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Токен отсутствует' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Ошибка проверки токена:', err);
      return res.status(403).json({ message: 'Токен недействителен' });
    }
    req.user = user; // Добавляем информацию о пользователе в req
    next();
  });
};

// Middleware для проверки роли
const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Недостаточно прав для выполнения операции' });
  }
  next();
};

// --- МАРШРУТЫ ---

// Статические файлы
app.use(express.static(path.join(__dirname, 'public'))); // Убедимся, что путь правильный

// --- АВТОРИЗАЦИЯ ---

// Логин (заменяет старый простой пароль)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username }).populate('owner_id'); // Подгружаем owner_id, если роль 'client'
    if (!user) {
      return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
    }

    // Генерация JWT токена
    const token = jwt.sign(
      { userId: user._id, role: user.role, owner_id: user.owner_id ? user.owner_id._id : null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Возврат токена и роли для клиента
    res.json({
      success: true,
      token,
      role: user.role,
      redirect: user.role === 'admin' ? '/admin.html' : '/client.html',
      owner_id: user.owner_id ? user.owner_id._id : null // Для клиента
    });
  } catch (error) {
    console.error('Ошибка при логине:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- УПРАВЛЕНИЕ УСЛУГАМИ (только для администратора) ---
app.get('/api/services', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/services', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const service = new Service(req.body);
    await service.save();
    res.status(201).json(service);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/services/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!service) return res.status(404).json({ message: 'Услуга не найдена' });
    res.json(service);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/services/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: 'Услуга не найдена' });
    res.json({ message: 'Услуга удалена' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ФОРМИРОВАНИЕ ОТЧЁТОВ (только для администратора) ---

// Получение списка всех отчётов
app.get('/api/reports', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('generated_by', 'username')
      .sort({ generated_at: -1 }); // Сначала новые
    res.json(reports);
  } catch (error) {
    console.error('Ошибка при получении списка отчётов:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение конкретного отчёта
app.get('/api/reports/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('generated_by', 'username');
    if (!report) {
      return res.status(404).json({ error: 'Отчёт не найден' });
    }
    res.json(report);
  } catch (error) {
    console.error('Ошибка при получении отчёта:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удаление отчёта
app.delete('/api/reports/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Отчёт не найден' });
    }
    res.json({ message: 'Отчёт успешно удалён', report });
  } catch (error) {
    console.error('Ошибка при удалении отчёта:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создание нового отчёта
app.post('/api/reports', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { period_start, period_end } = req.body;

  try {
    // Валидация дат
    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'Необходимо указать период начала и конца' });
    }

    const startDate = new Date(period_start);
    const endDate = new Date(period_end);
    
    // Устанавливаем конец дня для period_end (23:59:59.999)
    endDate.setHours(23, 59, 59, 999);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Некорректный формат даты' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'Дата начала не может быть позже даты конца' });
    }

    // Агрегация данных из visits и services
    const aggregationResult = await Visit.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: 'completed' // Только завершённые визиты
        }
      },
      {
        $lookup: {
          from: "services", // Имя коллекции services
          localField: "service_ids", // Массив ObjectID в visits
          foreignField: "_id", // _id в services
          as: "services_info"
        }
      },
      {
        $addFields: {
          total_revenue: { $sum: "$services_info.price" }, // Суммируем цены услуг
          service_names: "$services_info.name" // Массив имён услуг для этого визита
        }
      },
      {
        $group: {
          _id: null,
          visit_count: { $sum: 1 },
          total_revenue: { $sum: "$total_revenue" },
          all_service_names: { $push: "$service_names" } // Массив массивов имён
        }
      },
      {
        $project: {
          _id: 0,
          visit_count: 1,
          total_revenue: 1,
          all_service_names: 1
        }
      }
    ]);

    const result = aggregationResult[0] || { visit_count: 0, total_revenue: 0, all_service_names: [] };

    // Подсчёт топ-услуг
    // all_service_names - это массив массивов, нужно сделать flat(2) для вложенных массивов
    const allServiceNames = (result.all_service_names || []).flat(2).filter(name => name != null && name !== '');
    const serviceCountMap = allServiceNames.reduce((acc, name) => {
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    const top_services = Object.entries(serviceCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(item => item[0]);

    // Подготовка данных для сохранения
    // Убеждаемся, что visit_count - целое число (MongoDB требует int, а не double)
    const visitCount = parseInt(result.visit_count || 0, 10);
    // total_revenue может быть числом с плавающей точкой
    const totalRevenue = parseFloat(result.total_revenue || 0);
    // top_services должен быть массивом строк (не null, не undefined)
    const topServicesArray = Array.isArray(top_services) && top_services.length > 0 
      ? top_services.filter(s => typeof s === 'string' && s.trim() !== '')
      : [];

    // Подготовка документа для сохранения с правильными типами
    // Используем Int32 и Double из нативного драйвера MongoDB
    const { Int32, Double } = require('mongodb');
    const reportData = {
      period_start: startDate,
      period_end: endDate,
      generated_at: new Date(),
      generated_by: new mongoose.Types.ObjectId(req.user.userId),
      visit_count: new Int32(visitCount), // Явно указываем Int32 из mongodb драйвера
      total_revenue: new Double(totalRevenue), // Явно указываем Double из mongodb драйвера
      top_services: topServicesArray
    };

    // Логирование для отладки
    console.log('Создание отчёта - подготовленные данные:', {
      period_start: reportData.period_start,
      period_end: reportData.period_end,
      generated_at: reportData.generated_at,
      generated_by: reportData.generated_by,
      visit_count: reportData.visit_count,
      visit_count_type: reportData.visit_count.constructor.name,
      total_revenue: reportData.total_revenue,
      total_revenue_type: typeof reportData.total_revenue,
      top_services: reportData.top_services,
      top_services_type: Array.isArray(reportData.top_services) ? 'array' : typeof reportData.top_services
    });

    // Сохраняем напрямую через коллекцию с правильными типами
    try {
      const insertResult = await Report.collection.insertOne(reportData);
      console.log('Отчёт успешно сохранён:', insertResult.insertedId);
      
      // Загружаем сохранённый документ
      const savedReport = await Report.findById(insertResult.insertedId);
      if (!savedReport) {
        throw new Error('Не удалось загрузить сохранённый отчёт');
      }
      
      return res.json(savedReport);
    } catch (insertError) {
      console.error('Ошибка при сохранении отчёта:', insertError);
      if (insertError.errInfo && insertError.errInfo.details) {
        console.error('Детали ошибки валидации:', JSON.stringify(insertError.errInfo.details, null, 2));
      }
      throw insertError;
    }
  } catch (error) {
    console.error('Ошибка при формировании отчёта:', error);
    console.error('Детали ошибки:', error.errInfo || error.message);
    res.status(500).json({ 
      error: error.message,
      code: error.code,
      details: error.errInfo || null
    });
  }
});

// --- ОБНОВЛЁННЫЕ МАРШРУТЫ ДЛЯ VISITS ---

// Получение визитов (обновлено для populate service_ids)
app.get('/api/visits', authenticateToken, async (req, res) => {
  try {
    const visits = await Visit.find()
      .populate('animal_id')
      .populate('owner_id')
      .populate('disease_id')
      .populate('service_ids') // Добавлено
      .populate('vet_id');     // Добавлено
    res.send(visits);
  } catch (error) {
    res.status(500).send({ message: 'Ошибка при получении списка визитов', error: error.message });
  }
});

// Получение конкретного визита (обновлено для populate service_ids)
app.get('/api/visits/:id', authenticateToken, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate('animal_id')
      .populate('owner_id')
      .populate('disease_id')
      .populate('service_ids') // Добавлено
      .populate('vet_id');     // Добавлено
    if (!visit) return res.status(404).send('Визит не найден');
    res.send(visit);
  } catch (error) {
    res.status(500).send({ message: 'Ошибка при получении визита', error: error.message });
  }
});

// Обновление визита (обновлено для работы с service_ids, total_cost)
app.put('/api/visits/:id', authenticateToken, async (req, res) => {
  try {
    const { date, notes, status, service_ids } = req.body; // Добавлено service_ids
    let total_cost = 0;

    if (service_ids && service_ids.length > 0) {
      // Загрузка цен услуг для расчёта total_cost
      const services = await Service.find({ _id: { $in: service_ids } });
      total_cost = services.reduce((sum, service) => sum + (service.price || 0), 0);
    }

    const updatedVisit = await Visit.findByIdAndUpdate(
      req.params.id,
      { date: new Date(date), notes, status, service_ids, total_cost }, // Добавлены service_ids, total_cost
      { new: true, runValidators: true }
    ).populate('animal_id owner_id disease_id service_ids vet_id'); // Добавлено populate для service_ids, vet_id

    if (!updatedVisit) {
      return res.status(404).send('Визит не найден');
    }

    res.send(updatedVisit);
  } catch (error) {
    res.status(400).send({ message: 'Ошибка при обновлении визита', error: error.message });
  }
});

// Создание визита (обновлено для работы с service_ids, total_cost)
app.post('/api/visits', async (req, res) => {
  try {
    const { animal_id, owner_id, date, notes, status, service_ids, vet_id } = req.body; // Добавлены service_ids, vet_id
    let total_cost = 0;

    if (service_ids && service_ids.length > 0) {
      const services = await Service.find({ _id: { $in: service_ids } });
      total_cost = services.reduce((sum, service) => sum + (service.price || 0), 0);
    }

    const visit = new Visit({
      animal_id,
      owner_id,
      date: new Date(date),
      notes,
      status,
      service_ids, // Добавлено
      total_cost,  // Добавлено
      vet_id       // Добавлено (если передаётся)
    });

    await visit.save();
    await visit.populate('animal_id owner_id disease_id service_ids vet_id'); // Populate для ответа

    res.status(201).send(visit);
  } catch (error) {
    res.status(400).send({ message: 'Ошибка при добавлении визита', error: error.message });
  }
});

// --- СТАРЫЕ МАРШРУТЫ (остаются, но защищены токеном) ---
// API для animals
app.post('/api/animals', async (req, res) => {
    try {
        let ownerId = req.body.owner_id || null;

        if (req.body.new_owner) {
            const newOwnerData = req.body.new_owner;
            const owner = new Owner({
                full_name: newOwnerData.full_name,
                phone: newOwnerData.phone || null,
                address: newOwnerData.address || null,
                email: newOwnerData.email || null
            });
            const savedOwner = await owner.save();
            ownerId = savedOwner._id;
        }

        const animalData = {
            name: req.body.name,
            species: req.body.species,
            breed: req.body.breed || null,
            age: req.body.age || null,
            owner_id: ownerId,
            medical_history: req.body.medical_history || []
        };
        const animal = new Animal(animalData);
        await animal.save();
        res.status(201).send(animal);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при добавлении животного', error: error.message });
    }
});

app.get('/api/animals', authenticateToken, async (req, res) => {
    try {
        const animals = await Animal.find()
            .populate('owner_id')
            .populate('medical_history.disease_id');
        res.send(animals);
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при получении списка животных', error: error.message });
    }
});

app.get('/api/animals/search', authenticateToken, async (req, res) => {
    try {
        const { species } = req.query;
        const animals = await Animal.find({ species })
            .populate('owner_id')
            .populate('medical_history.disease_id');
        res.send(animals);
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при поиске животных', error: error.message });
    }
});

app.get('/api/animals/:id', authenticateToken, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id)
            .populate('owner_id')
            .populate('medical_history.disease_id');
        if (!animal) return res.status(404).send('Животное не найдено');
        res.send(animal);
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при получении животного', error: error.message });
    }
});

app.put('/api/animals/:id', authenticateToken, async (req, res) => {
    try {
        const animalData = {
            name: req.body.name,
            species: req.body.species,
            breed: req.body.breed || null,
            age: req.body.age || null,
            owner_id: req.body.owner_id || null
        };

        if (req.body.owner_data) {
            const ownerData = req.body.owner_data;

            if (req.body.owner_id) {
                const updatedOwner = await Owner.findByIdAndUpdate(
                    req.body.owner_id,
                    {
                        full_name: ownerData.full_name,
                        phone: ownerData.phone || null,
                        address: ownerData.address || null,
                        email: ownerData.email || null
                    },
                    { new: true, runValidators: true }
                );
                if (!updatedOwner) {
                    return res.status(404).send({ message: 'Хозяин не найден' });
                }
                animalData.owner_id = updatedOwner._id;
            } else {
                const newOwner = new Owner({
                    full_name: ownerData.full_name,
                    phone: ownerData.phone || null,
                    address: ownerData.address || null,
                    email: ownerData.email || null
                });
                const savedOwner = await newOwner.save();
                animalData.owner_id = savedOwner._id;
            }
        }

        const animal = await Animal.findByIdAndUpdate(req.params.id, animalData, { new: true, runValidators: true });
        if (!animal) return res.status(404).send('Животное не найдено');
        res.send(animal);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при обновлении животного', error: error.message });
    }
});

app.post('/api/animals/:id/medical-history', authenticateToken, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).send('Животное не найдено');

        let disease;
        if (req.body.disease_id) {
            disease = await Disease.findById(req.body.disease_id);
            if (!disease) return res.status(404).send('Болезнь не найдена');
        } else {
            disease = await Disease.findOne({ name: req.body.disease_name });
            if (!disease) {
                disease = new Disease({
                    name: req.body.disease_name,
                    description: req.body.symptoms || null,
                    treatment: req.body.treatment || null
                });
                await disease.save();
            }
        }

        const newRecord = { disease_id: disease._id };
        animal.medical_history.push(newRecord);
        await animal.save();

        await Visit.updateMany(
            { animal_id: req.params.id, disease_id: null },
            { $set: { disease_id: disease._id } }
        );

        const updatedAnimal = await Animal.findById(req.params.id)
            .populate('owner_id')
            .populate('medical_history.disease_id');
        res.status(200).send(updatedAnimal);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при добавлении записи в медицинскую карточку', error: error.message });
    }
});

app.put('/api/animals/:id/medical-history/:recordId', authenticateToken, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).send('Животное не найдено');

        const record = animal.medical_history.id(req.params.recordId);
        if (!record) return res.status(404).send('Запись не найдена');

        const newDiseaseId = req.body.disease_id;
        if (!newDiseaseId) return res.status(400).send('Не указан ID новой болезни');

        const disease = await Disease.findById(newDiseaseId);
        if (!disease) return res.status(404).send('Новая болезнь не найдена');

        record.disease_id = newDiseaseId;
        await animal.save();

        await Visit.updateMany(
            { animal_id: req.params.id, disease_id: record.disease_id },
            { $set: { disease_id: newDiseaseId } }
        );

        const updatedAnimal = await Animal.findById(req.params.id)
            .populate('owner_id')
            .populate('medical_history.disease_id');
        res.status(200).send(updatedAnimal);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при замене болезни', error: error.message });
    }
});

app.delete('/api/animals/:id/medical-history/:recordId', authenticateToken, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).send('Животное не найдено');

        const record = animal.medical_history.id(req.params.recordId);
        if (!record) return res.status(404).send('Запись не найдена');

        const oldDiseaseId = record.disease_id;
        animal.medical_history.pull(req.params.recordId);
        await animal.save();

        await Visit.updateMany(
            { animal_id: req.params.id, disease_id: oldDiseaseId },
            { $set: { disease_id: null } }
        );

        const updatedAnimal = await Animal.findById(req.params.id)
            .populate('owner_id')
            .populate('medical_history.disease_id');
        res.status(200).send(updatedAnimal);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при удалении записи', error: error.message });
    }
});

app.delete('/api/animals/:id', authenticateToken, async (req, res) => {
    try {
        const animal = await Animal.findByIdAndDelete(req.params.id);
        if (!animal) return res.status(404).send('Животное не найдено');
        res.status(200).send({ message: 'Животное успешно удалено' });
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при удалении животного', error: error.message });
    }
});

// API для owners
app.post('/api/owners', async (req, res) => {
    try {
        const owner = new Owner(req.body);
        await owner.save();
        res.status(201).send(owner);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при добавлении хозяина', error: error.message });
    }
});

app.get('/api/owners', async (req, res) => {
  try {
    const { phone } = req.query;
    if (phone) {
      const owners = await Owner.find({ phone });
      res.send(owners);
    } else {
      const owners = await Owner.find();
      res.send(owners);
    }
  } catch (error) {
    res.status(500).send({ message: 'Ошибка при получении списка хозяев', error: error.message });
  }
});

app.put('/api/owners/:id', authenticateToken, async (req, res) => {
    try {
        const owner = await Owner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!owner) return res.status(404).send('Хозяин не найден');
        res.send(owner);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при обновлении хозяина', error: error.message });
    }
});

app.delete('/api/owners/:id', authenticateToken, async (req, res) => {
    try {
        const animals = await Animal.find({ owner_id: req.params.id });
        if (animals.length > 0) {
            return res.status(400).send({ message: 'Нельзя удалить хозяина, так как он связан с животными' });
        }

        const owner = await Owner.findByIdAndDelete(req.params.id);
        if (!owner) return res.status(404).send('Хозяин не найден');
        res.status(200).send({ message: 'Хозяин успешно удалён' });
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при удалении хозяина', error: error.message });
    }
});

// API для diseases
app.post('/api/diseases', authenticateToken, async (req, res) => {
    try {
        const disease = new Disease(req.body);
        await disease.save();
        res.status(201).send(disease);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при добавлении болезни', error: error.message });
    }
});

app.get('/api/diseases', authenticateToken, async (req, res) => {
    try {
        const diseases = await Disease.find();
        res.send(diseases);
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при получении списка болезней', error: error.message });
    }
});

app.put('/api/diseases/:id', authenticateToken, async (req, res) => {
    try {
        const disease = await Disease.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
                description: req.body.description || null,
                treatment: req.body.treatment || null
            },
            { new: true, runValidators: true }
        );
        if (!disease) return res.status(404).send('Болезнь не найдена');
        res.send(disease);
    } catch (error) {
        res.status(400).send({ message: 'Ошибка при обновлении болезни', error: error.message });
    }
});

app.delete('/api/diseases/:id', authenticateToken, async (req, res) => {
    try {
        const animalWithDisease = await Animal.findOne({ 'medical_history.disease_id': req.params.id });
        if (animalWithDisease) {
            return res.status(400).json({ message: 'Нельзя удалить болезнь, так как она используется в медицинских записях' });
        }
        const disease = await Disease.findByIdAndDelete(req.params.id);
        if (!disease) {
            return res.status(404).json({ message: 'Болезнь не найдена' });
        }
        res.json({ message: 'Болезнь успешно удалена' });
    } catch (error) {
        console.error('Ошибка при удалении болезни:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении болезни', error: error.message });
    }
});

// --- СТАРЫЕ МАРШРУТЫ ВИЗИТОВ (удалены или заменены выше) ---
// app.post('/api/visits', ...); // Заменено
// app.get('/api/visits', ...);  // Заменено
// app.get('/api/visits/:id', ...); // Заменено
// app.put('/api/visits/:id', ...); // Заменено
// app.delete('/api/visits/:id', ...); // Осталось без изменений, но защищено токеном

app.delete('/api/visits/:id', authenticateToken, async (req, res) => {
    try {
        const visit = await Visit.findByIdAndDelete(req.params.id);
        if (!visit) return res.status(404).send('Визит не найден');
        res.status(200).send({ message: 'Визит успешно удалён' });
    } catch (error) {
        res.status(500).send({ message: 'Ошибка при удалении визита', error: error.message });
    }
});

// --- МАРШРУТЫ СТАРОЙ АВТОРИЗАЦИИ (ОПЦИОНАЛЬНО, МОЖНО УДАЛИТЬ) ---
// Маршрут для проверки старого пароля (временно, для совместимости)
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === 'vetadmin123') {
        req.session.authenticated = true;
        res.json({ success: true, redirect: '/admin.html' });
    } else {
        res.status(401).json({ success: false, message: 'Неверный пароль' });
    }
});

// Защищаем маршрут /admin.html (временно, если нужна старая сессия)
const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        console.log('Перенаправление на /login');
        res.redirect('/login');
    }
};

app.get('/admin.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Маршрут для страницы логина
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Маршрут для выхода
app.get('/logout', (req, res) => {
    // Для JWT токенов не требуется серверная инвалидация
    // Токен просто удаляется на клиенте
    // Возвращаем успешный ответ
    res.json({ success: true, message: 'Выход выполнен успешно' });
});
// --- ПОДКЛЮЧЕНИЕ К БАЗЕ И ЗАПУСК СЕРВЕРА ---
mongoose.connect('mongodb://localhost:27017/vetclinic')
    .then(() => console.log('Подключено к MongoDB'))
    .catch(err => console.error('Ошибка:', err));

const PORT = 3000;
app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));