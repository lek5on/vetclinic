// --- НОВЫЕ ФУНКЦИИ ДЛЯ АВТОРИЗАЦИИ ---

// Вспомогательная функция для получения токена
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Вспомогательная функция для добавления заголовка авторизации к запросу
function addAuthHeader(headers) {
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// Проверка аутентификации при загрузке страницы
function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        alert('Сессия истекла. Пожалуйста, войдите снова.');
        window.location.href = '/login';
        return false;
    }
    return true;
}

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ОБРАБОТКИ ОШИБОК ---
function handleError(error, message) {
    console.error(message, error);
    alert(`Ошибка: ${message}. Подробности в консоли.`);
}

// --- ФУНКЦИИ ДЛЯ УСЛУГ ---

async function loadServices() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/services', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список услуг');
        const services = await response.json();
        const serviceList = document.getElementById('serviceList');
        serviceList.innerHTML = '';
        services.forEach(service => {
            const li = document.createElement('li');
            li.textContent = `${service.name} - ${service.description || 'Нет описания'} (${service.price} руб.) [${service.category || 'без категории'}]`;
            const editButton = document.createElement('button');
            editButton.textContent = 'Редактировать';
            editButton.onclick = () => openEditServicePopup(service);
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Удалить';
            deleteButton.onclick = () => deleteService(service._id);
            editButton.classList.add('service-action');
            deleteButton.classList.add('service-action');
            li.appendChild(editButton);
            li.appendChild(deleteButton);
            serviceList.appendChild(li);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке услуг');
    }
}

async function deleteService(id) {
    if (!checkAuth()) return;
    if (confirm('Удалить услугу?')) {
        try {
            const response = await fetch(`/api/services/${id}`, {
                method: 'DELETE',
                headers: addAuthHeader({})
            });
            if (!response.ok) throw new Error('Не удалось удалить услугу');
            loadServices();
            alert('Услуга успешно удалена!');
        } catch (error) {
            handleError(error, 'Ошибка при удалении услуги');
        }
    }
}

document.getElementById('serviceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!checkAuth()) return;
    const name = document.getElementById('serviceName').value.trim();
    const description = document.getElementById('serviceDescription').value.trim() || null;
    const price = parseFloat(document.getElementById('servicePrice').value);
    const category = document.getElementById('serviceCategory').value.trim() || null;

    if (!name || isNaN(price) || price < 0) {
        alert('Пожалуйста, заполните корректно название и цену');
        return;
    }

    try {
        const response = await fetch('/api/services', {
            method: 'POST',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ name, description, price, category })
        });
        if (!response.ok) throw new Error('Не удалось добавить услугу');
        document.getElementById('serviceForm').reset();
        loadServices();
        alert('Услуга успешно добавлена!');
    } catch (error) {
        handleError(error, 'Ошибка при добавлении услуги');
    }
});

let currentServiceId = null;
function openEditServicePopup(service) {
    currentServiceId = service._id;
    document.getElementById('editServiceName').value = service.name;
    document.getElementById('editServiceDescription').value = service.description || '';
    document.getElementById('editServicePrice').value = service.price;
    document.getElementById('editServiceCategory').value = service.category || '';

    document.getElementById('editServicePopup').style.display = 'flex';
    document.getElementById('editServiceForm').onsubmit = async (event) => {
        event.preventDefault();
        if (!checkAuth()) return;
        const name = document.getElementById('editServiceName').value.trim();
        const description = document.getElementById('editServiceDescription').value.trim() || null;
        const price = parseFloat(document.getElementById('editServicePrice').value);
        const category = document.getElementById('editServiceCategory').value.trim() || null;

        if (!name || isNaN(price) || price < 0) {
            alert('Пожалуйста, заполните корректно название и цену');
            return;
        }

        try {
            const response = await fetch(`/api/services/${currentServiceId}`, {
                method: 'PUT',
                headers: addAuthHeader({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name, description, price, category })
            });
            if (!response.ok) throw new Error('Не удалось обновить услугу');
            closeEditServicePopup();
            loadServices();
            alert('Услуга успешно обновлена!');
        } catch (error) {
            handleError(error, 'Ошибка при обновлении услуги');
        }
    };
}

function closeEditServicePopup() {
    document.getElementById('editServicePopup').style.display = 'none';
    currentServiceId = null;
}

// --- ФУНКЦИИ ДЛЯ ОТЧЁТОВ ---

