# Point of Sale (POS) System

A modern, full-featured Point of Sale (POS) web application built with React, Vite, and Firebase. Designed for restaurants and retail businesses with multi-role management (Owner, Admin, Staff), real-time ordering, takeaway/delivery management, and analytics.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd POS
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the `.env.example` file to create your local `.env` file:
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

## 🛠 Tech Stack

- **Frontend:** React, Vite, React Router, TailwindCSS / CSS Modules
- **Backend & Database:** Firebase Auth, Cloud Firestore, Firebase Storage
- **Functions:** Firebase Cloud Functions

