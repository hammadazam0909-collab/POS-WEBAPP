# 🛒 POSparrow — Point of Sale & Restaurant Management System

A modern, full-stack Point of Sale (POS) web application built with **React**, **Vite**, and **Firebase**. Designed for restaurants and retail businesses with multi-role management (Owner, Admin, Kitchen Staff), real-time order tracking, table management, takeaway/delivery processing, inventory tracking, and sales analytics.

🌐 **Live Demo Website**: [https://posparrow.com/](https://posparrow.com/)

---

## 🌐 Live Demo & Account Credentials

You can test the application directly on the live website **[posparrow.com](https://posparrow.com/)** or by running it locally using the following credentials:

| Role / Portal | Login Route | Field 1 | Field 2 | Field 3 / PIN |
| :--- | :--- | :--- | :--- | :--- |
| **Restaurant Login** | `/` | **Restaurant ID**: `demo` | **Password**: `demo123` | — |
| **Owner Portal** | `/select-role` ➔ Owner | — | — | **Owner PIN**: `1234` |
| **Kitchen Display (KDS)** | `/select-role` ➔ Kitchen | — | — | *Direct Access* |

---

## 📖 How to Use

### 1. Restaurant Login
1. Open the application (**[posparrow.com](https://posparrow.com/)** or `http://localhost:5173`).
2. Enter **Restaurant ID**: `demo` and **Password**: `demo123`.
3. Click **🚀 Continue** to proceed to the Role Selection screen.

### 2. Kitchen Display System (KDS)
1. Select **👨‍🍳 Kitchen Display** from the Role Selection screen.
2. View incoming orders in real-time with automatic sound notifications when a new order arrives.
3. Update order statuses (e.g., *Preparing* ➔ *Ready* ➔ *Completed*).

### 3. Owner & Manager Dashboard
1. Select **👑 Owner Portal** from the Role Selection screen.
2. Enter the **4-digit Owner PIN** (default: `1234`).
3. Access full restaurant management modules:
   - **POS Checkout & Billing**: Create new orders, manage table layout, process cash/card payments, apply discounts, and generate receipts.
   - **Takeaway & Delivery**: Manage online & phone orders with live status tracking.
   - **Menu & Inventory**: Add menu items, categories, pricing, stock levels, and vendor management.
   - **Staff & Payroll**: Track staff attendance, work hours, and calculate payroll.
   - **Analytics & Reports**: Visual graphs of daily revenue, top-selling items, peak hours, and order history.

### 4. Admin Management Panel
1. Click **🔐 Admin Panel** on the main login screen (or navigate to `/admin`).
2. Login with super-admin credentials.
3. Create new restaurant accounts, manage subscription plans, toggle feature access, and monitor platform payments.

---

## 🖼 System Architecture & Feature Overview

```
                          ┌───────────────────────────┐
                          │   POSparrow App System    │
                          └─────────────┬─────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  Restaurant Login    │    │ Kitchen Display (KDS)│    │   Admin Panel        │
│  - Rest ID & Pass    │    │ - Real-time Tickets  │    │ - Create Restaurants │
└──────────┬───────────┘    │ - Sound Alerts       │    │ - Plan Subscriptions │
           │                └──────────────────────┘    └──────────────────────┘
           ▼
┌──────────────────────┐
│ Owner Portal (PIN)   │
├──────────────────────┤
│ 🛒 POS & Billing     │
│ 🍽 Table Management  │
│ 📦 Takeaway & Delivery│
│ 📋 Menu & Inventory  │
│ 📊 Sales Analytics   │
└──────────────────────┘
```

---

## 🛠 Tech Stack

- **Frontend Framework:** React 18, Vite
- **Routing:** React Router v6
- **Database & Backend:** Firebase Cloud Firestore (Real-time sync & offline persistence)
- **Authentication:** Firebase Auth & Firestore Session Verification
- **Cloud Infrastructure:** Firebase Cloud Functions & Storage
- **Styling:** CSS3, Glassmorphism UI, Responsive Design

---

## 🚀 Getting Started Locally

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hammadazam0909-collab/POS-WEBAPP.git
   cd POS-WEBAPP
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to create your local `.env` file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your Firebase configuration parameters:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 📄 License

This project is licensed under the MIT License — feel free to use it for demonstration and job applications.
