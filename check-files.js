import fs from 'node:fs';

const appJs = fs.readFileSync('C:/Users/Kaito/.gemini/antigravity/scratch/valorant-shop-viewer/public/js/app.js', 'utf8');
const countApp = (appJs.match(/\uFFFD/g) || []).length;
console.log('app.js replacement chars count:', countApp);

const styleCss = fs.readFileSync('C:/Users/Kaito/.gemini/antigravity/scratch/valorant-shop-viewer/public/css/style.css', 'utf8');
const countCss = (styleCss.match(/\uFFFD/g) || []).length;
console.log('style.css replacement chars count:', countCss);

const serverJs = fs.readFileSync('C:/Users/Kaito/.gemini/antigravity/scratch/valorant-shop-viewer/server.js', 'utf8');
const countServer = (serverJs.match(/\uFFFD/g) || []).length;
console.log('server.js replacement chars count:', countServer);