// Функция для скачивания отчёта в формате .txt
function downloadReport(report) {
    const visitCount = report.visit_count || 0;
    const totalRevenue = report.total_revenue || 0;
    const topServices = report.top_services || [];
    
    // Форматируем даты
    const startDate = new Date(report.period_start).toLocaleDateString('ru-RU');
    const endDate = new Date(report.period_end).toLocaleDateString('ru-RU');
    const generatedDate = new Date(report.generated_at || new Date()).toLocaleString('ru-RU');
    
    // Формируем содержимое файла
    const reportText = `
ОТЧЁТ О ДЕЯТЕЛЬНОСТИ ВЕТЕРИНАРНОЙ ЛЕЧЕБНИЦЫ
===========================================

Период отчёта: ${startDate} - ${endDate}
Дата формирования: ${generatedDate}

СТАТИСТИКА:
-----------
Количество визитов: ${visitCount}
Общая выручка: ${totalRevenue.toFixed(2)} руб.

ТОП УСЛУГ:
----------
${topServices.length > 0 
    ? topServices.map((service, index) => `${index + 1}. ${service}`).join('\n')
    : 'Нет данных'}

===========================================
Конец отчёта
`;

    // Создаём blob и скачиваем файл
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Формируем имя файла с датой (формат: отчет_ДД-ММ-ГГГГ_ДД-ММ-ГГГГ.txt)
    const formatDateForFileName = (dateStr) => {
        // Преобразуем дату из формата "ДД.ММ.ГГГГ" в "ДД-ММ-ГГГГ"
        return dateStr.replace(/\./g, '-');
    };
    const fileName = `отчет_${formatDateForFileName(startDate)}_${formatDateForFileName(endDate)}.txt`;
    link.download = fileName;
    
    // Добавляем ссылку в DOM, кликаем и удаляем
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Освобождаем память
    URL.revokeObjectURL(url);
}

document.getElementById('reportForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!checkAuth()) return;
    
    const start = document.getElementById('reportStart').value; // YYYY-MM-DD
    const end = document.getElementById('reportEnd').value;     // YYYY-MM-DD

    if (!start || !end) {
        alert('Пожалуйста, выберите даты начала и конца периода');
        return;
    }

    try {
        const response = await fetch('/api/reports', {
            method: 'POST',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                period_start: new Date(start).toISOString(), // Преобразуем в ISO-строку
                period_end: new Date(end).toISOString()      // Преобразуем в ISO-строку
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json(); // Получим детали ошибки
            throw new Error(`HTTP ${response.status}: ${errorData.error || errorData.message}`);
        }
        
        const report = await response.json();
        const resultDiv = document.getElementById('reportResult');
        // Данные находятся на верхнем уровне согласно схеме MongoDB
        const visitCount = report.visit_count || 0;
        const totalRevenue = report.total_revenue || 0;
        const topServices = report.top_services || [];
        
        // Сохраняем отчёт в глобальную переменную для функции скачивания
        window.currentReport = report;
        
        resultDiv.innerHTML = `
            <h3>Сформированный отчёт</h3>
            <p>Период: ${new Date(report.period_start).toLocaleDateString()} - ${new Date(report.period_end).toLocaleDateString()}</p>
            <p>Количество визитов: ${visitCount}</p>
            <p>Общая выручка: ${totalRevenue.toFixed(2)} руб.</p>
            <p>Топ услуг: ${topServices.length > 0 ? topServices.join(', ') : 'Нет данных'}</p>
            <button onclick="downloadReport(window.currentReport)" style="margin-top: 10px;">
                Сохранить отчёт (.txt)
            </button>
        `;
        // Обновляем список отчётов после создания нового
        loadReports();
    } catch (error) {
        handleError(error, 'Ошибка при формировании отчёта'); // Эта функция уже выводит в консоль
    }
});

