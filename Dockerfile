# Aligne bien la version Playwright avec la lib npm
FROM mcr.microsoft.com/playwright:v1.55.0-jammy
WORKDIR /app

# Si tu n'as PAS de package-lock.json, ne copie que package.json
COPY package.json ./
# Utilise npm install (pas ci)
RUN npm install --omit=dev --no-audit --no-fund

# Le reste du code
COPY . .
EXPOSE 3000
CMD ["node","cartfiller.js"]
