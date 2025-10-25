document.addEventListener('DOMContentLoaded', () => {
    // PWA: Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(() => console.log('Service Worker registrado'))
            .catch((err) => console.error('Error registrando Service Worker:', err));
    }

    let deferredPrompt;
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.hidden = false;
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            installBtn.disabled = true;
            try {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                console.log('Instalación:', choice.outcome);
                deferredPrompt = null;
                installBtn.hidden = true;
            } finally {
                installBtn.disabled = false;
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        console.log('App instalada');
        if (installBtn) installBtn.hidden = true;
    });
    // Current Rate Display
    const bcvRateDisplay = document.getElementById('bcv-rate-display');

    // --- INPUTS ---
    const baseImponibleInput = document.getElementById('baseImponible');
    const invoiceDateInput = document.getElementById('invoiceDate');
    const ivaRetentionRadios = document.querySelectorAll('input[name="ivaRetention"]');
    const taxableBaseInput = document.getElementById('taxableBase');
    const islrRetentionRadios = document.querySelectorAll('input[name="islrRetention"]');
    const calculateBtn = document.getElementById('calculateBtn');

    // --- RESULTS ---
    const totalAmountBsSpan = document.getElementById('totalAmountBs');
    const invoiceRateSpan = document.getElementById('invoiceRate');
    const amountInUsdSpan = document.getElementById('amountInUsd');
    const ivaAmountSpan = document.getElementById('ivaAmount');
    const ivaRetentionSpan = document.getElementById('ivaRetention');
    const islrRetentionSpan = document.getElementById('islrRetention');
    const totalRetainedAmountSpan = document.getElementById('totalRetainedAmount');
    const finalAmountBsSpan = document.getElementById('finalAmountBs');
    const adjustedFinalAmountBsSpan = document.getElementById('adjustedFinalAmountBs');

    let currentBcvRate = 0;

    // Set default invoice date to today
    invoiceDateInput.valueAsDate = new Date();

    // Function to get BCV rate. Searches for the last available rate if the given date has none.
    async function getBcvRate(startDate) {
        const maxTries = 7; // Look back up to 7 days
        let currentDate = new Date(startDate + 'T12:00:00.000Z'); // Use noon to avoid timezone issues

        for (let i = 0; i < maxTries; i++) {
            const dateString = currentDate.toISOString().split('T')[0];
            const url = `https://api.dolarvzla.com/public/exchange-rate/list?from=${dateString}&to=${dateString}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    // If API fails, try next day
                    console.warn(`API error for date ${dateString}: ${response.status}`);
                    currentDate.setDate(currentDate.getDate() - 1);
                    continue;
                }
                const data = await response.json();

                if (data.rates && data.rates.length > 0 && data.rates[0].usd) {
                    return {
                        rate: parseFloat(data.rates[0].usd),
                        date: dateString
                    }; // Success
                }

                // If no rate for this day, go to the previous day
                currentDate.setDate(currentDate.getDate() - 1);

            } catch (error) {
                console.error(`Error fetching rate for ${dateString}:`, error);
                // On network error, try previous day
                currentDate.setDate(currentDate.getDate() - 1);
            }
        }

        bcvRateDisplay.textContent = 'Error al obtener la tasa BCV. No se encontró tasa en los últimos 7 días.';
        return null; // Failed to find a rate
    }

    // Function to get and update the current day's effective rate display
    async function updateCurrentRateDisplay() {
        bcvRateDisplay.textContent = 'Obteniendo tasa BCV actual...';
        // Aproximación de hora local Caracas (UTC-4, sin DST)
        const utcNow = new Date();
        const caracasNow = new Date(utcNow.getTime() - 4 * 60 * 60 * 1000);
        const todayIso = caracasNow.toISOString().split('T')[0];
        const caracasHour = caracasNow.getUTCHours(); // horas en Caracas

        // Si es fin de semana/feriado, usar día hábil anterior.
        // Si es día hábil antes de las 16:00, aún rige la tasa del día hábil anterior.
        let effectiveIso;
        const todayDate = new Date(todayIso + 'T12:00:00.000Z');
        if (isWeekend(todayDate) || isBankHolidayISO(todayIso) || caracasHour < 16) {
            effectiveIso = previousBusinessDayFromIso(todayIso);
        } else {
            effectiveIso = todayIso;
        }

        const url = `https://api.dolarvzla.com/public/exchange-rate/list?from=${effectiveIso}&to=${effectiveIso}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.rates && data.rates.length > 0 && data.rates[0].usd) {
                currentBcvRate = parseFloat(data.rates[0].usd);
                bcvRateDisplay.innerHTML = `Tasa BCV (vigente): <strong>${currentBcvRate.toFixed(2)} Bs./USD</strong> <small>(publicada: ${effectiveIso})</small>`;
            } else {
                throw new Error('Formato de API inesperado para tasa efectiva.');
            }
        } catch (error) {
            console.error('Error al obtener la tasa BCV efectiva:', error);
            bcvRateDisplay.textContent = 'Error al obtener la tasa BCV efectiva.';
        }
    }

    // Initial fetch of current BCV rate
    updateCurrentRateDisplay();

    calculateBtn.addEventListener('click', async () => {
        const baseImponible = parseFloat(baseImponibleInput.value);
        const invoiceDate = invoiceDateInput.value;
        const taxableBase = parseFloat(taxableBaseInput.value);

        if (isNaN(baseImponible) || baseImponible <= 0) {
            alert('Por favor, ingrese una Base Imponible válida.');
            return;
        }
        if (!invoiceDate) {
            alert('Por favor, seleccione una fecha de factura.');
            return;
        }

        // Fetch historical rate (or closest previous)
        const invoiceRateData = await getBcvRate(invoiceDate);
        if (!invoiceRateData) {
            alert('No se pudo obtener la tasa para la fecha de la factura o días anteriores.');
            return;
        }

        const invoiceRate = invoiceRateData.rate;
        const invoiceRateDate = invoiceRateData.date;

        // --- Radio button values ---
        let ivaRetentionPercentage = parseFloat(document.querySelector('input[name="ivaRetention"]:checked').value);
        let islrRate = parseFloat(document.querySelector('input[name="islrRetention"]:checked').value);

        // --- Calculations ---
        const montoIVA = baseImponible * 0.16;
        const totalFactura = baseImponible + montoIVA;

        const amountInUsd = totalFactura / invoiceRate;

        const ivaRetenido = montoIVA * (ivaRetentionPercentage / 100);

        let islrRetenido = 0;
        if (islrRate > 0 && !isNaN(taxableBase) && taxableBase > 0) {
            islrRetenido = taxableBase * islrRate;
        }

        const montoTotalRetenido = ivaRetenido + islrRetenido;
        const finalAmountBs = totalFactura - montoTotalRetenido;

        // Adjusted amount based on current rate
        const adjustedFinalAmountBs = amountInUsd * currentBcvRate - montoTotalRetenido;

        // --- Display results ---
        totalAmountBsSpan.textContent = totalFactura.toFixed(2);
        invoiceRateSpan.textContent = `${invoiceRate.toFixed(2)} Bs./USD`;
        document.getElementById('invoiceRateDate').textContent = invoiceRateDate;
        amountInUsdSpan.textContent = amountInUsd.toFixed(2);
        ivaAmountSpan.textContent = montoIVA.toFixed(2);
        ivaRetentionSpan.textContent = ivaRetenido.toFixed(2);
        islrRetentionSpan.textContent = islrRetenido.toFixed(2);
        totalRetainedAmountSpan.textContent = montoTotalRetenido.toFixed(2);
        finalAmountBsSpan.textContent = finalAmountBs.toFixed(2);
        adjustedFinalAmountBsSpan.textContent = adjustedFinalAmountBs.toFixed(2);
    });
});

    // Function to compute previous business day (weekends + optional bank holidays)
    function isWeekend(date) {
        const d = date.getUTCDay(); // 0: Sun, 6: Sat
        return d === 0 || d === 6;
    }

    function isBankHolidayISO(isoDate) {
        // Placeholder list that you can extend with feriados bancarios (YYYY-MM-DD)
        const holidays = new Set([
            // Ejemplos: '2025-01-01', '2025-07-05'
        ]);
        return holidays.has(isoDate);
    }

    function previousBusinessDayFromIso(isoDate) {
        // Start from noon UTC to avoid timezone edge cases
        let d = new Date(isoDate + 'T12:00:00.000Z');
        // Move one day back first, because la tasa aplicada en un día hábil
        // corresponde a la publicada el día hábil anterior
        d.setUTCDate(d.getUTCDate() - 1);
        // Skip weekends and holidays
        while (true) {
            const checkIso = d.toISOString().split('T')[0];
            if (!isWeekend(d) && !isBankHolidayISO(checkIso)) {
                return checkIso;
            }
            d.setUTCDate(d.getUTCDate() - 1);
        }
    }

    // Function to get BCV rate using effective published date
    async function getBcvRate(startDateIso) {
        const maxTries = 7; // Look back up to 7 days
        let effectiveIso = previousBusinessDayFromIso(startDateIso);
        let currentDate = new Date(effectiveIso + 'T12:00:00.000Z');

        for (let i = 0; i < maxTries; i++) {
            const dateString = currentDate.toISOString().split('T')[0];
            const url = `https://api.dolarvzla.com/public/exchange-rate/list?from=${dateString}&to=${dateString}`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.warn(`API error for date ${dateString}: ${response.status}`);
                    currentDate.setUTCDate(currentDate.getUTCDate() - 1);
                    continue;
                }
                const data = await response.json();
                if (data.rates && data.rates.length > 0 && data.rates[0].usd) {
                    return { rate: parseFloat(data.rates[0].usd), date: dateString };
                }
                currentDate.setUTCDate(currentDate.getUTCDate() - 1);
            } catch (error) {
                console.error(`Error fetching rate for ${dateString}:`, error);
                currentDate.setUTCDate(currentDate.getUTCDate() - 1);
            }
        }
        bcvRateDisplay.textContent = 'Error al obtener la tasa BCV. No se encontró tasa en los últimos 7 días.';
        return null;
    }