// Функция для загрузки списка отчётов
async function loadReports() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/reports', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список отчётов');
        const reports = await response.json();
        const reportsList = document.getElementById('reportsList');
        
        if (reports.length === 0) {
            reportsList.innerHTML = '<p>Отчёты не найдены</p>';
            return;
        }
        
        reportsList.innerHTML = '<ul style="list-style: none; padding: 0;">';
        reports.forEach(report => {
            const li = document.createElement('li');
            li.style.marginBottom = '15px';
            li.style.padding = '10px';
            li.style.border = '1px solid #ddd';
            li.style.borderRadius = '4px';
            li.style.backgroundColor = '#f9f9f9';
            
            const startDate = new Date(report.period_start).toLocaleDateString('ru-RU');
            const endDate = new Date(report.period_end).toLocaleDateString('ru-RU');
            const generatedDate = new Date(report.generated_at).toLocaleString('ru-RU');
            const visitCount = report.visit_count || 0;
            const totalRevenue = report.total_revenue || 0;
            const generatedBy = report.generated_by?.username || 'Неизвестно';
            
            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Период:</strong> ${startDate} - ${endDate}<br>
                        <strong>Создан:</strong> ${generatedDate}<br>
                        <strong>Создал:</strong> ${generatedBy}<br>
                        <strong>Визитов:</strong> ${visitCount} | <strong>Выручка:</strong> ${totalRevenue.toFixed(2)} руб.
                    </div>
                    <div>
                        <button onclick="viewReport('${report._id}')" style="margin-right: 5px;">
                            Просмотреть
                        </button>
                        <button onclick="deleteReport('${report._id}')">
                            Удалить
                        </button>
                    </div>
                </div>
            `;
            reportsList.querySelector('ul').appendChild(li);
        });
        reportsList.innerHTML += '</ul>';
    } catch (error) {
        handleError(error, 'Ошибка при загрузке списка отчётов');
    }
}

// Функция для просмотра отчёта
async function viewReport(reportId) {
    if (!checkAuth()) return;
    try {
        const response = await fetch(`/api/reports/${reportId}`, {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить отчёт');
        const report = await response.json();
        
        // Сохраняем отчёт для скачивания
        window.currentReport = report;
        
        const resultDiv = document.getElementById('reportResult');
        const visitCount = report.visit_count || 0;
        const totalRevenue = report.total_revenue || 0;
        const topServices = report.top_services || [];
        const generatedBy = report.generated_by?.username || 'Неизвестно';
        
        resultDiv.innerHTML = `
            <h3>Просмотр отчёта</h3>
            <p><strong>Период:</strong> ${new Date(report.period_start).toLocaleDateString('ru-RU')} - ${new Date(report.period_end).toLocaleDateString('ru-RU')}</p>
            <p><strong>Дата создания:</strong> ${new Date(report.generated_at).toLocaleString('ru-RU')}</p>
            <p><strong>Создал:</strong> ${generatedBy}</p>
            <p><strong>Количество визитов:</strong> ${visitCount}</p>
            <p><strong>Общая выручка:</strong> ${totalRevenue.toFixed(2)} руб.</p>
            <p><strong>Топ услуг:</strong> ${topServices.length > 0 ? topServices.join(', ') : 'Нет данных'}</p>
            <button onclick="downloadReport(window.currentReport)" style="margin-top: 10px;">
                Сохранить отчёт (.txt)
            </button>
        `;
        
        // Прокручиваем к результату
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        handleError(error, 'Ошибка при просмотре отчёта');
    }
}

// Функция для удаления отчёта
async function deleteReport(reportId) {
    if (!checkAuth()) return;
    if (!confirm('Вы уверены, что хотите удалить этот отчёт?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/reports/${reportId}`, {
            method: 'DELETE',
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось удалить отчёт');
        alert('Отчёт успешно удалён!');
        loadReports(); // Обновляем список
    } catch (error) {
        handleError(error, 'Ошибка при удалении отчёта');
    }
}

// --- ОСТАЛЬНЫЕ ФУНКЦИИ (ОБНОВЛЁННЫЕ) ---

// Переключение между полями для существующего и нового хозяина
function toggleOwnerFields() {
    const ownerOption = document.querySelector('input[name="ownerOption"]:checked').value;
    document.getElementById('existingOwnerField').style.display = ownerOption === 'existing' ? 'block' : 'none';
    document.getElementById('newOwnerFields').style.display = ownerOption === 'new' ? 'block' : 'none';
}

// Переключение между полями для существующей и новой болезни в мед. карточке
function toggleDiseaseFields() {
    const diseaseOption = document.querySelector('input[name="diseaseOption"]:checked').value;
    document.getElementById('existingDiseaseField').style.display = diseaseOption === 'existing' ? 'block' : 'none';
    document.getElementById('newDiseaseFields').style.display = diseaseOption === 'new' ? 'block' : 'none';
}

// --- ФУНКЦИИ ДЛЯ БОЛЕЗНЕЙ (теперь с аутентификацией) ---
async function loadDiseases() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/diseases', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список болезней');
        const diseases = await response.json();
        const diseaseList = document.getElementById('diseaseList');
        diseaseList.innerHTML = '';
        diseases.forEach(disease => {
            const li = document.createElement('li');
            li.textContent = `${disease.name} - ${disease.description || 'Нет описания'}`;
            const editButton = document.createElement('button');
            editButton.textContent = 'Редактировать';
            editButton.onclick = () => openEditDiseasePopup(disease);
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Удалить';
            deleteButton.onclick = () => deleteDisease(disease._id);
            li.appendChild(editButton);
            li.appendChild(deleteButton);
            diseaseList.appendChild(li);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке болезней');
    }
}

async function deleteDisease(id) {
    if (!checkAuth()) return;
    if (confirm('Удалить болезнь? Это может повлиять на медицинские записи!')) {
        try {
            const response = await fetch(`/api/diseases/${id}`, {
                method: 'DELETE',
                headers: addAuthHeader({})
            });
            if (!response.ok) throw new Error('Не удалось удалить болезнь');
            loadDiseases();
            alert('Болезнь успешно удалена!');
        } catch (error) {
            handleError(error, 'Ошибка при удалении болезни');
        }
    }
}

document.getElementById('diseaseForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!checkAuth()) return;
    const name = document.getElementById('diseaseNameInput').value.trim();
    const description = document.getElementById('diseaseDescription').value.trim();
    const treatment = document.getElementById('diseaseTreatment').value.trim();

    try {
        const response = await fetch('/api/diseases', {
            method: 'POST',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ name, description, treatment })
        });
        if (!response.ok) throw new Error('Не удалось добавить болезнь');
        document.getElementById('diseaseForm').reset();
        loadDiseases();
        alert('Болезнь успешно добавлена!');
    } catch (error) {
        handleError(error, 'Ошибка при добавлении болезни');
    }
});

let currentDiseaseId = null;
function openEditDiseasePopup(disease) {
    currentDiseaseId = disease._id;
    document.getElementById('editDiseaseName').value = disease.name;
    document.getElementById('editDiseaseDescription').value = disease.description || '';
    document.getElementById('editDiseaseTreatment').value = disease.treatment || '';
    document.getElementById('editDiseasePopup').style.display = 'flex';
    document.getElementById('editDiseaseForm').onsubmit = async (event) => {
        event.preventDefault();
        if (!checkAuth()) return;
        const name = document.getElementById('editDiseaseName').value.trim();
        const description = document.getElementById('editDiseaseDescription').value.trim();
        const treatment = document.getElementById('editDiseaseTreatment').value.trim();

        try {
            const response = await fetch(`/api/diseases/${currentDiseaseId}`, {
                method: 'PUT',
                headers: addAuthHeader({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name, description, treatment })
            });
            if (!response.ok) throw new Error('Не удалось обновить болезнь');
            closeEditDiseasePopup();
            loadDiseases();
            alert('Болезнь успешно обновлена!');
        } catch (error) {
            handleError(error, 'Ошибка при обновлении болезни');
        }
    };
}

