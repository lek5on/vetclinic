// Helper to get auth token
function getAuthToken() {
    return localStorage.getItem('authToken');
}

document.addEventListener('DOMContentLoaded', () => {
    const token = getAuthToken();
    const authPrompt = document.getElementById('authPrompt');
    const form = document.getElementById('appointmentForm');
    if (!token) {
        if (authPrompt) authPrompt.style.display = 'block';
        if (form) form.style.display = 'none';
    } else {
        if (authPrompt) authPrompt.style.display = 'none';
        if (form) form.style.display = '';
    }
});

document.getElementById('appointmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = getAuthToken();
    if (!token) {
        // If user isn't authenticated, redirect to login
        window.location.href = '/login.html';
        return;
    }

  // Собираем данные из формы
  const animalData = {
      name: document.getElementById('animalName').value,
      species: document.getElementById('species').value,
      breed: document.getElementById('breed').value || null,
      age: parseInt(document.getElementById('age').value) || null
  };

  const ownerData = {
      full_name: document.getElementById('ownerName').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('ownerAddress').value || null,
      email: document.getElementById('ownerEmail').value || null
  };

  const visitData = {
      date: new Date(document.getElementById('appointmentDate').value),
      notes: "Новая запись от клиента",
      status: "planned"
  };

  try {
      // 1. Проверяем, существует ли владелец по телефону
            const ownersResponse = await fetch(`/api/owners?phone=${encodeURIComponent(ownerData.phone)}`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
      let owner;
      const owners = await ownersResponse.json();
      if (owners.length > 0) {
          owner = owners[0];
      } else {
          const ownerResponse = await fetch('/api/owners', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify(ownerData)
          });
          if (!ownerResponse.ok) throw new Error('Ошибка при создании владельца');
          owner = await ownerResponse.json();
      }

      // 2. Добавляем животное с привязкой к владельцу
      animalData.owner_id = owner._id;
      const animalResponse = await fetch('/api/animals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(animalData)
      });
      if (!animalResponse.ok) throw new Error('Ошибка при создании животного');
      const animal = await animalResponse.json();

      // 3. Создаём запись на приём
      visitData.animal_id = animal._id;
      visitData.owner_id = owner._id;
      const visitResponse = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(visitData)
      });
      if (!visitResponse.ok) throw new Error('Ошибка при создании визита');
      const visit = await visitResponse.json();

      // Показываем подтверждение
      const confirmation = document.getElementById('confirmation');
      confirmation.style.display = 'block';
      confirmation.innerHTML = `Запись успешно создана!<br>Животное: ${animal.name}<br>Дата: ${new Date(visit.date).toLocaleString()}<br>Статус: ${visit.status}`;
      e.target.reset();
  } catch (error) {
      console.error('Ошибка:', error);
      const confirmation = document.getElementById('confirmation');
      confirmation.style.display = 'block';
      confirmation.style.color = 'red';
      confirmation.textContent = 'Произошла ошибка при записи. Попробуйте снова.';
  }
});