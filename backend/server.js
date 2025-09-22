require('dotenv').config();
console.log(`DB_PASSWORD length: ${process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0}`);
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 8080; // Force port 8080 for Azure App Service

// Middleware
app.use((req, res, next) => {
    console.log(`--- New Request Received: ${req.method} ${req.url} ---`);
    next();
});
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.static(path.join(__dirname, 'public')));

// Database configuration
const dbConfig = {
    user: 'sailpointbr-admin',
    password: process.env.DB_PASSWORD, // IMPORTANT: In a real application, use environment variables for credentials
    server: 'sailpointbr-sqlserver.database.windows.net',
    database: 'sailpointbr-sqldb',
    options: {
        encrypt: true, // Use true for Azure SQL Database, false for local SQL Server
        trustServerCertificate: false // Change to true for local dev / self-signed certs
    }
};

// Log the DB config without the password for security
const { password, ...dbConfigForLogging } = dbConfig;
console.log('Database configuration:', JSON.stringify(dbConfigForLogging, null, 2));

// Create a single connection pool
const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect();

pool.on('error', err => {
    console.error('SQL Pool Error:', JSON.stringify(err, null, 2));
});

// Basic API endpoint
app.get('/api/reports', async (req, res) => {
    console.log('--- Handling Request: GET /api/reports ---');
    console.log('Request details:', { headers: req.headers, body: req.body });
    try {
        await poolConnect; // Ensure pool is connected
        console.log('Executing query for /api/reports...');
        const query = 'SELECT GETDATE() as currentTime';
        const result = await pool.request().query(query);
        console.log('Query executed successfully for /api/reports.');
        console.log('Query result:', result.recordset);
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error in /api/reports:', JSON.stringify(err, null, 2));
        res.status(500).send(err.message);
    }
});

// API endpoint for report data
app.get('/api/report-data/:executionId', async (req, res) => {
    const { executionId } = req.params;
    // The executionId from the frontend might be padded with spaces or combined with the date.
    // We extract just the numeric part.
    const numericExecutionId = parseInt(executionId.trim().split(' ')[0], 10);

    console.log(`--- Handling Request: GET /api/report-data/${numericExecutionId} ---`);
    console.log('Request details:', { headers: req.headers, body: req.body, params: req.params });

    if (isNaN(numericExecutionId)) {
        return res.status(400).send('Invalid Execution ID format.');
    }

    try {
        await poolConnect; // Ensure pool is connected
        console.log(`Executing query for /api/report-data/${numericExecutionId}...`);
        const query = `
            SELECT t1.*, t2.*
            FROM dbo.DatosReportes t1
            JOIN dbo.EjecucionesReportes t2 ON t1.EjecucionID = t2.EjecucionID
            WHERE t1.EjecucionID = @executionId;
        `;
        const result = await pool.request()
            .input('executionId', sql.Int, numericExecutionId) // Use sql.Int for the ID
            .query(query);
            
        console.log('Query executed successfully for /api/report-data.');
        console.log('Query result record count:', result.recordset.length);
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error fetching report data', JSON.stringify(err, null, 2));
        res.status(500).send(err.message);
    }
});

// API endpoint for fetching report execution dates
app.get('/api/report-dates', async (req, res) => {
    const { entidad, reporte, ambiente } = req.query;
    console.log(`--- Handling Request: GET /api/report-dates ---`);
    console.log('Request query params:', req.query);

    if (!entidad || !reporte || !ambiente) {
        return res.status(400).send('Missing required query parameters: entidad, reporte, ambiente');
    }

    try {
        await poolConnect; // Ensure pool is connected
        console.log('Executing query for /api/report-dates...');
        const query = `
            SELECT DISTINCT 
                t1.EjecucionID,
                FORMAT(t1.EjecucionID, '000') + ' ' + CONVERT(VARCHAR, t2.FechaEjecucion, 23) AS EjecucionID_Fecha
            FROM dbo.DatosReportes t1
            JOIN dbo.EjecucionesReportes t2 ON t1.EjecucionID = t2.EjecucionID
            WHERE t1.Entidad_Organizacion = @entidad
              AND t2.NombreReporte = @reporte
              AND t1.Ambiente = @ambiente
            ORDER BY EjecucionID_Fecha DESC;`; 

        const result = await pool.request()
            .input('entidad', sql.VarChar, entidad)
            .input('reporte', sql.VarChar, reporte)
            .input('ambiente', sql.VarChar, ambiente)
            .query(query);
        
        // The frontend expects an object with EjecucionID and EjecucionID_Fecha
        const dates = result.recordset.map(row => ({
            EjecucionID: row.EjecucionID,
            EjecucionID_Fecha: row.EjecucionID_Fecha
        }));

        console.log('Query executed successfully for /api/report-dates.');
        console.log('Query result:', dates);
        res.json(dates);
    } catch (err) {
        console.error('SQL error in /api/report-dates:', JSON.stringify(err, null, 2));
        res.status(500).send(err.message);
    }
});

// Start the server
app.listen(port, async () => {
    try {
        await poolConnect;
        console.log('Connected to SQL Server');
        console.log(`Backend server listening at http://localhost:${port}`);
    } catch (err) {
        console.error('Failed to connect to SQL Server:', JSON.stringify(err, null, 2));
    }
});