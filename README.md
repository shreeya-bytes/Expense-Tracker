# 💰 Personal Expense Tracker

A clean, modern, and lightweight web-based Expense Tracker application built with semantic HTML5, modern CSS3, and modern Vanilla JavaScript. This application enables users to track, categorize, and visualize personal financial transactions directly in the browser.

## 🚀 Features

- **Dashboard Summary**: Real-time summary cards displaying Total Spent, Total Transactions, and Average Expense.
- **Add Transactions**: Input expense title, amount, category, and date with strict client-side validation.
- **Categorization**: Organize spending across Food, Transport, Shopping, Bills, Entertainment, Education, Health, and Other.
- **Expense Visualization**: Dynamic Chart.js doughnut chart rendering real-time spending distributions per category.
- **Category Filtering**: Instant list filtering by selected categories.
- **Persistent Data**: Stores all expense items in browser `localStorage` to preserve records across browser refreshes.
- **Responsive Design**: Designed to work across mobile devices, tablets, and desktop computers.

## 🛠️ Technologies Used

- **HTML5**: Semantic document structure and accessible forms.
- **CSS3**: Custom CSS design tokens, flexbox/grid layout systems, responsive media queries.
- **JavaScript (ES6+)**: Modular application logic, DOM manipulation, state calculation, data management.
- **Chart.js (CDN)**: Lightweight charting library for category distribution graphs.
- **LocalStorage API**: In-browser key-value persistence layer.

## 📁 Project Structure

```text
expense-tracker/
│
├── index.html    # Main layout structure, accessible forms, and UI sections
├── style.css     # CSS styling, design system variables, and responsive layout rules
├── script.js    # Data state management, validation logic, LocalStorage, and Chart.js integration
└── README.md     # Comprehensive project documentation