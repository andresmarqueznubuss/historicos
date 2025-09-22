@echo off
set ZIP_NAME="backend.zip"
set FILES=".env",".gitignore","package.json","package-lock.json","server.js"
set RESOURCE_GROUP="iga-historicos_group"
set APP_NAME="iga-historicos"

echo 📦 Empaquetando archivos clave...

powershell -command "Compress-Archive -Path %FILES% -DestinationPath %ZIP_NAME% -Force"

echo 🚀 Desplegando a Azure App Service...

az webapp deployment source config-zip --resource-group %RESOURCE_GROUP% --name %APP_NAME% --src %ZIP_NAME%

echo ✅ Despliegue completado.