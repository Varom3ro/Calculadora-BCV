document.addEventListener('DOMContentLoaded', () => {
    // PWA: Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(() => console.log('Service Worker registrado'))
            .catch((err) => console.error('Error registrando Service Worker:', err));
    }

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

    // Function to get and update the current day's rate display
    async function updateCurrentRateDisplay() {
        bcvRateDisplay.textContent = 'Obteniendo tasa BCV actual...';
        const url = 'https://api.dolarvzla.com/public/exchange-rate';
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.current && data.current.usd) {
                currentBcvRate = parseFloat(data.current.usd);
                bcvRateDisplay.innerHTML = `Tasa BCV (Hoy): <strong>${currentBcvRate.toFixed(2)} Bs./USD</strong>`;
            } else {
                throw new Error('Formato de API inesperado para tasa actual.');
            }
        } catch (error) {
            console.error('Error al obtener la tasa BCV actual:', error);
            bcvRateDisplay.textContent = 'Error al obtener la tasa BCV actual.';
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