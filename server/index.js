import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
    'http://localhost:5173', 
    'https://www.isandy.be', 
    'https://isandy.be',
    'http://isandy.be',
    'http://www.isandy.be'
];
app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl) 
        // or if origin matches our list
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes);

app.listen(PORT, () => {
    console.log(`✅ Werkuren API server running on http://localhost:${PORT}`);
});
