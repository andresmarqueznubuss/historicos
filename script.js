document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentUser;
    let allUsers = [];
    let reportGenerationController;

    // --- Report Definitions ---
    const reportes = {
        administrador: [
            "Reporte general canales y usuarios",
            "Cobro Tarifa SEBRA",
            "Delegados PKI Activos",
            "Usuarios Internos",
            "Usuarios Proveedores",
            "Usuarios por Rol"
        ],
                colaborador: ["Reporte de Entidad"]
    };

    // --- DOM Elements ---
    const reportTypeSelect = document.getElementById('report-type');
    const environmentSelect = document.getElementById('environment');
    const executionDateSelect = document.getElementById('execution-date');
    const consultarFechasBtn = document.getElementById('consultar-fechas');
    const reportForm = document.getElementById('report-form');
    const reportResultsDiv = document.getElementById('report-results');
    const generarReporteBtn = document.getElementById('generar-reporte');
    const reportTitle = document.getElementById('report-title');
    const currentUsernameSpan = document.getElementById('current-username');
    const userDropdownToggle = document.getElementById('user-dropdown-toggle');
    const userDropdownContent = document.getElementById('user-dropdown-content');
    const loadingOverlay = document.getElementById('loading-overlay');
    const cancelReportBtn = document.getElementById('cancel-report-generation');
    const reportDescription = document.getElementById('report-description');

    // --- Initialization ---
    async function loadUsersAndInitialize() {
        try {
            const response = await fetch('usuarios.json');
            if (!response.ok) throw new Error('Could not load users.');
            allUsers = await response.json();
            
            if (allUsers.length > 0) {
                currentUser = allUsers[0]; // Set default user
            } else {
                currentUser = { usr: 'Sin Usuario', perfil: '', organizacion: '' };
            }
            
            initialize();

        } catch (error) {
            console.error("Failed to load users:", error);
            currentUsernameSpan.textContent = "Error al cargar";
        }
    }

    function initialize() {
        updateCurrentUserDisplay();
        populateUserDropdown();
        setupEventListeners();
        updateUIForUserRole();
    }

    function setupEventListeners() {
        reportTypeSelect.addEventListener('change', handleFilterChange);
        environmentSelect.addEventListener('change', handleFilterChange);
        executionDateSelect.addEventListener('change', handleDateSelectionChange);
        consultarFechasBtn.addEventListener('click', handleConsultarFechas);
        reportForm.addEventListener('submit', handleGenerarReporte);
        userDropdownToggle.addEventListener('click', () => {
            userDropdownToggle.classList.toggle('active');
        });
        cancelReportBtn.addEventListener('click', () => {
            if (reportGenerationController) {
                reportGenerationController.abort();
            }
        });
    }

    // --- User Management ---
    function updateCurrentUserDisplay() {
        if (currentUser) {
            currentUsernameSpan.textContent = currentUser.usr;
        }
    }

    function populateUserDropdown() {
        userDropdownContent.innerHTML = allUsers
            .map(user => `<a href="#" data-user="${user.usr}">${user.usr} (${user.perfil})</a>`)
            .join('');
        
        userDropdownContent.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                switchUser(e.target.dataset.user);
                userDropdownToggle.classList.remove('active');
            });
        });
    }

    function switchUser(username) {
        const newUser = allUsers.find(u => u.usr === username);
        if (newUser) {
            currentUser = newUser;
            updateCurrentUserDisplay();
            resetDateSelection();
            updateUIForUserRole();
        }
    }

    // --- UI Update & Form Logic ---
    function updateUIForUserRole() {
        populateReportDropdown();
        if (currentUser.perfil === 'colaborador') {
            reportDescription.innerHTML = `Utilice el siguiente formulario para generar un reporte historico de todos los usuarios asociados a su entidad: <strong>${currentUser.organizacion}</strong>.`;
            reportTypeSelect.parentElement.style.display = 'none';
        } else {
            reportDescription.innerHTML = `Utilice el siguiente formulario para generar un reporte historico del tipo seleccionado en el primer filtro.`;
            reportTypeSelect.parentElement.style.display = 'block';
        }
        updateConsultarFechasButtonState();
    }

    function populateReportDropdown() {
        const userReports = reportes[currentUser.perfil] || [];
        if (currentUser.perfil === 'colaborador') {
            reportTypeSelect.innerHTML = `<option value="Reporte de Entidad" selected>Reporte de Entidad</option>`;
        } else {
            reportTypeSelect.innerHTML = userReports
                .map(report => `<option value="${report}">${report}</option>`)
                .join('');
            reportTypeSelect.insertAdjacentHTML('afterbegin', '<option value="" selected disabled>-- Seleccione un reporte --</option>');
        }
    }

    function handleFilterChange() {
        updateConsultarFechasButtonState();
        resetDateSelection();
    }

    function handleDateSelectionChange() {
        generarReporteBtn.disabled = !executionDateSelect.value;
    }

    async function handleConsultarFechas() {
        consultarFechasBtn.disabled = true;
        consultarFechasBtn.textContent = 'Consultando...';

        const selectedReport = reportTypeSelect.value;
        const selectedEnv = environmentSelect.value;
        const userOrganization = currentUser.organizacion;

        // For collaborators, the report name is "Reporte de Entidad" and the entity is their organization.
        const reportNameForQuery = selectedReport;
        const entidadForQuery = userOrganization;

        const url = `https://backend-historicos.vercel.app/api/report-dates?entidad=${encodeURIComponent(entidadForQuery)}&reporte=${encodeURIComponent(reportNameForQuery)}&ambiente=${encodeURIComponent(selectedEnv)}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const dates = await response.json();
            populateDateDropdown(dates);
        } catch (error) {
            console.error('Error fetching dates:', error);
            alert('Error al consultar las fechas de ejecución.');
            populateDateDropdown([]);
        } finally {
            consultarFechasBtn.textContent = 'Consultar Fechas';
            updateConsultarFechasButtonState();
        }
    }

    function populateDateDropdown(dates) {
        executionDateSelect.innerHTML = '';
        if (!dates || dates.length === 0) {
            executionDateSelect.innerHTML = '<option value="">No hay consultas disponibles</option>';
            executionDateSelect.disabled = true;
            return;
        }

        executionDateSelect.innerHTML = '<option value="">-- Seleccione una fecha --</option>';
        executionDateSelect.innerHTML += dates
            .map(date => `<option value="${date.EjecucionID}">${date.EjecucionID_Fecha}</option>`)
            .join('');
        executionDateSelect.disabled = false;
    }

    async function handleGenerarReporte(event) {
        event.preventDefault();
        reportGenerationController = new AbortController();
        const signal = reportGenerationController.signal;

        const selectedReportName = reportTypeSelect.value;
        const selectedExecutionId = executionDateSelect.value;
        const selectedExecutionDateText = executionDateSelect.options[executionDateSelect.selectedIndex].text;

        if (!selectedExecutionId) {
            alert('Por favor, seleccione una fecha de ejecución.');
            return;
        }
        
        generarReporteBtn.disabled = true;
        loadingOverlay.style.display = 'flex';
        reportResultsDiv.innerHTML = ''; // Clear previous results

        try {
            const response = await fetch(`https://backend-historicos.vercel.app/api/report-data/${selectedExecutionId}`, { signal });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const reportData = await response.json();
            
            // The report name is simply the selected one. 
            // For collaborators, this will be "Reporte de Entidad".
            const finalReportName = selectedReportName;

            displayReportData(reportData, finalReportName, selectedExecutionId, selectedExecutionDateText);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Report generation was canceled by the user.');
                reportTitle.textContent = 'Generación de reporte cancelada.';
            } else {
                console.error('Error fetching report data:', error);
                alert('Error al generar el reporte.');
                reportResultsDiv.innerHTML = '<p class="error">Error al generar el reporte. Por favor, intente de nuevo.</p>';
            }
        } finally {
            generarReporteBtn.disabled = false;
            loadingOverlay.style.display = 'none';
        }
    }
    
    // --- UI Update Functions ---
    function updateConsultarFechasButtonState() {
        if (currentUser.perfil === 'colaborador') {
            consultarFechasBtn.disabled = !environmentSelect.value;
        } else {
            consultarFechasBtn.disabled = !reportTypeSelect.value || !environmentSelect.value;
        }
    }

    function resetDateSelection() {
        executionDateSelect.innerHTML = '<option value="">-- Seleccione una fecha --</option>';
        executionDateSelect.disabled = true;
        generarReporteBtn.disabled = true;
        reportResultsDiv.innerHTML = '';
        reportTitle.textContent = '';
    }

    // --- Data Display and Export ---
    function displayReportData(data, reportName, executionId, executionDateText) {
        reportTitle.textContent = reportName;
        if (!data || data.length === 0) {
            reportResultsDiv.innerHTML = '<p>No hay datos para mostrar.</p>';
            return;
        }

        const headers = Object.keys(data[0]);
        const table = `
            <div class="card-glass mt-3">
                <div class="text-right mb-3">
                    <button class="btn btn-sm btn-primary" id="download-excel">Descargar Excel</button>
                    <button class="btn btn-sm btn-danger" id="download-pdf">Descargar PDF</button>
                    <button class="btn btn-sm btn-success" id="download-csv">Descargar CSV</button>
                </div>
                <div class="table-responsive">
                    <table class="table table-bordered table-hover">
                        <thead>
                            <tr>
                                ${headers.map(h => `<th>${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${headers.map(h => `<td>${row[h]}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        reportResultsDiv.innerHTML = table;

        document.getElementById('download-csv').addEventListener('click', () => downloadCSV(data, reportName, executionId, executionDateText));
        document.getElementById('download-excel').addEventListener('click', () => downloadExcel(data, reportName, executionId, executionDateText));
        document.getElementById('download-pdf').addEventListener('click', () => downloadPDF(data, reportName, executionId, executionDateText));
    }
    
    function downloadCSV(data, reportName, executionId, executionDateText) {
        const headers = Object.keys(data[0]);
        const csvRows = [
            headers.join(','),
            ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))
        ];
        
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const filename = `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}-${executionId.split(' ')[0]}-${executionDateText.split(' ')[1] || executionDateText.split(' ')[0]}.csv`;
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function downloadExcel(data, reportName, executionId, executionDateText) {
        if (typeof XLSX === 'undefined') {
            alert('La librería para Excel no está cargada.');
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
        const filename = `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}-${executionId.split(' ')[0]}-${executionDateText.split(' ')[1] || executionDateText.split(' ')[0]}.xlsx`;
        XLSX.writeFile(workbook, filename);
    }

    async function downloadPDF(data, reportName, executionId, executionDateText) {
        if (typeof window.jspdf === 'undefined') {
            alert('La librería para PDF no está cargada.');
            return;
        }
        const { jsPDF } = window.jspdf;

        // Fetch logo and convert to base64
        const logoUrl = 'https://d1b4gd4m8561gs.cloudfront.net/sites/default/files/inline-images/brc-principal_1.png';
        let logoBase64 = '';
        try {
            const response = await fetch(logoUrl);
            const blob = await response.blob();
            logoBase64 = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Error loading logo for PDF:', error);
            // Continue without logo if it fails
        }

        const doc = new jsPDF('l', 'pt', 'a4'); // 'l' for landscape

        // --- START: OPTIMIZATION LOGIC ---
        const originalHeaders = Object.keys(data[0]);
        const nonEmptyColumns = new Set();

        // Find all columns that have at least one non-empty value
        for (const header of originalHeaders) {
            if (data.some(row => row[header] !== null && row[header] !== undefined && row[header] !== '')) {
                nonEmptyColumns.add(header);
            }
        }

        // Filter headers and body based on non-empty columns
        const filteredHeaders = originalHeaders.filter(h => nonEmptyColumns.has(h));
        const filteredBody = data.map(row => filteredHeaders.map(h => row[h]));
        // --- END: OPTIMIZATION LOGIC ---

        const generationDate = new Date().toLocaleDateString();

        doc.autoTable({
            head: [filteredHeaders], // Use filtered headers
            body: filteredBody,     // Use filtered body
            startY: 70, // Start content lower to make space for header
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, overflow: 'linebreak', halign: 'left', valign: 'middle' }, // Reduced font size
            headStyles: { fillColor: [212, 160, 23], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            bodyStyles: { textColor: [0, 0, 0] },
            didDrawPage: function (data) {
                // Logo (top-left)
                if (logoBase64) {
                    doc.addImage(logoBase64, 'PNG', 40, 20, 50, 20); // x, y, width, height
                }

                // Report Title (top-right)
                doc.setFontSize(12);
                doc.setTextColor(40);
                doc.text(reportName, doc.internal.pageSize.getWidth() - 40, 30, { align: 'right' });

                // Generation Date (below title)
                doc.setFontSize(9);
                doc.setTextColor(100);
                doc.text(`Fecha de Generación: ${generationDate}`, doc.internal.pageSize.getWidth() - 40, 45, { align: 'right' });

                // Page number (bottom-right)
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Página ${data.pageNumber} de ${doc.internal.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 30, { align: 'right' });
            }
        });
        const filename = `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}-${executionId.split(' ')[0]}-${executionDateText.split(' ')[1] || executionDateText.split(' ')[0]}.pdf`;
        doc.save(filename);
    }

    // --- Initialize the app ---
    loadUsersAndInitialize();
});