function closeEditDiseasePopup() {
    document.getElementById('editDiseasePopup').style.display = 'none';
    currentDiseaseId = null;
}

// --- ФУНКЦИИ ДЛЯ ЖУРНАЛА ВИЗИТОВ (ОБНОВЛЁННЫЕ) ---

// Открытие popup для добавления визита
async function openAddVisitPopup() {
    if (!checkAuth()) return;
    try {
        // Загружаем списки для формы
        await Promise.all([
            loadAnimalsForVisitForm(),
            loadOwnersForVisitForm(),
            loadDiseasesForVisitForm(),
            loadServicesForAddVisitForm()
        ]);
        
        // Устанавливаем текущую дату и время по умолчанию
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('addVisitDate').value = now.toISOString().slice(0, 16);
        
        // Очищаем форму
        document.getElementById('addVisitNotes').value = '';
        document.getElementById('addVisitStatus').value = 'planned';
        document.getElementById('addVisitDisease').value = '';
        document.getElementById('addVisitAnimal').value = '';
        document.getElementById('addVisitOwner').value = '';
        
        document.getElementById('addVisitPopup').style.display = 'flex';
    } catch (error) {
        handleError(error, 'Ошибка при открытии формы добавления визита');
    }
}

// Закрытие popup для добавления визита
function closeAddVisitPopup() {
    document.getElementById('addVisitPopup').style.display = 'none';
    document.getElementById('addVisitForm').reset();
}

// Загрузка списка животных для формы добавления визита
async function loadAnimalsForVisitForm() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/animals', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список животных');
        const animals = await response.json();
        const select = document.getElementById('addVisitAnimal');
        select.innerHTML = '<option value="">Выберите животное</option>';
        animals.forEach(animal => {
            const option = document.createElement('option');
            option.value = animal._id;
            option.text = `${animal.name} (${animal.species})`;
            select.appendChild(option);
        });
        
    } catch (error) {
        handleError(error, 'Ошибка при загрузке животных');
    }
}

// Загрузка списка хозяев для формы добавления визита
async function loadOwnersForVisitForm() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/owners', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список хозяев');
        const owners = await response.json();
        const select = document.getElementById('addVisitOwner');
        select.innerHTML = '<option value="">Выберите хозяина</option>';
        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner._id;
            option.text = `${owner.full_name}${owner.phone ? ' (Тел: ' + owner.phone + ')' : ''}`;
            select.appendChild(option);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке хозяев');
    }
}

// Загрузка списка болезней для формы добавления визита
async function loadDiseasesForVisitForm() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/diseases', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список болезней');
        const diseases = await response.json();
        const select = document.getElementById('addVisitDisease');
        select.innerHTML = '<option value="">Не указано</option>';
        diseases.forEach(disease => {
            const option = document.createElement('option');
            option.value = disease._id;
            option.text = disease.name;
            select.appendChild(option);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке болезней');
    }
}

// Загрузка списка услуг для формы добавления визита
async function loadServicesForAddVisitForm() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/services', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список услуг');
        const services = await response.json();
        const container = document.getElementById('addVisitServices');
        if (container) {
            container.innerHTML = '';
            services.forEach(service => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = service._id;
                checkbox.dataset.price = service.price;
                // Текст слева, чекбокс справа
                label.appendChild(document.createTextNode(`${service.name} (${service.price} руб.)`));
                label.appendChild(checkbox);
                container.appendChild(label);
            });
        }
    } catch (error) {
        handleError(error, 'Ошибка при загрузке услуг для визита');
    }
}

// Обработчик формы добавления визита
document.getElementById('addVisitForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!checkAuth()) return;
    
    const date = document.getElementById('addVisitDate').value;
    const animalId = document.getElementById('addVisitAnimal').value;
    const ownerId = document.getElementById('addVisitOwner').value;
    const diseaseId = document.getElementById('addVisitDisease').value || null;
    const notes = document.getElementById('addVisitNotes').value.trim();
    const status = document.getElementById('addVisitStatus').value;
    const serviceSelect = document.getElementById('addVisitServices');
    const serviceIds = Array.from(document.querySelectorAll('#addVisitServices input[type="checkbox"]:checked')).map(cb => cb.value);
    
    if (!animalId || !ownerId) {
        alert('Пожалуйста, выберите животное и хозяина');
        return;
    }
    
    try {
        const response = await fetch('/api/visits', {
            method: 'POST',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                animal_id: animalId,
                owner_id: ownerId,
                date: new Date(date),
                disease_id: diseaseId,
                notes: notes || null,
                status: status,
                service_ids: serviceIds.length > 0 ? serviceIds : null
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Не удалось добавить визит');
        }
        
        alert('Визит успешно добавлен!');
        closeAddVisitPopup();
        loadVisits(); // Обновляем список визитов
    } catch (error) {
        handleError(error, 'Ошибка при добавлении визита');
    }
});

