/* ==========================================================================
   Expense Tracker - Main Application Logic
   ========================================================================== */

// --- Global State ---
let expenses = [];
let chartInstance = null;

// Category colors for Chart.js rendering
const categoryColors = {
    'Food': '#f87171',
    'Transport': '#60a5fa',
    'Shopping': '#fbbf24',
    'Bills': '#34d399',
    'Entertainment': '#a78bfa',
    'Education': '#f472b6',
    'Health': '#38bdf8',
    'Other': '#9ca3af'
};

// --- DOM Elements ---
const expenseForm = document.getElementById('expense-form');
const titleInput = document.getElementById('title');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const dateInput = document.getElementById('date');

const totalExpensesEl = document.getElementById('total-expenses');
const totalTransactionsEl = document.getElementById('total-transactions');
const avgExpenseEl = document.getElementById('avg-expense');

const expenseListContainer = document.getElementById('expense-list');
const emptyStateEl = document.getElementById('empty-state');
const filterCategorySelect = document.getElementById('filter-category');

const chartCanvas = document.getElementById('expense-chart');
const chartEmptyStateEl = document.getElementById('chart-empty-state');

// Set default date input value to current date on initialization
document.addEventListener('DOMContentLoaded', () => {
    dateInput.value = new Date().toISOString().split('T')[0];
    loadExpenses();
    renderApp();
});

// --- LocalStorage Management ---
function saveExpenses() {
    localStorage.setItem('expenses_data', JSON.stringify(expenses));
}

function loadExpenses() {
    const savedData = localStorage.getItem('expenses_data');
    if (savedData) {
        try {
            expenses = JSON.parse(savedData);
        } catch (e) {
            console.error('Failed to parse saved expenses:', e);
            expenses = [];
        }
    } else {
        expenses = [];
    }
}

// --- Validation Functions ---
function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function validateForm() {
    clearErrors();
    let isValid = true;

    const titleValue = titleInput.value.trim();
    const amountValue = parseFloat(amountInput.value);
    const categoryValue = categoryInput.value;
    const dateValue = dateInput.value;

    if (!titleValue) {
        showError('title', 'Please enter an expense title.');
        isValid = false;
    }

    if (isNaN(amountValue) || amountValue <= 0) {
        showError('amount', 'Please enter a valid amount greater than ₹0.');
        isValid = false;
    }

    if (!categoryValue) {
        showError('category', 'Please select a category.');
        isValid = false;
    }

    if (!dateValue) {
        showError('date', 'Please select a date.');
        isValid = false;
    }

    return isValid;
}

function showError(fieldId, message) {
    const inputEl = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}-error`);
    if (inputEl) inputEl.classList.add('input-error');
    if (errorEl) errorEl.textContent = message;
}

// --- CRUD Operations ---
function addExpense(e) {
    e.preventDefault();

    if (!validateForm()) return;

    const newExpense = {
        id: Date.now().toString(),
        title: titleInput.value.trim(),
        amount: parseFloat(amountInput.value),
        category: categoryInput.value,
        date: dateInput.value
    };

    // Add to state (newest first)
    expenses.unshift(newExpense);
    saveExpenses();
    renderApp();

    // Reset Form
    expenseForm.reset();
    dateInput.value = new Date().toISOString().split('T')[0];
}

function deleteExpense(id) {
    expenses = expenses.filter(expense => expense.id !== id);
    saveExpenses();
    renderApp();
}

// --- UI Rendering ---
function renderApp() {
    const activeFilter = filterCategorySelect.value;
    const filteredExpenses = activeFilter === 'All' 
        ? expenses 
        : expenses.filter(item => item.category === activeFilter);

    renderDashboard();
    renderExpenseList(filteredExpenses);
    updateChart();
}

function renderDashboard() {
    const total = expenses.reduce((sum, item) => sum + item.amount, 0);
    const count = expenses.length;
    const average = count > 0 ? total / count : 0;

    totalExpensesEl.textContent = `₹${total.toFixed(2)}`;
    totalTransactionsEl.textContent = count;
    avgExpenseEl.textContent = `₹${average.toFixed(2)}`;
}

function formatDate(dateString) {
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-IN', options);
}

function renderExpenseList(itemsToRender) {
    expenseListContainer.innerHTML = '';

    if (itemsToRender.length === 0) {
        emptyStateEl.classList.remove('hidden');
        return;
    }

    emptyStateEl.classList.add('hidden');

    itemsToRender.forEach(expense => {
        const itemEl = document.createElement('div');
        itemEl.className = 'expense-item';
        itemEl.innerHTML = `
            <div class="expense-info">
                <span class="expense-title">${escapeHTML(expense.title)}</span>
                <div class="expense-meta">
                    <span class="badge">${escapeHTML(expense.category)}</span>
                    <span>${formatDate(expense.date)}</span>
                </div>
            </div>
            <div class="expense-right">
                <span class="expense-amount">₹${expense.amount.toFixed(2)}</span>
                <button class="btn-delete" aria-label="Delete ${escapeHTML(expense.title)}" onclick="deleteExpense('${expense.id}')">Delete</button>
            </div>
        `;
        expenseListContainer.appendChild(itemEl);
    });
}

// Security Helper to prevent HTML Injection
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- Chart Visualization ---
function updateChart() {
    if (expenses.length === 0) {
        chartCanvas.classList.add('hidden');
        chartEmptyStateEl.classList.remove('hidden');
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        return;
    }

    chartCanvas.classList.remove('hidden');
    chartEmptyStateEl.classList.add('hidden');

    // Aggregate totals by category
    const totalsByCategory = {};
    expenses.forEach(item => {
        totalsByCategory[item.category] = (totalsByCategory[item.category] || 0) + item.amount;
    });

    const labels = Object.keys(totalsByCategory);
    const data = Object.values(totalsByCategory);
    const backgroundColors = labels.map(cat => categoryColors[cat] || '#cbd5e1');

    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = data;
        chartInstance.data.datasets[0].backgroundColor = backgroundColors;
        chartInstance.update();
    } else {
        const ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: 'Inter', size: 12 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ₹${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// --- Event Listeners ---
expenseForm.addEventListener('submit', addExpense);
filterCategorySelect.addEventListener('change', renderApp);