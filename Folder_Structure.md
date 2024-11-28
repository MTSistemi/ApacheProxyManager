apache-proxy-manager/
├── docker-compose.yml
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.js
│   │   │   ├── Footer.js
│   │   │   ├── LoginForm.js
│   │   │   ├── Dashboard.js
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── HomePage.js
│   │   │   ├── LoginPage.js
│   │   │   ├── DashboardPage.js
│   │   │   └── ...
│   │   ├── App.js
│   │   ├── index.js
│   │   ├── package.json
│   │   └── ...
│   └── .env
├── backend/
│   ├── config/
│   │   ├── db.config.js
│   │   ├── auth.config.js
│   │   └── ...
│   ├── controllers/
│   │   ├── proxy.controller.js
│   │   ├── user.controller.js
│   │   └── ...
│   ├── models/
│   │   ├── Proxy.js
│   │   ├── User.js
│   │   └── ...
│   ├── routes/
│   │   ├── proxy.routes.js
│   │   ├── auth.routes.js
│   │   └── ...
│   ├── middlewares/
│   │   ├── auth.middleware.js
│   │   └── ...
│   ├── services/
│   │   ├── cert.service.js
│   │   └── ...
│   ├── app.js
│   ├── server.js
│   └── package.json
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── ...
├── .env
└── README.md