// Загрузка списка услуг для формы редактирования визита
async function loadServicesForVisitForm() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/services', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список услуг');
        const services = await response.json();
        const container = document.getElementById('serviceIds');
        if (container) {
            container.innerHTML = '';
            services.forEach(service => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = service._id;
                checkbox.dataset.price = service.price;
                // Текст слева, чекбокс справа
                label.appendChild(document.createTextNode(`${service.name} (${service.price} руб.)`));
                label.appendChild(checkbox);
                container.appendChild(label);
            });
        }
    } catch (error) {
        handleError(error, 'Ошибка при загрузке услуг для визита');
    }
}

let currentVisitId = null;
async function editVisit(id) {
    if (!checkAuth()) return;
    try {
        const response = await fetch(`/api/visits/${id}`, {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить данные визита');
        const visit = await response.json();

        document.getElementById('editVisitDate').value = new Date(visit.date).toISOString().slice(0, 16);
        document.getElementById('editVisitNotes').value = visit.notes || '';
        document.getElementById('editVisitStatus').value = visit.status;

        // Загрузка и установка выбранных услуг (чекбоксы)
        await loadServicesForVisitForm();
        if (visit.service_ids && visit.service_ids.length > 0) {
            visit.service_ids.forEach(service => {
                const checkbox = document.querySelector(`#serviceIds input[type="checkbox"][value="${service._id}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }

        currentVisitId = id;
        document.getElementById('editVisitPopup').style.display = 'flex';
    } catch (error) {
        handleError(error, 'Ошибка при загрузке данных визита');
    }
}

document.getElementById('editVisitForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!checkAuth()) return;
    const date = document.getElementById('editVisitDate').value;
    const notes = document.getElementById('editVisitNotes').value.trim();
    const status = document.getElementById('editVisitStatus').value;
    let service_ids = Array.from(document.querySelectorAll('#serviceIds input[type="checkbox"]:checked')).map(cb => cb.value);

    try {
        const response = await fetch(`/api/visits/${currentVisitId}`, {
            method: 'PUT',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ date: new Date(date), notes, status, service_ids })
        });
        if (!response.ok) throw new Error('Не удалось обновить визит');
        closeEditVisitPopup();
        loadVisits();
        alert('Визит успешно обновлён!');
    } catch (error) {
        handleError(error, 'Ошибка при обновлении визита');
    }
});

function closeEditVisitPopup() {
    document.getElementById('editVisitPopup').style.display = 'none';
    currentVisitId = null;
}

async function deleteVisit(id) {
    if (!checkAuth()) return;
    if (confirm('Удалить визит?')) {
        try {
            const response = await fetch(`/api/visits/${id}`, {
                method: 'DELETE',
                headers: addAuthHeader({})
            });
            if (!response.ok) throw new Error('Не удалось удалить визит');
            loadVisits();
            alert('Визит успешно удалён!');
        } catch (error) {
            handleError(error, 'Ошибка при удалении визита');
        }
    }
}

async function loadVisits() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/visits', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список визитов');
        const visits = await response.json();
        const tbody = document.querySelector('#visitList tbody');
        tbody.innerHTML = '';
        visits.forEach(visit => {
            const serviceNames = visit.service_ids && visit.service_ids.length > 0
                ? visit.service_ids.map(s => s.name).join(', ')
                : 'Не указаны';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(visit.date).toLocaleString()}</td>
                <td>${visit.animal_id?.name || 'Неизвестно'}</td>
                <td>${visit.owner_id?.full_name || 'Неизвестно'}</td>
                <td>${visit.disease_id?.name || 'Не указано'}</td>
                <td>${serviceNames}</td>
                <td>${visit.total_cost?.toFixed(2) || '0.00'} руб.</td>
                <td>${visit.notes || 'Нет заметок'}</td>
                <td>${visit.status}</td>
                <td>
                    <button onclick="editVisit('${visit._id}')">Редактировать</button>
                    <button onclick="deleteVisit('${visit._id}')">Удалить</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке визитов');
    }
}

// --- ОСТАЛЬНЫЕ ФУНКЦИИ (также добавлена аутентификация) ---
async function loadOwners() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/owners', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список хозяев');
        const owners = await response.json();
        const select = document.getElementById('ownerId');
        select.innerHTML = '<option value="">Без хозяина</option>';
        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner._id;
            option.text = `${owner.full_name} (Тел: ${owner.phone || 'не указан'})`;
            select.appendChild(option);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке хозяев');
    }
}

async function loadOwnersList() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/owners', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список хозяев');
        const owners = await response.json();
        const list = document.getElementById('ownerList');
        list.innerHTML = '';
        owners.forEach(owner => {
            const li = document.createElement('li');
            li.innerHTML = `${owner.full_name} (Тел: ${owner.phone || 'не указан'}, Адрес: ${owner.address || 'не указан'}, Email: ${owner.email || 'не указан'}) 
                <button onclick="deleteOwner('${owner._id}')">Удалить</button>`;
            list.appendChild(li);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке списка хозяев');
    }
}

async function deleteOwner(id) {
    if (!checkAuth()) return;
    if (confirm('Удалить хозяина? Это может повлиять на связанные записи!')) {
        try {
            const response = await fetch(`/api/owners/${id}`, {
                method: 'DELETE',
                headers: addAuthHeader({})
            });
            if (!response.ok) throw new Error('Не удалось удалить хозяина');
            await loadOwnersList();
            await loadOwners();
            await loadAnimals();
            alert('Хозяин успешно удалён!');
        } catch (error) {
            handleError(error, 'Ошибка при удалении хозяина');
        }
    }
}

document.getElementById('animalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;

    const name = document.getElementById('name').value.trim();
    const species = document.getElementById('species').value.trim();
    const breed = document.getElementById('breed').value.trim() || null;
    const ageInput = document.getElementById('age').value;
    const ownerOption = document.querySelector('input[name="ownerOption"]:checked').value;

    if (!name || !species) {
        alert('Пожалуйста, заполните обязательные поля: Имя и Вид');
        return;
    }

    const age = ageInput ? parseInt(ageInput) : null;
    if (age !== null && (isNaN(age) || age < 0)) {
        alert('Возраст должен быть положительным числом');
        return;
    }

    const animalData = { name, species, breed, age };

    if (ownerOption === 'existing') {
        const ownerId = document.getElementById('ownerId').value || null;
        animalData.owner_id = ownerId;
    } else {
        const newOwnerName = document.getElementById('newOwnerName').value.trim();
        const newOwnerPhone = document.getElementById('newOwnerPhone').value.trim() || null;
        const newOwnerAddress = document.getElementById('newOwnerAddress').value.trim() || null;
        const newOwnerEmail = document.getElementById('newOwnerEmail').value.trim() || null;

        if (!newOwnerName) {
            alert('Пожалуйста, укажите имя нового хозяина');
            return;
        }
        if (newOwnerEmail && !/.+\@.+\..+/.test(newOwnerEmail)) {
            alert('Пожалуйста, укажите корректный email');
            return;
        }

        animalData.new_owner = {
            full_name: newOwnerName,
            phone: newOwnerPhone,
            address: newOwnerAddress,
            email: newOwnerEmail
        };
    }

    try {
        const response = await fetch('/api/animals', {
            method: 'POST',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(animalData)
        });
        if (!response.ok) throw new Error('Не удалось добавить животное');
        await loadAnimals();
        await loadOwners();
        e.target.reset();
        toggleOwnerFields();
        alert('Животное успешно добавлено!');
    } catch (error) {
        handleError(error, 'Ошибка при добавлении животного');
    }
});

async function loadAnimals() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/animals', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список животных');
        const animals = await response.json();
        const list = document.getElementById('animalList');
        list.innerHTML = '';
        animals.forEach(a => {
            const ownerInfo = a.owner_id ? `${a.owner_id.full_name} (Тел: ${a.owner_id.phone || 'не указан'})` : 'Хозяин не указан';
            const li = document.createElement('li');
            li.innerHTML = `${a.name} (${a.species}) - Порода: ${a.breed || 'не указана'}, Возраст: ${a.age || 'не указан'} | Хозяин: ${ownerInfo} 
                <button onclick="editAnimal('${a._id}')">Редактировать</button>
                <button onclick="openMedicalCard('${a._id}')">Открыть мед. карточку</button>
                <button onclick="deleteAnimal('${a._id}')">Удалить</button>`;
            list.appendChild(li);
        });
        document.getElementById('searchSpecies').value = '';
    } catch (error) {
        handleError(error, 'Ошибка при загрузке животных');
    }
}

async function searchAnimals() {
    if (!checkAuth()) return;
    const species = document.getElementById('searchSpecies').value.trim();
    try {
        const response = await fetch(`/api/animals/search?species=${species}`, {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось выполнить поиск');
        const animals = await response.json();
        const list = document.getElementById('animalList');
        list.innerHTML = '';
        animals.forEach(a => {
            const ownerInfo = a.owner_id ? `${a.owner_id.full_name} (Тел: ${a.owner_id.phone || 'не указан'})` : 'Хозяин не указан';
            const li = document.createElement('li');
            li.innerHTML = `${a.name} (${a.species}) - Порода: ${a.breed || 'не указана'}, Возраст: ${a.age || 'не указан'} | Хозяин: ${ownerInfo}
                <button onclick="editAnimal('${a._id}')">Редактировать</button>
                <button onclick="openMedicalCard('${a._id}')">Открыть мед. карточку</button>
                <button onclick="deleteAnimal('${a._id}')">Удалить</button>`;
            list.appendChild(li);
        });
    } catch (error) {
        handleError(error, 'Ошибка при поиске животных');
    }
}

let currentAnimalId = null;
let currentOwnerId = null;
async function editAnimal(id) {
    if (!checkAuth()) return;
    try {
        const response = await fetch(`/api/animals/${id}`, {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить данные животного');
        const animal = await response.json();

        document.getElementById('editName').value = animal.name;
        document.getElementById('editSpecies').value = animal.species;
        document.getElementById('editBreed').value = animal.breed || '';
        document.getElementById('editAge').value = animal.age || '';

        if (animal.owner_id) {
            document.getElementById('editOwnerName').value = animal.owner_id.full_name || '';
            document.getElementById('editOwnerPhone').value = animal.owner_id.phone || '';
            document.getElementById('editOwnerAddress').value = animal.owner_id.address || '';
            document.getElementById('editOwnerEmail').value = animal.owner_id.email || '';
            currentOwnerId = animal.owner_id._id;
        } else {
            document.getElementById('editOwnerName').value = '';
            document.getElementById('editOwnerPhone').value = '';
            document.getElementById('editOwnerAddress').value = '';
            document.getElementById('editOwnerEmail').value = '';
            currentOwnerId = null;
        }

        currentAnimalId = id;
        document.getElementById('editPopup').style.display = 'flex';
    } catch (error) {
        handleError(error, 'Ошибка при загрузке данных для редактирования');
    }
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;

    const updatedAnimal = {
        name: document.getElementById('editName').value.trim(),
        species: document.getElementById('editSpecies').value.trim(),
        breed: document.getElementById('editBreed').value.trim() || null,
        age: parseInt(document.getElementById('editAge').value) || null
    };

    const ownerData = {
        full_name: document.getElementById('editOwnerName').value.trim() || null,
        phone: document.getElementById('editOwnerPhone').value.trim() || null,
        address: document.getElementById('editOwnerAddress').value.trim() || null,
        email: document.getElementById('editOwnerEmail').value.trim() || null
    };

    if (ownerData.full_name && ownerData.email && !/.+\@.+\..+/.test(ownerData.email)) {
        alert('Пожалуйста, укажите корректный email');
        return;
    }

    if (ownerData.full_name) {
        updatedAnimal.owner_data = ownerData;
        updatedAnimal.owner_id = currentOwnerId;
    } else {
        updatedAnimal.owner_id = null;
    }

    try {
        const response = await fetch(`/api/animals/${currentAnimalId}`, {
            method: 'PUT',
            headers: addAuthHeader({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(updatedAnimal)
        });
        if (!response.ok) throw new Error('Не удалось сохранить изменения');
        closePopup();
        await loadAnimals();
        await loadOwnersList();
        await loadOwners();
        alert('Изменения успешно сохранены!');
    } catch (error) {
        handleError(error, 'Ошибка при сохранении изменений');
    }
});

function closePopup() {
    document.getElementById('editPopup').style.display = 'none';
    currentAnimalId = null;
    currentOwnerId = null;
}

async function loadDiseasesForMedicalCard() {
    if (!checkAuth()) return;
    try {
        const response = await fetch('/api/diseases', {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить список болезней');
        const diseases = await response.json();
        const select = document.getElementById('diseaseId');
        select.innerHTML = '<option value="">Выберите болезнь</option>';
        diseases.forEach(disease => {
            const option = document.createElement('option');
            option.value = disease._id;
            option.text = disease.name;
            select.appendChild(option);
        });
    } catch (error) {
        handleError(error, 'Ошибка при загрузке болезней для медицинской карточки');
    }
}

async function openMedicalCard(id) {
    if (!checkAuth()) return;
    try {
        const response = await fetch(`/api/animals/${id}`, {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить данные животного');
        const animal = await response.json();

        currentAnimalId = id;
        currentDiseaseId = null;

        document.getElementById('medicalPopupTitle').textContent = 'Медицинская карточка';
        document.getElementById('medicalFormTitle').textContent = 'Добавить запись';
        document.getElementById('medicalFormSubmit').textContent = 'Добавить запись';
        document.getElementById('medicalForm').reset();
        document.querySelector('input[name="diseaseOption"][value="existing"]').checked = true;
        toggleDiseaseFields();

        await loadDiseasesForMedicalCard();

        const historyList = document.getElementById('medicalHistoryList');
        historyList.innerHTML = '';
        if (animal.medical_history && animal.medical_history.length > 0) {
            animal.medical_history.forEach((record, index) => {
                const li = document.createElement('li');
                const diseaseInfo = record.disease_id 
                    ? `Болезнь: ${record.disease_id.name} | Симптомы: ${record.disease_id.description || 'не указаны'} | Лечение: ${record.disease_id.treatment || 'не указано'}`
                    : 'Неизвестная болезнь';
                li.innerHTML = `${diseaseInfo} 
                    <button onclick="editDisease('${record.disease_id._id}', ${index})">Редактировать</button>
                    <button onclick="deleteMedicalRecord('${id}', '${record._id}')">Удалить</button>`;
                historyList.appendChild(li);
            });
        } else {
            historyList.innerHTML = '<li>Записи отсутствуют</li>';
        }

        document.getElementById('medicalPopup').style.display = 'flex';
    } catch (error) {
        handleError(error, 'Ошибка при открытии медицинской карточки');
    }
}

async function editDisease(diseaseId, recordIndex) {
    if (!checkAuth()) return;
    try {
        const response = await fetch(`/api/animals/${currentAnimalId}`, {
            headers: addAuthHeader({})
        });
        if (!response.ok) throw new Error('Не удалось загрузить данные животного');
        const animal = await response.json();

        const record = animal.medical_history[recordIndex];
        if (!record || !record.disease_id) throw new Error('Запись не найдена');

        document.getElementById('diseaseName').value = record.disease_id.name;
        document.getElementById('symptoms').value = record.disease_id.description || '';
        document.getElementById('treatment').value = record.disease_id.treatment || '';

        currentDiseaseId = diseaseId;
        document.getElementById('medicalFormTitle').textContent = 'Редактировать болезнь';
        document.getElementById('medicalFormSubmit').textContent = 'Сохранить изменения';
        document.querySelector('input[name="diseaseOption"][value="new"]').checked = true;
        toggleDiseaseFields();
    } catch (error) {
        handleError(error, 'Ошибка при загрузке данных болезни');
    }
}

async function deleteMedicalRecord(animalId, recordId) {
    if (!checkAuth()) return;
    if (confirm('Удалить запись из медицинской карточки?')) {
        try {
            const response = await fetch(`/api/animals/${animalId}/medical-history/${recordId}`, {
                method: 'DELETE',
                headers: addAuthHeader({})
            });
            if (!response.ok) throw new Error('Не удалось удалить запись');
            await openMedicalCard(animalId);
            await loadVisits(); // Обновляем визиты
            alert('Запись успешно удалена!');
        } catch (error) {
            handleError(error, 'Ошибка при удалении записи');
        }
    }
}

function closeMedicalPopup() {
    document.getElementById('medicalPopup').style.display = 'none';
    currentAnimalId = null;
    currentDiseaseId = null;
}

document.getElementById('medicalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;

    const diseaseOption = document.querySelector('input[name="diseaseOption"]:checked').value;

    try {
        if (currentDiseaseId) {
            const diseaseData = {
                name: document.getElementById('diseaseName').value.trim(),
                description: document.getElementById('symptoms').value.trim() || null,
                treatment: document.getElementById('treatment').value.trim() || null
            };
            const response = await fetch(`/api/diseases/${currentDiseaseId}`, {
                method: 'PUT',
                headers: addAuthHeader({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(diseaseData)
            });
            if (!response.ok) throw new Error('Не удалось обновить болезнь');
            alert('Болезнь успешно обновлена!');
        } else if (diseaseOption === 'existing') {
            const diseaseId = document.getElementById('diseaseId').value;
            if (!diseaseId) {
                alert('Пожалуйста, выберите болезнь');
                return;
            }
            const response = await fetch(`/api/animals/${currentAnimalId}/medical-history`, {
                method: 'POST',
                headers: addAuthHeader({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ disease_id: diseaseId })
            });
            if (!response.ok) throw new Error('Не удалось добавить запись');
            alert('Запись успешно добавлена!');
        } else {
            const diseaseData = {
                disease_name: document.getElementById('diseaseName').value.trim(),
                symptoms: document.getElementById('symptoms').value.trim() || null,
                treatment: document.getElementById('treatment').value.trim() || null
            };
            if (!diseaseData.disease_name) {
                alert('Пожалуйста, укажите название болезни');
                return;
            }
            const response = await fetch(`/api/animals/${currentAnimalId}/medical-history`, {
                method: 'POST',
                headers: addAuthHeader({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(diseaseData)
            });
            if (!response.ok) throw new Error('Не удалось добавить запись');
            alert('Запись успешно добавлена!');
        }

        await openMedicalCard(currentAnimalId);
        await loadVisits(); // Обновляем визиты
    } catch (error) {
        handleError(error, currentDiseaseId ? 'Ошибка при обновлении болезни' : 'Ошибка при добавлении записи в медицинскую карточку');
    }
});

async function deleteAnimal(id) {
    if (!checkAuth()) return;
    if (confirm('Удалить животное?')) {
        try {
            const response = await fetch(`/api/animals/${id}`, {
                method: 'DELETE',
                headers: addAuthHeader({})
            });
            if (!response.ok) throw new Error('Не удалось удалить животное');
            await loadAnimals();
            alert('Животное успешно удалено!');
        } catch (error) {
            handleError(error, 'Ошибка при удалении животного');
        }
    }
}

// Функция для выхода из системы
async function logout() {
    try {
        // Отправляем запрос на сервер (опционально, для логирования)
        const response = await fetch('/logout', { 
            method: 'GET',
            headers: addAuthHeader({})
        });
        // Игнорируем ошибки, так как главное - очистить токены на клиенте
    } catch (error) {
        console.error('Ошибка при выходе:', error);
    } finally {
        // Очищаем токены из localStorage
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        
        // Перенаправляем на страницу входа
        window.location.href = '/login';
    }
}

// Загрузка при старте
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return; // Проверяем аутентификацию при загрузке
    loadAnimals();
    loadOwners();
    loadOwnersList();
    loadDiseases();
    loadVisits();
    loadServices(); // Загружаем услуги
    loadReports(); // Загружаем список отчётов

    document.querySelectorAll('input[name="ownerOption"]').forEach(radio => {
        radio.addEventListener('change', toggleOwnerFields);
    });
    document.querySelectorAll('input[name="diseaseOption"]').forEach(radio => {
        radio.addEventListener('change', toggleDiseaseFields);
    });
    
    // Обработчик изменения животного в форме добавления визита - автоматически заполняем хозяина
    const addVisitAnimalSelect = document.getElementById('addVisitAnimal');
    if (addVisitAnimalSelect) {
        addVisitAnimalSelect.addEventListener('change', async function() {
            const animalId = this.value;
            if (animalId) {
                try {
                    const response = await fetch(`/api/animals/${animalId}`, {
                        headers: addAuthHeader({})
                    });
                    if (response.ok) {
                        const animal = await response.json();
                        if (animal.owner_id) {
                            document.getElementById('addVisitOwner').value = animal.owner_id._id;
                        }
                    }
                } catch (error) {
                    console.error('Ошибка при загрузке животного:', error);
                }
            }
        });
    }
});