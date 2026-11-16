# Chromium ve gerekli sistem kütüphaneleri hazır gelen resmi Playwright imajı
# (sürüm package.json'daki playwright-core ile aynı olmalı)
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
